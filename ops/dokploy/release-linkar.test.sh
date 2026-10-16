#!/bin/sh
# Exercises release-linkar.sh against fake curl, docker and flock: argument
# validation, migrations before the web, the web before the worker, a failed
# migration that moves nothing, a web release that never becomes healthy and
# never touches the worker, and the Compose .env rewrite.
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_script="$script_dir/release-linkar.sh"

if [ ! -f "$source_script" ]; then
  echo "release-linkar.sh is missing" >&2
  exit 1
fi
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
mkdir -p "$test_dir/bin" "$test_dir/config" "$test_dir/state" "$test_dir/compose"

sha=0123456789abcdef0123456789abcdef01234567
state="$test_dir/state"

printf '%s\n' 'test-api-key' > "$test_dir/config/api-key"
printf 'services: {}\n' > "$test_dir/compose/docker-compose.yml"

# Fake curl: records every call. A web deploy makes the fake health endpoint
# report the commit, unless WEB_NEVER_HEALTHY is set; compose.one answers the
# Compose with its environment.
cat > "$test_dir/bin/curl" <<EOF
#!/bin/sh
url=""
data=""
while [ "\$#" -gt 0 ]; do
  case "\$1" in
    --data-binary|--data-urlencode) data=\$2; shift 2 ;;
    -H|-X|--max-time|--retry) shift 2 ;;
    -*) shift ;;
    *) url=\$1; shift ;;
  esac
done
printf 'curl %s %s\n' "\$url" "\$data" >> "$state/calls"
case "\$url" in
  */application.deploy) [ -n "\${WEB_NEVER_HEALTHY:-}" ] || touch "$state/web" ;;
  */compose.one) printf '%s' '{"composeId":"compose-1","env":"DIRECT_URL=postgres://direct\nLINKAR_IMAGE_TAG=sha-old\nCOMPOSE_PROJECT_NAME=linkar-production-test"}' ;;
  */api/health)
    release=old
    [ -f "$state/web" ] && release=$sha
    printf '{"status":"ok","release":"%s","dependencies":{"database":"ok","redis":"ok"}}' "\$release"
    ;;
esac
EOF

# Fake docker: records each call with the LINKAR_IMAGE_TAG it ran with. The
# migrate run fails when MIGRATE_FAILS is set; the worker is healthy once up.
cat > "$test_dir/bin/docker" <<EOF
#!/bin/sh
printf 'docker tag=%s %s\n' "\${LINKAR_IMAGE_TAG:-}" "\$*" >> "$state/calls"
case "\$*" in
  *" run --rm -T migrate"*) [ -z "\${MIGRATE_FAILS:-}" ] || exit 1 ;;
  *" up -d --no-deps worker"*) touch "$state/worker" ;;
  "inspect "*) [ -f "$state/worker" ] && echo healthy || echo starting ;;
esac
exit 0
EOF

# flock is Linux-only, and macOS chown/chmod have no --reference.
printf '#!/bin/sh\nexit 0\n' > "$test_dir/bin/flock"
printf '#!/bin/sh\nexit 0\n' > "$test_dir/bin/chown"
printf '#!/bin/sh\nexit 0\n' > "$test_dir/bin/chmod"
chmod 700 "$test_dir/bin/"*

run_release() {
  PATH="$test_dir/bin:$PATH" \
    LINKAR_RELEASE_CONFIG_DIR="$test_dir/config" \
    DOKPLOY_API_URL="http://dokploy.test/api" \
    LINKAR_WEB_APPLICATION_ID="web-app" \
    LINKAR_COMPOSE_ID="compose-1" \
    LINKAR_COMPOSE_DIR="$test_dir/compose" \
    LINKAR_WORKER_CONTAINER="worker-1" \
    LINKAR_HEALTH_URL="https://app.test/api/health" \
    LINKAR_RELEASE_LOCK="$test_dir/lock" \
    LINKAR_RELEASE_POLL=0 \
    LINKAR_WEB_CHECKS=6 \
    LINKAR_WORKER_CHECKS=3 \
    sh "$source_script" "$@"
}

reset_state() {
  rm -f "$state/"*
  : > "$state/calls"
  printf 'DIRECT_URL=postgres://direct\nLINKAR_IMAGE_TAG=sha-old\nCOMPOSE_PROJECT_NAME=linkar-production-test\n' > "$test_dir/compose/.env"
}

line_of() {
  grep -n -- "$1" "$state/calls" | head -n 1 | cut -d: -f1
}

for bad in "" "abc" "0123456789ABCDEF0123456789ABCDEF01234567" "${sha}0"; do
  reset_state
  if run_release "$bad" >/dev/null 2>&1; then
    echo "unexpected success for commit '$bad'" >&2
    exit 1
  fi
  if [ -s "$state/calls" ]; then
    echo "invalid commit '$bad' reached Dokploy or Docker" >&2
    exit 1
  fi
done

# Happy path: migrations on the release image, then the web, verified, then
# the worker.
reset_state
run_release "$sha" >/dev/null
migrate_pull=$(line_of "docker tag=sha-$sha compose .*--profile migration pull migrate")
migrate_run=$(line_of "docker tag=sha-$sha compose .*--profile migration run --rm -T migrate")
web_update=$(line_of "application.update")
web_deploy=$(line_of "application.deploy")
web_health=$(line_of "api/health")
compose_update=$(line_of "compose.update")
worker_up=$(line_of "up -d --no-deps worker")
for step in "$migrate_pull" "$migrate_run" "$web_update" "$web_deploy" "$web_health" "$compose_update" "$worker_up"; do
  [ -n "$step" ] || { echo "a release step did not run" >&2; cat "$state/calls" >&2; exit 1; }
done
test "$migrate_pull" -lt "$migrate_run"
test "$migrate_run" -lt "$web_update"
test "$web_update" -lt "$web_deploy"
test "$web_deploy" -lt "$web_health"
test "$web_health" -lt "$compose_update"
test "$compose_update" -lt "$worker_up"
grep -q "application.update {\"applicationId\":\"web-app\",\"sourceType\":\"docker\",\"dockerImage\":\"ghcr.io/linkar0912/main:sha-$sha\",\"registryUrl\":\"ghcr.io\"}" "$state/calls"
# Every Compose call carries the .env, which names the project.
if grep '^docker tag=' "$state/calls" | grep ' compose ' | grep -v -q -- "--env-file $test_dir/compose/.env"; then
  echo "a docker compose call ran without the Compose .env" >&2
  exit 1
fi
# The saved environment has exactly one image tag, the new one, and keeps the
# rest (command substitution drops the trailing newline, as on the host).
grep -q "compose.update {\"composeId\":\"compose-1\",\"env\":\"DIRECT_URL=postgres://direct\\\\nCOMPOSE_PROJECT_NAME=linkar-production-test\\\\nLINKAR_IMAGE_TAG=sha-$sha\"}" "$state/calls"
test "$(grep -c '^LINKAR_IMAGE_TAG=' "$test_dir/compose/.env")" -eq 1
grep -q "^LINKAR_IMAGE_TAG=sha-$sha\$" "$test_dir/compose/.env"
grep -q '^DIRECT_URL=postgres://direct$' "$test_dir/compose/.env"
grep -q '^COMPOSE_PROJECT_NAME=linkar-production-test$' "$test_dir/compose/.env"

# A failed migration moves nothing: no web change, no worker change.
reset_state
if MIGRATE_FAILS=1 run_release "$sha" >/dev/null 2>&1; then
  echo "release succeeded although the migrations failed" >&2
  exit 1
fi
if grep -q -e 'application\.' -e 'compose\.update' -e 'no-deps worker' "$state/calls"; then
  echo "the web or worker moved although the migrations failed" >&2
  exit 1
fi
grep -q '^LINKAR_IMAGE_TAG=sha-old$' "$test_dir/compose/.env"

# A web release that never reports the commit stops before the worker.
reset_state
if WEB_NEVER_HEALTHY=1 run_release "$sha" >/dev/null 2>&1; then
  echo "release succeeded although the web never became healthy" >&2
  exit 1
fi
if grep -q -e 'compose\.update' -e 'no-deps worker' "$state/calls"; then
  echo "worker was touched although the web never became healthy" >&2
  exit 1
fi
grep -q '^LINKAR_IMAGE_TAG=sha-old$' "$test_dir/compose/.env"

echo "release-linkar tests passed"
