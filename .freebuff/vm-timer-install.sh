#!/bin/bash
set -e
cat <<'EOF' | sudo tee /etc/systemd/system/veltruvia-backup.service >/dev/null
[Unit]
Description=VELTRUVIA nightly backup

[Service]
Type=oneshot
User=ubuntu
ExecStart=/bin/bash /home/ubuntu/veltruvia/vm-backup.sh
EOF

cat <<'EOF' | sudo tee /etc/systemd/system/veltruvia-backup.timer >/dev/null
[Unit]
Description=Run VELTRUVIA nightly backup at 02:15 UTC

[Timer]
OnCalendar=*-*-* 02:15:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now veltruvia-backup.timer
systemctl list-timers veltruvia-backup.timer --no-pager | head -4
