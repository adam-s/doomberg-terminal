#!/bin/bash
set -e

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker Desktop is not running. Please start Docker Desktop and try again."
  exit 1
fi

echo "Starting docker compose services..."
docker compose up -d

echo "Waiting for TimescaleDB to be healthy..."
until [ "$(docker inspect --format='{{.State.Health.Status}}' timescaledb)" == "healthy" ]; do
  echo "TimescaleDB is still initializing..."
  sleep 1
done

echo "All docker services are up and healthy."
