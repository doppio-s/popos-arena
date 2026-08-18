/* 押した瞬間の操作(ジャンプ・スキル・奥義・ダッシュ)が
   審判にちゃんと届いて通るかを、人を使わずに確かめる。
   ★見るもの: 電文を送った直後に【高さが上がったか / 体が飛んだか】。
   使い方: node probe_acts.mjs [ws://127.0.0.1:8103/] [キャラID]
   審判側に出る [操作] の記録と並べて読む。 */
const url = process.argv[2] || 'ws://127.0.0.1:8103/';
const CH = process.argv[3] || 'itoha';

const say = (s) => console.log(s);
const fix = (v) => (Math.round(v * 100) / 100).toFixed(2);
const rowOf = (m, slot) => (m && Array.isArray(m.f)) ? (m.f.find((r) => r[0] === slot) || null) : null;

const ws = new WebSocket(url);
let slot = -1, started = false, done = false, sendTimer = null;
let last = null;                       // 最新の自分の行 [i,x,y,z,facing,hp,shield,lv,flags]
let gauge = null;                      // 審判が配ってきた精神力と技の残り
const says = [];                       // 審判が届けてきた理由
const held = { mx: 0, mz: 0, atk: false, face: 1.57, dy: 0.12 };
const once = { jump: false, skill: false, ult: false, dash: false };

function send() {
  /* 狙いの起点は手元と同じ「自分のすぐ上」。向きと上下は face / dy で伝える。 */
  ws.send(JSON.stringify({
    t: 'in', mx: held.mx, mz: held.mz, f: held.face, dy: held.dy,
    atk: held.atk, stand: false, crouch: false,
    jump: once.jump, skill: once.skill, ult: once.ult, dash: once.dash,
    vault: false, climb: false, sk: false,
    ax: last ? last[1] : 0, ay: last ? last[2] + 1.3 : 1.3, az: last ? last[3] : 0,
  }));
  once.jump = once.skill = once.ult = once.dash = false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pos = () => (last ? { x: last[1], y: last[2], z: last[3] } : null);

/* 操作を1回押し、そのあと一定時間の高さと移動量を見る */
async function press(name, label, watchMs) {
  const a = pos();
  if (!a) { say(`${label} ${name}: 位置が来ていない`); return false; }
  once[name] = true;
  let topY = a.y, far = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < watchMs) {
    await sleep(40);
    const p = pos(); if (!p) continue;
    if (p.y > topY) topY = p.y;
    far = Math.max(far, Math.hypot(p.x - a.x, p.z - a.z));
  }
  const up = topY - a.y;
  const ok = up > 0.5 || far > 2.5;
  say(`${label} ${name}: 上がった${fix(up)}m 動いた${fix(far)}m → ${ok ? '通った' : '★何も起きない'}`);
  return ok;
}

ws.addEventListener('open', () => {
  say('接続: ' + url);
  ws.send(JSON.stringify({ t: 'join', name: 'acts', char: CH }));
});
ws.addEventListener('error', (e) => { say('線エラー: ' + (e.message || e.type)); process.exit(2); });
ws.addEventListener('close', () => { if (!done) { say('切断'); process.exit(2); } });
ws.addEventListener('message', async (ev) => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.t === 'png') { ws.send(JSON.stringify({ t: 'pog', k: m.k })); return; }
  if (m.t === 'say') { says.push(m.m); say('  審判>「' + m.m + '」'); return; }
  if (m.t === 'snap') {
    const r = rowOf(m, slot); if (r) last = r;
    if (m.g) { const gr = m.g.find((x) => x[0] === slot); if (gr) gauge = gr; }
    return;
  }
  if (m.t === 'end') { say('試合終了: ' + (m.why || '')); done = true; process.exit(0); }
  if (m.t !== 'start' || started) return;
  started = true;
  slot = m.slot | 0;
  say(`開始: 部屋${m.room} 席${slot + 1} 地図${m.map} キャラ${CH}`);
  sendTimer = setInterval(send, 33);

  await sleep(2000);
  say(`ゲージ配信: ${gauge ? '来ている ' + JSON.stringify(gauge) : '★来ていない'}`);

  say('--- ジャンプ ---');
  await press('jump', '[1回目]', 1400);
  await sleep(600);
  await press('jump', '[2回目]', 1400);

  say('--- ダッシュ(歩きながら) ---');
  held.mx = 1;
  await sleep(500);
  await press('dash', '[歩行中]', 1200);
  held.mx = 0;

  /* フックは「掛ける物」が要る。向きを一周させて、どこかで通るか見る。 */
  say('--- スキル(向きを8方向試す) ---');
  let hooked = 0;
  for (let i = 0; i < 8; i++) {
    held.face = (i / 8) * Math.PI * 2;
    held.dy = 0.18;
    await sleep(400);                       // 向きが審判に届くのを待つ
    if (await press('skill', `[向き${Math.round(held.face * 57.3)}度]`, 2200)) hooked++;
    await sleep(1400);                      // フックの残りが戻るのを待つ
  }
  say(`フックが通った回数: ${hooked}/8`);

  const p = pos();
  say(`最後の位置: ${p ? fix(p.x) + ', ' + fix(p.z) + ' 高さ' + fix(p.y) : '不明'}`);
  say(`最後のゲージ(席/精神/技待ち/フック残/加速残/息切れ): ${gauge ? gauge.join(' ') : '不明'}`);
  say(`審判から届いた理由: ${says.length ? says.length + '件 — ' + says.join(' / ') : '★0件'}`);
  done = true;
  clearInterval(sendTimer);
  try { ws.close(); } catch (e) {}
  process.exit(0);
});

setTimeout(() => { say(started ? '時間切れ' : '開始が来ない'); process.exit(2); }, 90000);
