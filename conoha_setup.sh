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

echo "[1/5] 道具を入れています..."
apt-get -o DPkg::Lock::Timeout=600 update -y -qq
apt-get -o DPkg::Lock::Timeout=600 install -y -qq git curl ca-certificates >/dev/null

echo "[2/5] Node.js を入れています..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get -o DPkg::Lock::Timeout=600 install -y -qq nodejs >/dev/null
fi
node -v

echo "[3/5] ゲームを取得しています..."
mkdir -p /opt
if [ -d /opt/popos/.git ]; then
  cd /opt/popos && git fetch --depth 1 origin main && git reset --hard origin/main
else
  rm -rf /opt/popos
  git clone --depth 1 https://github.com/doppio-s/popos-arena /opt/popos
fi

echo "[4/5] 常時稼働の仕組み(systemd)を設定しています..."
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

echo "[5/5] 起動確認中..."
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
