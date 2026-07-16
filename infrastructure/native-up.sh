#!/usr/bin/env bash
# Native local infrastructure check (no Docker).
set -euo pipefail
export PATH="/opt/homebrew/opt/mysql@8.4/bin:/opt/homebrew/opt/redis/bin:/opt/homebrew/bin:$PATH"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-Root@12345}"

echo "==> Checking MySQL"
mysql -u root -p"$MYSQL_ROOT_PASSWORD" -h 127.0.0.1 -e "CREATE DATABASE IF NOT EXISTS travel_erp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "==> Checking Redis"
redis-cli ping

echo "Ready."
echo "DATABASE_URL=mysql://root:Root%4012345@127.0.0.1:3306/travel_erp"
echo "REDIS_URL=redis://127.0.0.1:6379"
