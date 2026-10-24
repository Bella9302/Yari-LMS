#!/usr/bin/env bash
# Starts the YARI Academy demo on this laptop and shares it through a free, temporary
# Cloudflare link. Run from the project folder:  ./deploy/laptop/start.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=.env.laptop
LOGINS=deploy/laptop/demo-logins.txt
compose() { docker compose -f docker-compose.laptop.yml --env-file "$ENV_FILE" "$@"; }
say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if ! docker info >/dev/null 2>&1; then
  echo "Docker isn't running. Open Docker Desktop, wait until it shows 'Engine running', then run this again."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  say "First run: creating private keys for this laptop ($ENV_FILE)"
  key_id="k$(date +%Y%m%d)"
  umask 077
  cat > "$ENV_FILE" <<ENV
POSTGRES_PASSWORD=$(openssl rand -hex 24)
FIELD_ENC_KEYS='{"$key_id":"$(openssl rand -base64 32)"}'
FIELD_ENC_ACTIVE_KEY=$key_id
BLIND_INDEX_KEY=$(openssl rand -base64 32)
DEMO_PASSWORD=Demo-$(openssl rand -hex 4)
ENV
fi
set -a; . "./$ENV_FILE"; set +a

say "Opening the Cloudflare link"
compose up -d db tunnel
URL=""
for _ in $(seq 1 45); do
  URL=$(compose logs tunnel 2>/dev/null | grep -Eo 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' | tail -1 || true)
  [ -n "$URL" ] && break
  sleep 2
done
if [ -z "$URL" ]; then
  echo "Couldn't open a Cloudflare link (check the internet connection). Continuing on this laptop only."
  export APP_URL=http://localhost:3000
else
  export APP_URL="$URL"
fi

say "Starting YARI Academy (the first time takes 5-10 minutes)"
compose up -d --build app
printf "Waiting for it to be ready"
for _ in $(seq 1 120); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q app)" 2>/dev/null || true)
  [ "$state" = healthy ] && break
  printf "."; sleep 3
done
echo

output=$(compose exec -T -e DEMO_PASSWORD="$DEMO_PASSWORD" app npm run --silent db:seed:demo 2>&1 || true)
if printf '%s' "$output" | grep -q "Demo data created"; then
  printf '%s\n' "$output" > "$LOGINS"
  chmod 600 "$LOGINS"
  say "Demo data loaded. Logins saved to $LOGINS"
fi

say "Ready"
echo "  Share this link:   $APP_URL"
echo "  On this laptop:    http://localhost:3000"
echo "  Logins:            $LOGINS"
echo
echo "  Keep this laptop on, awake and online while presenting."
echo "  If it sleeps or changes network, run this script again: the link will change."
echo "  To stop:           ./deploy/laptop/stop.sh"
command -v open >/dev/null && open "$APP_URL" >/dev/null 2>&1 || true
