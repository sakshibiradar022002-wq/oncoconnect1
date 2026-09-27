#!/bin/bash
# VELTRUVIA VM setup — swap + Node 22 (run as ubuntu on Lightsail Mumbai)
set -e
echo "=== 1. Swap file (mandatory on 1 GB RAM) ==="
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  sudo sysctl vm.swappiness=10
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
else
  echo "swapfile exists, ensuring active"
  sudo swapon /swapfile 2>/dev/null || true
fi
free -h | grep -i swap

echo "=== 2. Node 22 via NodeSource ==="
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E DEBIAN_FRONTEND=noninteractive bash /tmp/nodesource_setup.sh
sudo -E DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
sudo -E DEBIAN_FRONTEND=noninteractive apt-get install -y rsync unzip

echo "=== 3. Versions ==="
node --version
npm --version
echo "=== SETUP DONE ==="
