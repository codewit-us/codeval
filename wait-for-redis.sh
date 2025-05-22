#!/bin/sh

set -e

host="$1"
shift
cmd="$@"

until nc -z "$host" 6379; do
  echo "Redis is unavailable - sleeping"
  sleep 1
done

echo "Redis is up - executing command"
exec $cmd