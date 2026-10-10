#!/bin/sh
# Host release script: install as /usr/local/libexec/dokploy-release-linkar
# (root-owned, mode 755). forced-deploy.sh is the only caller from CI; an
# operator runs it directly for a rollback (see ops/DOKPLOY_DEPLOYMENT.md).
#
# THE INSTALLED HOST COPY MUST MATCH THIS FILE. It is the reviewed template:
# change it here, run `sh ops/dokploy/release-linkar.test.sh`, then install it
# on the host. Before the first install, diff it against the copy already on
# the host and confirm the Dokploy API calls (application.saveDockerProvider,
# application.deploy) match the Dokploy version running there.
#
# Order of a release:
#   1. point linkar-web at ghcr.io/...:sha-<commit> and deploy it;
#   2. wait until public /api/health reports that commit for the web;
#   3. only then point the singleton linkar-worker at the same image and
#      deploy it;
#   4. wait until /api/health reports a live worker heartbeat on that commit.
# A web release that never becomes healthy stops here, so the worker is never
# moved ahead of (or away from) the web it pairs with.
#
# Host configuration (all root-owned, mode 600):
#   /etc/dokploy-release/api-key             Dokploy API key (shared with other projects)
#   /etc/dokploy-release/linkar-health-token  HEALTH_DETAIL_TOKEN of linkar-web
#   /etc/dokploy-release/linkar.env          shell assignments:
#       LINKAR_WEB_APPLICATION_ID=...
#       LINKAR_WORKER_APPLICATION_ID=...
#     optional overrides: DOKPLOY_API_URL, LINKAR_IMAGE, LINKAR_HEALTH_URL,
#     LINKAR_RELEASE_TIMEOUT (seconds), LINKAR_RELEASE_POLL (seconds)
set -eu
set -f
umask 077

sha=${1:-}
case "$sha" in
  *[!0-9a-f]*|'')
    echo "commit must be lowercase hexadecimal" >&2
    exit 64
    ;;
esac
if [ "${#sha}" -ne 40 ]; then
  echo "commit must contain exactly 40 characters" >&2
  exit 64
fi

config_dir=${LINKAR_RELEASE_CONFIG_DIR:-/etc/dokploy-release}
# shellcheck disable=SC1091
. "$config_dir/linkar.env"
: "${LINKAR_WEB_APPLICATION_ID:?set in linkar.env}"
: "${LINKAR_WORKER_APPLICATION_ID:?set in linkar.env}"
api_url=${DOKPLOY_API_URL:-http://localhost:3000/api}
image=${LINKAR_IMAGE:-ghcr.io/linkar0912/main}
health_url=${LINKAR_HEALTH_URL:-https://app.linkar.in/api/health}
timeout=${LINKAR_RELEASE_TIMEOUT:-600}
poll=${LINKAR_RELEASE_POLL:-10}

api_key=$(cat "$config_dir/api-key")
health_token=$(cat "$config_dir/linkar-health-token")
if [ -z "$api_key" ] || [ -z "$health_token" ]; then
  echo "release configuration is incomplete" >&2
  exit 78
fi

dokploy() {
  curl --fail --silent --show-error --max-time 60 -X POST \
    -H "x-api-key: $api_key" -H "Content-Type: application/json" \
    -d "$2" "$api_url/$1" > /dev/null
}

release_app() {
  dokploy application.saveDockerProvider \
    "{\"applicationId\":\"$1\",\"dockerImage\":\"$image:sha-$sha\"}"
  dokploy application.deploy "{\"applicationId\":\"$1\"}"
}

# /api/health serializes keys in a fixed order (status, mode, release, ...,
# worker{heartbeat, release}), so fixed-string matches are exact enough here
# and need no JSON tooling on the host.
wait_for() {
  label=$1
  pattern=$2
  waited=0
  while :; do
    body=$(curl --fail --silent --max-time 10 -H "x-health-token: $health_token" "$health_url" 2>/dev/null || true)
    case "$body" in
      *"$pattern"*) echo "$label is live on $sha"; return 0 ;;
    esac
    if [ "$waited" -ge "$timeout" ]; then
      echo "$label did not report $sha within ${timeout}s; stopping the release" >&2
      return 1
    fi
    sleep "$poll"
    waited=$((waited + poll))
  done
}

echo "releasing $sha"
release_app "$LINKAR_WEB_APPLICATION_ID"
wait_for "web" "\"release\":\"$sha\",\"dependencies\""

release_app "$LINKAR_WORKER_APPLICATION_ID"
wait_for "worker" "\"worker\":{\"heartbeat\":\"ok\",\"release\":\"$sha\"}"

echo "release $sha complete"
