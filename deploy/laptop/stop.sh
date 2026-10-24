#!/usr/bin/env bash
# Stops the laptop demo. The demo data is kept for next time.
# To wipe it and start fresh: docker compose -f docker-compose.laptop.yml --env-file .env.laptop down -v
set -euo pipefail
cd "$(dirname "$0")/../.."
docker compose -f docker-compose.laptop.yml --env-file .env.laptop stop
echo "Stopped. The link no longer works. Run ./deploy/laptop/start.sh to start again."
