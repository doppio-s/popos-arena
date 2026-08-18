/* 人を使わず、オンラインの手触りを数字で見る検査。
   ★何を見るか
     1. 写しの間隔 — サーバーが位置を配る間隔。ここが不揃いだと
        「止まって追いつく」= カクつきになる。狙いは 50ms 前後で揃うこと。
     2. 離した後の滑り — 入力をやめてから止まるまでに進む距離。
        往復の時間ぶんは必ず滑るが、それ以上滑るならサーバー側が
        古い入力をまとめて使っている。
   使い方: node probe_net_walk.mjs [ws://127.0.0.1:8099/] */
const url = process.argv[2] || 'ws://127.0.0.1:8099/';
const WALK_MS = 3000;
const COAST_MS = 2000;
const WAIT_START_MS = 40000;

const say = (s) => console.log(s);
const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const fix = (v) => (Math.round(v * 100) / 100).toFixed(2);

function rowOf(snap, slot) {
  if (!snap || !Array.isArray(snap.f)) return null;
  return snap.f.find((r) => r[0] === slot) || null;
}
const dist = (a, b) => (a && b) ? Math.hypot(b[1] - a[1], b[3] - a[3]) : null;

const ws = new WebSocket(url);
let slot = -1;
let started = false, done = false;
let sendTimer = null;
let mx = 0, mz = 0;
let rtt = 0;
const gaps = [];          // 写しの到着間隔(ms)
let lastSnapAt = 0;
let first = null, atRelease = null, last = null;
let releasedAt = 0;

function finish(reason, code) {
  if (done) return;
  done = true;
  clearInterval(sendTimer);
  try { ws.close(); } catch (e) {}
  gaps.sort((a, b) => a - b);
  const mean = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const walked = dist(first, atRelease);
  const coast = dist(atRelease, last);
  say('---');
  say('理由: ' + reason);
  say('席: ' + (slot + 1) + ' / 往復: ' + Math.round(rtt) + 'ms');
  say('写しの間隔: 中央' + fix(pct(gaps, 0.5)) + 'ms 9割' + fix(pct(gaps, 0.9))
    + 'ms 最大' + fix(gaps[gaps.length - 1] || 0) + 'ms (平均' + fix(mean) + 'ms / ' + gaps.length + '回)');
  say('歩いた距離: ' + (walked == null ? '不明' : fix(walked) + 'm'));
  say('離した後の滑り: ' + (coast == null ? '不明' : fix(coast) + 'm'));
  if (walked == null) { process.exit(2); }
  if (walked < 0.4) { say('判定: サーバーの体が動いていない'); process.exit(1); }
  say('判定: 動いている');
  process.exit(code || 0);
}

ws.addEventListener('open', () => {
  say('接続: ' + url);
  ws.send(JSON.stringify({ t: 'join', name: 'probe', char: 'takeru' }));
});
ws.addEventListener('error', (e) => finish('線エラー: ' + (e.message || e.type), 2));
ws.addEventListener('close', () => finish(started ? '切断' : '開始前に切断', 2));
ws.addEventListener('message', (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.t === 'wait') {
    if (!started) say(`待合: ${m.n}/${m.need} 残り${m.sec}秒${m.full ? ' 満員' : ''}`);
  } else if (m.t === 'png') {
    if (m.rtt) rtt = m.rtt;
    ws.send(JSON.stringify({ t: 'pog', k: m.k }));
  } else if (m.t === 'start') {
    started = true;
    slot = m.slot | 0;
    say(`開始: 部屋${m.room} 席${slot + 1} 地図${m.map}`);
    mx = 1; mz = 0;
    sendTimer = setInterval(() => {
      ws.send(JSON.stringify({
        t: 'in', mx, mz, f: 1.57, dy: 0,
        atk: false, stand: false, crouch: false,
        jump: false, skill: false, ult: false,
        dash: false, vault: false, climb: false, sk: false,
        ax: 0, ay: 1, az: 0,
      }));
    }, 33);
    setTimeout(() => {
      mx = 0; mz = 0;
      releasedAt = Date.now();
      atRelease = last ? last.slice() : null;
      say('入力を離した');
      setTimeout(() => finish('検査終わり'), COAST_MS);
    }, WALK_MS);
  } else if (m.t === 'snap') {
    const now = Date.now();
    if (lastSnapAt && started) gaps.push(now - lastSnapAt);
    lastSnapAt = now;
    const row = rowOf(m, slot);
    if (!row) return;
    if (!first) { first = row.slice(); say(`最初の位置: ${row[1]}, ${row[3]} hp${row[5]}`); }
    last = row.slice();
  } else if (m.t === 'end') {
    finish('試合終了: ' + (m.why || ''), 0);
  }
});

setTimeout(() => finish(started ? '時間切れ' : '開始が来ない', 2),
  WAIT_START_MS + WALK_MS + COAST_MS + 3000);
