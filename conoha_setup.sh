#!/bin/bash
# ============================================================
#  POPO'S LAST SURVIVOR — ConoHa VPS(東京) 一発セットアップ
#  使い方: Ubuntu 24.04 のコンソールに root でログインして
#    bash <(curl -fsSL https://raw.githubusercontent.com/doppio-s/popos-arena/main/conoha_setup.sh)
#  を貼り付けてEnter。3分くらいで「遊ぶURL」が表示されます。
#  ・自動起動/自動再起動(systemd)込み。VPSを再起動しても勝手に復活します。
#  ・更新したい時も同じ命令をもう一度貼るだけ(最新を取り直して再起動)。
# ============================================================
set -e
export DEBIAN_FRONTEND=noninteractive

echo "[1/6] 道具を入れています..."
apt-get -o DPkg::Lock::Timeout=600 update -y -qq
apt-get -o DPkg::Lock::Timeout=600 install -y -qq git curl ca-certificates >/dev/null

echo "[2/6] Node.js を入れています..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq nodejs >/dev/null
fi
node -v

echo "[3/6] ゲームを取得しています..."
mkdir -p /opt
if [ -d /opt/popos/.git ]; then
  cd /opt/popos && git fetch --depth 1 origin main && git reset --hard origin/main
else
  rm -rf /opt/popos
  git clone --depth 1 https://github.com/doppio-s/popos-arena /opt/popos
fi

echo "[4/6] 玄関(ファイアウォール)を開けています..."
# ★ConoHaのUbuntu 24.04は ufw が【有効】で出荷される。
#   セキュリティグループを開けても、これを開けないと外から80番に届かない
#   (localhostだけ通る = 現地では動くのに誰も入れない罠。実際に踏んだ)。
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw status | head -1 || true
fi

echo "[5/7] 自動更新(2分ごとにGitHubを見て、変わっていたら取り直して再起動)を設定しています..."
# ★これを入れると、以後の更新は「GitHubに新しい版を置くだけ」で勝手に反映される。
#   SSHでコマンドを貼る作業は二度と要らない。
cat > /opt/popos_update.sh <<'UPD'
#!/bin/bash
cd /opt/popos || exit 0
git fetch --depth 1 origin main >/dev/null 2>&1 || exit 0
L=$(git rev-parse HEAD 2>/dev/null); R=$(git rev-parse origin/main 2>/dev/null)
if [ -n "$R" ] && [ "$L" != "$R" ]; then
  git reset --hard origin/main >/dev/null 2>&1
  systemctl restart popos
  echo "$(date -Is) updated to $R" >> /var/log/popos_update.log
fi
UPD
chmod +x /opt/popos_update.sh
cat > /etc/systemd/system/popos-update.service <<'UNIT2'
[Unit]
Description=POPO auto-update (pull from GitHub if changed)

[Service]
Type=oneshot
ExecStart=/opt/popos_update.sh
UNIT2
cat > /etc/systemd/system/popos-update.timer <<'UNIT3'
[Unit]
Description=POPO auto-update timer

[Timer]
OnBootSec=60
OnUnitActiveSec=120

[Install]
WantedBy=timers.target
UNIT3
systemctl daemon-reload
systemctl enable --now popos-update.timer >/dev/null 2>&1

echo "[6/7] 常時稼働の仕組み(systemd)を設定しています..."
cat > /etc/systemd/system/popos.service <<'UNIT'
[Unit]
Description=POPO'S LAST SURVIVOR game server
After=network.target

[Service]
WorkingDirectory=/opt/popos
Environment=PORT=80
Environment=ROOMS=6
ExecStart=/usr/bin/node /opt/popos/server.mjs
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable popos >/dev/null 2>&1
systemctl restart popos

echo "[7/7] 起動確認中..."
sleep 3
if ! systemctl is-active --quiet popos; then
  echo "★起動に失敗。ログ:"; journalctl -u popos --no-pager | tail -20; exit 1
fi
IP=$(curl -fsS -4 --max-time 8 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "=============================================="
echo "  でけた！ みんなで遊ぶURL:"
echo ""
echo "     http://$IP/"
echo ""
echo "  (このURLは固定。友達にそのまま送れます)"
echo "=============================================="
sleep 1
if curl -fsS --max-time 5 http://127.0.0.1/ | grep -q "GAME_VERSION"; then
  echo "  配信テスト: OK (中身も確認できました)"
else
  echo "  ★配信テストに失敗。journalctl -u popos で記録を確認してください"
fi
