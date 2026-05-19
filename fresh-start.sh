#!/bin/bash
set -e

docker compose down
cd ..
sudo rm -rf web-voc-data
cd gs1-web-vocabulary
docker compose up -d --build
