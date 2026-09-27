#!/bin/bash
# VELTRUVIA VM — upgrade to Node 24 (matches package.json engines)
set -e
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/ns24.sh
sudo -E DEBIAN_FRONTEND=noninteractive bash /tmp/ns24.sh >/dev/null 2>&1
sudo -E DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs >/dev/null 2>&1
echo "node: $(node --version)"
echo "npm: $(npm --version)"
