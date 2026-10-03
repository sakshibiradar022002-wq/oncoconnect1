#!/bin/bash
# Read-only check: is anything ON the VM blocking TURN ports?
echo "== coturn status =="; systemctl is-active coturn
echo "== ufw =="; sudo ufw status 2>/dev/null | head -3
echo "== iptables INPUT (first 12 rules) =="; sudo iptables -L INPUT -n --line-numbers 2>/dev/null | head -12
echo "== relay ports listening? (will appear only after first allocation) =="
ss -uln | grep -cE '491[6-9][0-9]|492[01][0-9]' || true
