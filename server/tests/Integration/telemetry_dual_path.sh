#!/usr/bin/env bash
set -euo pipefail

# Isolated local integration test. Never uses the development/production DB or broker.
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d /tmp/opencode/simlab-integration.XXXXXX)"
MYSQL_PORT=44085
MQTT_PORT=44083
HTTP_PORT=44084
MYSQL_SOCKET="$TMP/mysql.sock"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  if [ -S "$MYSQL_SOCKET" ]; then mysqladmin --socket="$MYSQL_SOCKET" -u root shutdown 2>/dev/null || true; fi
  if [ "${SUCCESS:-0}" = "1" ]; then rm -rf "$TMP"; else echo "Integration logs retained at $TMP" >&2; fi
}
trap cleanup EXIT INT TERM

mkdir -p "$TMP/mysql"
mariadb-install-db --user=root --datadir="$TMP/mysql" --auth-root-authentication-method=normal >"$TMP/mysql-init.log" 2>&1
mysqld --user=root --datadir="$TMP/mysql" --socket="$MYSQL_SOCKET" \
  --port="$MYSQL_PORT" --bind-address=127.0.0.1 --pid-file="$TMP/mysql.pid" \
  --log-error="$TMP/mysql.log" --skip-log-bin &
PIDS+=("$!")
for _ in $(seq 1 60); do
  mysqladmin --socket="$MYSQL_SOCKET" -u root ping >/dev/null 2>&1 && break
  sleep 1
done
mysql --socket="$MYSQL_SOCKET" -u root -e "CREATE DATABASE simlab_integration"

export APP_ENV=testing
export APP_KEY='base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
export DB_CONNECTION=mysql DB_HOST=127.0.0.1 DB_PORT="$MYSQL_PORT"
export DB_DATABASE=simlab_integration DB_USERNAME=root DB_PASSWORD=
export AGENT_API_TOKEN=integration-agent-token INTERNAL_API_TOKEN=integration-internal-token
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync

cd "$ROOT/server"
php artisan migrate --seed --force >/dev/null
php -S 127.0.0.1:"$HTTP_PORT" -t public public/index.php >"$TMP/laravel.log" 2>&1 &
PIDS+=("$!")

cat >"$TMP/mosquitto.conf" <<EOF
listener $MQTT_PORT 127.0.0.1
allow_anonymous true
persistence false
log_dest stderr
EOF
mosquitto -c "$TMP/mosquitto.conf" &
PIDS+=("$!")

cat >"$TMP/worker.yaml" <<EOF
mqtt:
  broker_host: 127.0.0.1
  broker_port: $MQTT_PORT
  username: integration-worker
  password: integration-only
  use_tls: false
database:
  host: 127.0.0.1
  port: $MYSQL_PORT
  name: simlab_integration
  username: root
  password: ''
worker:
  batch_size: 10
  flush_interval: 100
  offline_threshold: 3600
laravel:
  base_url: http://127.0.0.1:$HTTP_PORT
  api_token: integration-internal-token
EOF
cd "$ROOT/worker"
go build -o "$TMP/simlab-worker" ./cmd/worker
"$TMP/simlab-worker" -config "$TMP/worker.yaml" >"$TMP/worker.log" 2>&1 &
PIDS+=("$!")
sleep 3

http_sample() {
  local sample="$1"
  curl -fsS -X POST "http://127.0.0.1:$HTTP_PORT/api/telemetry" \
    -H 'Content-Type: application/json' -H 'X-Agent-Token: integration-agent-token' \
    -d "{\"lab_id\":\"lab1\",\"pc_id\":\"pc01\",\"sample_id\":\"$sample\",\"timestamp\":1793600000,\"uptime_seconds\":42,\"metrics\":{\"cpu_percent\":10,\"ram_percent\":20,\"disk_percent\":30}}" >/dev/null
}
mqtt_sample() {
  local sample="$1"
  mosquitto_pub -h 127.0.0.1 -p "$MQTT_PORT" -t simlab/lab1/pc01/telemetry \
    -m "{\"sample_id\":\"$sample\",\"timestamp\":1793600000,\"uptime_seconds\":42,\"cpu_percent\":10,\"ram_percent\":20,\"disk_percent\":30}"
}

http_sample http-only-1
mqtt_sample mqtt-only-1
http_sample dual-1
mqtt_sample dual-1
mqtt_sample mqtt-first-1
http_sample mqtt-first-1
http_sample concurrent-1 &
HTTP_SAMPLE_PID=$!
mqtt_sample concurrent-1 &
MQTT_SAMPLE_PID=$!
wait "$HTTP_SAMPLE_PID" "$MQTT_SAMPLE_PID"
sleep 3

RESULT=$(mysql --socket="$MYSQL_SOCKET" -u root -N -B simlab_integration -e \
  "SELECT sample_id, COUNT(*) FROM metrics WHERE sample_id IN ('http-only-1','mqtt-only-1','dual-1','mqtt-first-1','concurrent-1') GROUP BY sample_id ORDER BY sample_id")
printf '%s\n' "$RESULT"
[ "$(printf '%s\n' "$RESULT" | awk -F '\t' '$2 == 1 {n++} END {print n+0}')" = "5" ]

UPTIME=$(mysql --socket="$MYSQL_SOCKET" -u root -N -B simlab_integration -e \
  "SELECT COUNT(DISTINCT uptime_seconds) FROM metrics WHERE sample_id IN ('http-only-1','mqtt-only-1','dual-1','mqtt-first-1','concurrent-1')")
[ "$UPTIME" = "1" ]
echo 'HTTP-only, MQTT-only, and dual-path ingestion: PASS (one metric per sample)'

# Both paths must persist the same Unix timestamp as UTC, regardless of the
# host/MySQL system timezone (the test host may be EST, for example).
EXPECTED_UTC=$(date -u -d @1793600000 +%Y-%m-%dT%H:%M:%S)
for sample in http-only-1 mqtt-only-1; do
  RECORDED=$(mysql --socket="$MYSQL_SOCKET" -u root -N -B simlab_integration -e \
    "SELECT DATE_FORMAT(recorded_at, '%Y-%m-%dT%H:%i:%s') FROM metrics WHERE sample_id='$sample'")
  if [ "$RECORDED" != "$EXPECTED_UTC" ]; then
    echo "Timezone mismatch for $sample: expected $EXPECTED_UTC UTC, got $RECORDED" >&2
    exit 1
  fi
done
echo 'UTC timestamp normalization for HTTP and MQTT: PASS'
SUCCESS=1
