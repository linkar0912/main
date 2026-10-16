#!/bin/sh
# Host release script: installed as /usr/local/libexec/dokploy-release-linkar
# (root-owned, mode 755). dokploy-forced-deploy is the only caller from CI
# (through sudo, which resets the environment, so the defaults below are what
# production uses); an operator runs it directly for a rollback (see
# ops/DOKPLOY_DEPLOYMENT.md).
#
# THE INSTALLED HOST COPY MUST MATCH THIS FILE. Change it here, run
# `sh ops/dokploy/release-linkar.test.sh`, then install it on the host.
#
# Order of a release:
#   1. apply committed database migrations with the release image (the
#      Compose's `migrate` service, on DIRECT_URL). Migrations must work with
#      the release still running, so the old web and worker keep serving;
#      a failed migration stops here, before anything moves;
#   2. point the "Linkar Web" Application at ghcr.io/...:sha-<commit>, deploy
#      it, and wait until public /api/health reports that commit with the
#      database and Redis up, three times in a row;
#   3. only then set LINKAR_IMAGE_TAG in the "Linkar Production" Compose (in
#      Dokploy and in its .env on disk) and recreate just its singleton
#      `worker` service, then wait for the worker to report healthy.
# A web release that never becomes healthy stops at step 2, so the worker is
# never moved ahead of (or away from) the web it pairs with.
#
# The environment overrides exist for the test only.
set -eu
umask 077

sha=${1:-}
case "$sha" in *[!0-9a-f]*|'') exit 64;; esac
[ "${#sha}" -eq 40 ] || exit 64

config_dir=${LINKAR_RELEASE_CONFIG_DIR:-/etc/dokploy-release}
api_url=${DOKPLOY_API_URL:-http://127.0.0.1:3000/api}
web_app_id=${LINKAR_WEB_APPLICATION_ID:-aoLUr79M7PCl8Rg75Lg9i}
compose_id=${LINKAR_COMPOSE_ID:-410zIiMaPnkYS7hViW8ZK}
compose_dir=${LINKAR_COMPOSE_DIR:-/etc/dokploy/compose/linkar-production-dkirew/code}
worker_container=${LINKAR_WORKER_CONTAINER:-linkar-production-dkirew-worker-1}
health_url=${LINKAR_HEALTH_URL:-https://app.linkar.in/api/health}
lock_file=${LINKAR_RELEASE_LOCK:-/run/lock/dokploy-release-linkar.lock}
poll=${LINKAR_RELEASE_POLL:-5}

# One release at a time.
exec 9>"$lock_file"
flock 9

api_key=$(cat "$config_dir/api-key")
api_post() {
  endpoint=$1
  payload=$2
  curl --fail --silent --show-error --retry 3 \
    -X POST "$api_url/$endpoint" \
    -H "x-api-key: $api_key" -H 'content-type: application/json' \
    --data-binary "$payload" >/dev/null
}

env_file=$compose_dir/.env
# The project name (COMPOSE_PROJECT_NAME) comes from the Compose's .env, so
# every call passes it; without it Compose would start a second project.
compose() {
  docker compose --project-directory "$compose_dir" --env-file "$env_file" \
    -f "$compose_dir/docker-compose.yml" "$@"
}

image="ghcr.io/linkar0912/main:sha-$sha"

# 1. Migrations, with the release image. The shell value of LINKAR_IMAGE_TAG
# overrides the .env one for this run only, so nothing is saved until the
# web is healthy. `migrate` sits in the `migration` profile and never starts
# on its own.
LINKAR_IMAGE_TAG="sha-$sha" compose --profile migration pull migrate
if ! LINKAR_IMAGE_TAG="sha-$sha" compose --profile migration run --rm -T migrate; then
  echo "Linkar migrations failed; the release stopped before the web moved" >&2
  exit 1
fi

# 2. Web.
payload=$(jq -nc --arg id "$web_app_id" --arg image "$image" '{applicationId:$id,sourceType:"docker",dockerImage:$image,registryUrl:"ghcr.io"}')
api_post application.update "$payload"
api_post application.deploy "$(jq -nc --arg id "$web_app_id" '{applicationId:$id}')"

ok=0
i=0
while [ "$i" -lt "${LINKAR_WEB_CHECKS:-120}" ]; do
  body=$(curl --silent --show-error --max-time 10 "$health_url" || true)
  if printf '%s' "$body" | jq -e --arg sha "$sha" '.status=="ok" and .release==$sha and .dependencies.database=="ok" and .dependencies.redis=="ok"' >/dev/null 2>&1; then
    ok=$((ok+1))
    [ "$ok" -ge 3 ] && break
  else
    ok=0
  fi
  i=$((i+1))
  sleep "$poll"
done
[ "$ok" -ge 3 ] || { echo "Linkar web deployment did not become healthy at requested release" >&2; exit 1; }

# 3. Worker.
compose_json=$(curl --fail --silent --show-error -G \
  "$api_url/compose.one" -H "x-api-key: $api_key" \
  --data-urlencode "composeId=$compose_id")
env=$(printf '%s' "$compose_json" | jq -r '.env' | sed '/^LINKAR_IMAGE_TAG=/d')
env=$(printf '%s\nLINKAR_IMAGE_TAG=sha-%s\n' "$env" "$sha")
payload=$(printf '%s' "$compose_json" | jq -c --arg env "$env" '{composeId:.composeId,env:$env}')
api_post compose.update "$payload"

env_tmp=$(mktemp "$compose_dir/.env.release.XXXXXX")
sed '/^LINKAR_IMAGE_TAG=/d' "$env_file" > "$env_tmp"
printf 'LINKAR_IMAGE_TAG=sha-%s\n' "$sha" >> "$env_tmp"
chown --reference="$env_file" "$env_tmp"
chmod --reference="$env_file" "$env_tmp"
mv "$env_tmp" "$env_file"

compose pull worker
compose up -d --no-deps worker

i=0
while [ "$i" -lt "${LINKAR_WORKER_CHECKS:-30}" ]; do
  state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$worker_container" 2>/dev/null || true)
  [ "$state" = healthy ] && exit 0
  i=$((i+1))
  sleep "$poll"
done
echo "Linkar worker did not become healthy" >&2
exit 1
