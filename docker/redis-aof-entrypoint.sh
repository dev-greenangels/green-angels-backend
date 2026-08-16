#!/bin/sh
# Production Redis entrypoint: enable AOF without wiping an existing RDB volume.
#
# Redis 7 loads AOF (even if empty) when appendonly=yes at startup and ignores
# dump.rdb. Enabling AOF only via compose flags on an RDB-only volume loses data.
# Official conversion: start without AOF (loads RDB), CONFIG SET appendonly yes,
# wait for rewrite, then restart with appendonly yes.
# https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
set -eu

DATA_DIR="${REDIS_DATA_DIR:-/data}"
PIDFILE=/tmp/redis-rdb2aof.pid

redis_cli() {
  if [ -n "${REDIS_PASSWORD:-}" ]; then
    redis-cli --no-auth-warning -a "$REDIS_PASSWORD" "$@"
  else
    redis-cli "$@"
  fi
}

info_field() {
  redis_cli INFO persistence | tr -d '\r' | awk -F: -v key="$1" '$1 == key { print $2 }'
}

aof_present() {
  if [ -f "$DATA_DIR/appendonlydir/appendonly.aof.manifest" ]; then
    return 0
  fi
  if [ -f "$DATA_DIR/appendonly.aof" ]; then
    return 0
  fi
  return 1
}

wait_ready() {
  i=0
  while [ "$i" -lt 50 ]; do
    if redis_cli -h 127.0.0.1 ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.1
  done
  return 1
}

wait_aof_rewrite() {
  i=0
  while [ "$i" -lt 150 ]; do
    enabled="$(info_field aof_enabled)"
    in_progress="$(info_field aof_rewrite_in_progress)"
    scheduled="$(info_field aof_rewrite_scheduled)"
    status="$(info_field aof_last_bgrewrite_status)"
    if [ "$enabled" = "1" ] && [ "${in_progress:-0}" = "0" ] && [ "${scheduled:-0}" = "0" ]; then
      if [ "$status" = "ok" ] || aof_present; then
        return 0
      fi
    fi
    i=$((i + 1))
    sleep 0.2
  done
  return 1
}

if [ -s "$DATA_DIR/dump.rdb" ] && ! aof_present; then
  echo "redis-aof-entrypoint: converting existing dump.rdb to AOF (live CONFIG SET)" >&2

  if [ -n "${REDIS_PASSWORD:-}" ]; then
    redis-server --requirepass "$REDIS_PASSWORD" --dir "$DATA_DIR" \
      --daemonize yes --pidfile "$PIDFILE" --bind 127.0.0.1 --port 6379
  else
    redis-server --dir "$DATA_DIR" \
      --daemonize yes --pidfile "$PIDFILE" --bind 127.0.0.1 --port 6379
  fi

  if ! wait_ready; then
    echo "redis-aof-entrypoint: conversion Redis did not become ready; refusing --appendonly yes startup" >&2
    exit 1
  fi

  redis_cli -h 127.0.0.1 CONFIG SET appendonly yes >/dev/null

  if ! wait_aof_rewrite; then
    echo "redis-aof-entrypoint: AOF rewrite did not finish; refusing --appendonly yes startup" >&2
    redis_cli -h 127.0.0.1 SHUTDOWN SAVE >/dev/null 2>&1 || true
    exit 1
  fi

  redis_cli -h 127.0.0.1 SHUTDOWN SAVE >/dev/null
  echo "redis-aof-entrypoint: AOF conversion complete" >&2
fi

exec docker-entrypoint.sh "$@"
