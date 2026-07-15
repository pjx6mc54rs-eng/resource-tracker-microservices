#!/bin/bash
set -e

for DB in auth_db project_db timesheet_db reporting_db chat_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
    CREATE DATABASE $DB;
EOSQL
done
