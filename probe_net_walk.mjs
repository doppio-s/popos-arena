/* 人を使わず、サーバーの体が入力で動くかを見る。
   使い方: node probe_net_walk.mjs [ws://127.0.0.1:8099/] */
const url = process.argv[2] || 'ws://127.0.0.1:8099/';
const WALK_MS = 5000;
const WAIT_START_MS = 22000;
const DIRS = [
  { mx: 1, mz: 0, name: '+x' },
  { mx: -1, mz: 0, name: '-x' },
  { mx: 0, mz: 1, name: '+z' },
  { mx: 0, mz: -1, name: '-z' },
];

function rowOf(snap, slot) {
  if (!snap || !Array.isArray(snap.f)) return null;
  return snap.f.find((r) => r[0] === slot) || null;
}

function dist(a, b) {
  if (!a || !b) return null;
  return Math.hypot(b[1] - a[1], b[3] - a[3]);
}

const log = [];
const say = (s) => { log.push(s); console.log(s); };

const ws = new WebSocket(url);
let slot = -1;
let first = null;
let last = null;
let maxD = 0;
let snaps = 0;
let started = false;
let walkTimer = null;
let sendTimer = null;
let done = false;

function finish(reason) {
  if (done) return;
  done = true;
  clearInterval(sendTimer);
  clearTimeout(walkTimer);
  try { ws.close(); } catch (e) {}
  const d = dist(first, last);
  const peak = maxD;
  say('---');
  say('理由: ' + reason);
  say('席: ' + (slot + 1));
  say('写し: ' + snaps + '枚');
  say('開始: ' + (first ? `${first[1]}, ${first[3]}` : 'なし'));
  say('終了: ' + (last ? `${last[1]}, ${last[3]}` : 'なし'));
  say('終点までの距離: ' + (d == null ? '不明' : d.toFixed(3) + 'm'));
  say('最大の離れ: ' + peak.toFixed(3) + 'm');
  if (d == null) process.exit(2);
  if (peak < 0.4) {
    say('判定: サーバーの体はほぼ動いていない');
    process.exit(1);
  }
  say('判定: サーバーの体は入力で動いている');
  process.exit(0);
}

ws.addEventListener('open', () => {
  say('接続: ' + url);
  ws.send(JSON.stringify({ t: 'join', name: 'probe', char: 'takeru' }));
});
ws.addEventListener('error', (e) => {
  say('線エラー: ' + (e.message || e.type || e));
  finish('線エラー');
});
ws.addEventListener('close', () => finish(started ? '切断' : '開始前に切断'));
ws.addEventListener('message', (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.t === 'wait') {
    if (!started) say(`待合: ${m.n}/${m.need} 残り${m.sec}秒${m.full ? ' 満員' : ''}`);
  } else if (m.t === 'png') {
    ws.send(JSON.stringify({ t: 'pog', k: m.k }));
  } else if (m.t === 'start') {
    started = true;
    slot = m.slot | 0;
    say(`開始: 部屋${m.room} 席${slot + 1} 地図${m.map}`);
    let dirI = 0;
    sendTimer = setInterval(() => {
      const d = DIRS[Math.min(dirI, DIRS.length - 1)];
      ws.send(JSON.stringify({
        t: 'in', mx: d.mx, mz: d.mz, f: 1.57, dy: 0,
        atk: false, stand: false, crouch: false,
        jump: false, skill: false, ult: false,
        dash: false, vault: false, climb: false, sk: false,
        ax: 0, ay: 1, az: 0,
      }));
    }, 33);
    const slice = WALK_MS / DIRS.length;
    const dirTick = setInterval(() => {
      dirI++;
      if (dirI < DIRS.length) say('入力: ' + DIRS[dirI].name);
    }, slice);
    walkTimer = setTimeout(() => { clearInterval(dirTick); finish('歩き終わり'); }, WALK_MS);
    say('入力: 4方向を各' + (slice / 1000) + '秒');
  } else if (m.t === 'snap') {
    snaps++;
    const row = rowOf(m, slot);
    if (!row) return;
    if (!first) {
      first = row.slice();
      say(`最初の位置: ${row[1]}, ${row[3]} hp${row[5]}`);
    }
    last = row.slice();
    const dd = dist(first, last);
    if (dd != null && dd > maxD) maxD = dd;
  } else if (m.t === 'end') {
    finish('試合終了: ' + (m.why || ''));
  }
});

setTimeout(() => finish(started ? '時間切れ' : '開始が来ない'), WAIT_START_MS + WALK_MS + 3000);
