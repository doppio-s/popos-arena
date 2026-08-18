/* 入り直した時に【前の線の後始末が、新しい線を壊さないか】を確かめる。
   ★ここが壊れると: 写しは届くので世界は動いて見えるのに、
     指の動きも技も一切サーバーへ行かない = その場で足踏み。
     受け取りだけ生きて送りだけ死ぬので、画面には何の異常も出ない。
   使い方: node test_net_relink.mjs */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ng = 0;
const ok = (c, name, extra) => {
  console.log((c ? '  合格 ' : '★不合格 ') + name + (extra ? ' — ' + extra : ''));
  if (!c) ng++;
};

/* 本物と同じ振る舞いの偽の線。close() は【頼んだ後】に閉じ終わる。 */
class FakeWS {
  static all = [];
  constructor(url) {
    this.url = url; this.readyState = 0; this.sent = []; this.closed = false;
    FakeWS.all.push(this);
  }
  send(s) { if (this.readyState !== 1) throw new Error('開いていない線に送った'); this.sent.push(s); }
  close() {
    if (this.closed) return;
    this.closed = true; this.readyState = 3;
    setTimeout(() => { if (this.onclose) this.onclose({}); }, 5);   // ★遅れて届く
  }
  open() { this.readyState = 1; if (this.onopen) this.onopen({}); }
  msg(o) { if (this.onmessage) this.onmessage({ data: JSON.stringify(o) }); }
}
globalThis.WebSocket = FakeWS;

await import('./server_env.mjs');       // 画面が無い所で動かすための代役
const mod = await import('./_extracted_testable.mjs');
const { net, netConnect, CHAR_ORDER, MOB_N } = mod;

function roster() {
  const chars = [], names = [];
  for (let i = 0; i < 8; i++) { chars.push('itoha'); names.push('席' + (i + 1)); }
  for (let i = 0; i < MOB_N; i++) { chars.push(CHAR_ORDER[0]); names.push('刺客'); }
  return { chars, names };
}
const startMsg = (slot, humans) => ({ t: 'start', room: 'r1', seed: 12345, map: 'skyline', slot, roster: roster(), humans });

console.log('=== 1回目の参加 ===');
netConnect('itoha', 'ぐ');
const ws1 = FakeWS.all[0];
ws1.open();
ok(ws1.sent.length === 1, '参加の名乗りを送った', ws1.sent.length + '件');
ws1.msg(startMsg(0));
ok(net.on === true, '試合が始まった(net.on)');
ok(net.ws === ws1, '控えている線が1本目');

console.log('=== 試合中に入り直す(ここが今回の元凶だった) ===');
netConnect('itoha', 'ぐ');
const ws2 = FakeWS.all[1];
ok(!!ws2 && ws2 !== ws1, '2本目の線を張った');
ok(net.ws === ws2, '控えが2本目に替わった');
ok(ws1.onclose === null, '1本目の耳を塞いでから閉じた(遅れた合図が誰にも届かない)');

await sleep(40);        // ★1本目の「閉じ終わり」が遅れて届く時間
ok(net.ws === ws2, '遅れて来た1本目の後始末が、2本目の控えを消していない',
  net.ws === null ? 'net.ws が null になった = 送れない試合になる' : '無事');

ws2.open();
ok(ws2.sent.length === 1, '2本目から参加の名乗りを送れた', ws2.sent.length + '件');
ws2.msg(startMsg(1));
ok(net.on === true, '2試合目が始まった');
ok(net.ws === ws2 && net.ws.readyState === 1, '送れる状態になっている');

console.log('=== 本当に線が切れた時は、ちゃんと終わる ===');
net.ws.onclose({});
ok(net.on === false, '切断を検知して試合を閉じた');
ok(net.ws === null, '控えを片付けた');

console.log('=== 人が1人なら手元で動かす(CPUが出現地点で凍らない) ===');
netConnect('itoha', 'ぐ');
const ws3 = FakeWS.all[2];
ws3.open();
ws3.msg(startMsg(0, 1));
ok(net.localSim === true, '1人試合は localSim');
ok(mod.netRemote() === false, '写しで上書きしない');
{
  const frozen = (mod.world.fighters || []).filter((f, i) => i !== net.slot && f && f.netInput);
  ok(frozen.length === 0, 'CPUに netInput が付いていない', frozen.length + '人');
}

console.log('=== 人が2人なら審判を使う ===');
ws3.msg(startMsg(0, 2));
ok(net.localSim === false, '2人試合は審判');
ok(mod.netRemote() === true, '写しを受け取る');
{
  const remotes = (mod.world.fighters || []).filter((f, i) => i !== net.slot && f && f.netInput);
  ok(remotes.length > 0, '相手席に netInput がある', remotes.length + '人');
}

console.log(ng === 0 ? '\n全部合格' : `\n★${ng}件 不合格`);
process.exit(ng === 0 ? 0 : 1);
