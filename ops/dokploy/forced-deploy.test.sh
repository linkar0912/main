#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
source_script="$script_dir/forced-deploy.sh"

if [ ! -f "$source_script" ]; then
  echo "forced-deploy.sh is missing" >&2
  exit 1
fi

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT HUP INT TERM
mkdir -p "$test_dir/libexec"

sed -e "s#/usr/local/libexec#$test_dir/libexec#g" -e 's/exec sudo -n /exec /' \
  "$source_script" > "$test_dir/forced-deploy.sh"
chmod 700 "$test_dir/forced-deploy.sh"

for project in trackparcel linkar; do
  release="$test_dir/libexec/dokploy-release-$project"
  printf '%s\n' '#!/bin/sh' 'printf "%s" "$1" > "'"$test_dir/$project.sha"'"' > "$release"
  chmod 700 "$release"
done

expect_failure() {
  project=$1
  command=$2
  if SSH_ORIGINAL_COMMAND="$command" "$test_dir/forced-deploy.sh" "$project" >/dev/null 2>&1; then
    echo "unexpected success: project=$project command=$command" >&2
    exit 1
  fi
}

expect_failure trackparcel ""
expect_failure trackparcel "deploy"
expect_failure trackparcel "deploy abc"
expect_failure trackparcel "deploy 0123456789abcdef0123456789abcdef01234567 extra"
expect_failure unknown "deploy 0123456789abcdef0123456789abcdef01234567"

sha=0123456789abcdef0123456789abcdef01234567
SSH_ORIGINAL_COMMAND="deploy $sha" "$test_dir/forced-deploy.sh" trackparcel
SSH_ORIGINAL_COMMAND="deploy $sha" "$test_dir/forced-deploy.sh" linkar

test "$(cat "$test_dir/trackparcel.sha")" = "$sha"
test "$(cat "$test_dir/linkar.sha")" = "$sha"

echo "forced-deploy validation tests passed"
