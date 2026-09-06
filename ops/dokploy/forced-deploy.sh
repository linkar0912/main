#!/bin/sh
set -eu
set -f
umask 077

project=${1:-}
case "$project" in
  trackparcel|linkar) ;;
  *)
    echo "deployment project is not authorized" >&2
    exit 64
    ;;
esac

old_ifs=$IFS
IFS=' 	
'
set -- ${SSH_ORIGINAL_COMMAND:-}
IFS=$old_ifs

if [ "$#" -ne 2 ] || [ "$1" != "deploy" ]; then
  echo "expected: deploy <40-character commit>" >&2
  exit 64
fi

sha=$2
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

unset SSH_ORIGINAL_COMMAND SSH_CLIENT SSH_CONNECTION SSH_TTY

exec "/usr/local/libexec/dokploy-release-$project" "$sha"
