#!/bin/sh
# Exercises release-linkar.sh against a fake curl: argument validation, the
# web-before-worker order, and that a web release which never becomes healthy
# never touches the worker.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_script="$script_dir/release-linkar.sh"

if [ ! -f "$source_script" ]; then
  echo "release-linkar.sh is missing" >&2
  exit 1
fi

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
mkdir -p "$test_dir/bin" "$test_dir/config" "$test_dir/state"

sha=0123456789abcdef0123456789abcdef01234567

printf '%s\n' 'test-api-key' > "$test_dir/config/api-key"
printf '%s\n' 'test-health-token' > "$test_dir/config/linkar-health-token"
cat > "$test_dir/config/linkar.env" <<EOF
LINKAR_WEB_APPLICATION_ID=web-app
LINKAR_WORKER_APPLICATION_ID=worker-app
LINKAR_RELEASE_TIMEOUT=2
LINKAR_RELEASE_POLL=1
EOF

# Fake curl: records every call; deploys flip state files that the fake
# health endpoint reports, unless WEB_NEVER_HEALTHY is set.
cat > "$test_dir/bin/curl" <<EOF
#!/bin/sh
state="$test_dir/state"
url=""
data=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    -d) data=\$2; shift 2 ;;
    -H|-X|--max-time) shift 2 ;;
    -*) shift ;;
    *) url=\$1; shift ;;
  esac
done
printf '%s %s\n' "\$url" "\$data" >> "\$state/calls"
case "\$url" in
  */application.deploy)
    case "\$data" in
      *web-app*) [ -n "\${WEB_NEVER_HEALTHY:-}" ] || touch "\$state/web" ;;
      *worker-app*) touch "\$state/worker" ;;
    esac
    ;;
  */api/health)
    web=old; worker=old
    [ -f "\$state/web" ] && web=$sha
    [ -f "\$state/worker" ] && worker=$sha
    printf '{"status":"ok","mode":"configured","release":"%s","dependencies":{},"worker":{"heartbeat":"ok","release":"%s"}}' "\$web" "\$worker"
    ;;
esac
EOF
chmod 700 "$test_dir/bin/curl"

run_release() {
  PATH="$test_dir/bin:$PATH" LINKAR_RELEASE_CONFIG_DIR="$test_dir/config" sh "$source_script" "$@"
}

reset_state() {
  rm -f "$test_dir/state/"*
  : > "$test_dir/state/calls"
}

for bad in "" "abc" "0123456789ABCDEF0123456789ABCDEF01234567" "${sha}0"; do
  reset_state
  if run_release "$bad" >/dev/null 2>&1; then
    echo "unexpected success for commit '$bad'" >&2
    exit 1
  fi
  if [ -s "$test_dir/state/calls" ]; then
    echo "invalid commit '$bad' reached the Dokploy API" >&2
    exit 1
  fi
done

# Happy path: web is deployed and verified before the worker is touched.
reset_state
run_release "$sha" >/dev/null
first_call=$(head -n 1 "$test_dir/state/calls")
test "$first_call" = "http://localhost:3000/api/application.saveDockerProvider {\"applicationId\":\"web-app\",\"dockerImage\":\"ghcr.io/linkar0912/main:sha-$sha\"}"
web_deploy=$(grep -n 'application.deploy.*web-app' "$test_dir/state/calls" | cut -d: -f1)
web_health=$(grep -n "api/health" "$test_dir/state/calls" | head -n 1 | cut -d: -f1)
worker_image=$(grep -n 'saveDockerProvider.*worker-app' "$test_dir/state/calls" | cut -d: -f1)
worker_deploy=$(grep -n 'application.deploy.*worker-app' "$test_dir/state/calls" | cut -d: -f1)
test "$web_deploy" -lt "$web_health"
test "$web_health" -lt "$worker_image"
test "$worker_image" -lt "$worker_deploy"
grep -q "worker-app\",\"dockerImage\":\"ghcr.io/linkar0912/main:sha-$sha\"" "$test_dir/state/calls"

# A web release that never reports the commit stops before the worker.
reset_state
if WEB_NEVER_HEALTHY=1 run_release "$sha" >/dev/null 2>&1; then
  echo "release succeeded although the web never became healthy" >&2
  exit 1
fi
if grep -q 'worker-app' "$test_dir/state/calls"; then
  echo "worker was touched although the web never became healthy" >&2
  exit 1
fi

echo "release-linkar tests passed"
