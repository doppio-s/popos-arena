/* ★★★v114 #277: 審判サーバー(部屋を何個も持つバトロワ)
   利用者「何十人もプレイしてて 一つの部屋には八人だけ それを何個も作るみたいな」

   使い方:  node server.mjs          … 8080番で起動
            node server.mjs 3000     … 番号を変える
   遊ぶ人は http://<このPCのIP>:8080/ を開くだけ(index.html もここが配る)。

   ★仕組みの要点は3つ。
     ①【部屋 = 1つの試合】。部屋ごとに game の実体を丸ごと1つ持つ
       (import に ?r=番号 を付けると、同じファイルでも別の世界がもう1つ生まれる)。
     ②【人もCPUと同じ扱い】。ネットから来た入力を netInput に流すだけで、
       照準や当たり判定の仕組みには一切触らない(v114の継ぎ目)。
     ③【街は種で配る】。箱3000個ではなく4バイト(v113)。
   ★計算するのはサーバーだけ。誰かの画面で「当たった」と言っても、
     サーバーが当たったと言わなければ当たっていない(host-authoritative)。 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { attachWs } from './ws_min.mjs';
import './server_env.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* ★★★v166 #332: 置き場所(クラウド)は「この番号で待て」と環境変数で言ってくる。
   ★順番は 引数 > 環境変数 > 8080。手元は今までどおり `node server.mjs` で動く。 */
const PORT = Number(process.argv[2] || process.env.PORT || 8080);

/* ★★★v166 #332: 起動のたびに index.html から中身を取り出し直す。
   ★実機で見つけた事故: サーバーが読む _extracted_testable.mjs が
     【index.html より何十版も古いまま】だった —— 画面には v165 と出るのに、
     当たり判定を決めているサーバーは古い世界を回していた。
     オンラインだけ挙動が違う、という一番たちの悪いズレ方をする。
   ★人間が「ビルドを忘れない」ことに賭けるのをやめて、起動時に必ず作り直す。
     0.1秒の手間で、2つのファイルが食い違う可能性そのものが消える。 */
process.chdir(HERE);
await import('./build.mjs');

const ROOM_MAX = 8;            // 1部屋の人数(本家と同じ8人)
/* ★★★v169 #336: 同時に立てられる部屋の数。★公開する前に必ず要る蓋 ——
   部屋は1つにつき60Hzの試合を丸ごと1つ回すので、無制限だと
   人が増えた瞬間に【今遊んでいる全員がカクつく】。断るほうがまだ親切。
   ★環境変数 ROOMS で変えられる(強いサーバーなら増やす)。
   ★目安: 無料枠のクラウドで3〜4、普通のPCで6〜8。 */
/* ★★★v171 #349: 広告(忍者AdMax)を出す時だけ、CSPを緩める。
   ★★広告と強いCSPは【正面から相反する】。広告は
     ①他所のJSを走らせ ②どこの物とも知れない画像を出し ③入札のため外へ通信する。
     つまり v170 で塞いだ穴を、広告のためにもう一度開けることになる ——
     これは正直に書いておく。ごまかせる話ではない。
   ★だから既定は【厳しいまま】。ADS=1 を立てた時だけ緩む。
     広告を出していない日は、v170 の守りが1ミリも削れていない。
   ★緩める幅も最小にする: スクリプトは忍者AdMaxのドメインだけ。
     画像と枠(iframe)と通信は https: 全体 —— ここは広告網の性質上どうしても絞れない
     (どの広告主の素材が来るか事前に分からない)。 */
const ADS_ON = process.env.ADS === '1';
/* ★★★v175 #387: 文字の書体(Google Fonts)を通す。
   ★実機で見つけた: 本番の画面に
       Refused to load the stylesheet 'https://fonts.googleapis.com/...'
       because it violates ... "style-src 'self' 'unsafe-inline'"
     が出ていて、【タイトルも見出しも代替書体で出ていた】。
     手元(Live Server)はCSPを付けないので気付けない —— 公開してから初めて出る類。
   ★通すのは2つだけ: 書体の目録(fonts.googleapis.com)と実体(fonts.gstatic.com)。
     script は1文字も足していないので、守りの要は削れていない。 */
const CSP_STRICT =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data:; " +
  "connect-src 'self' ws: wss:; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const CSP_ADS =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://adm.shinobi.jp; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self' ws: wss: https:; " +
  "frame-src https:; " +
  "frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const CSP = ADS_ON ? CSP_ADS : CSP_STRICT;

const ROOM_LIMIT = Number(process.env.ROOMS || 4);
/* ★★★v170 #341: 公開する時の【蓋】。どれも「まともな客なら絶対に超えない」線に置く。
   ★数字の根拠:
     ・入力は毎秒20〜30通。120にしておけば、遅れて溜まった分が一気に来ても足りる
     ・1つのIPから8人 = 家族全員が同じ家から入っても足りる
     ・全体400人 = 4部屋(32人)の10倍。待合室が膨らんでも耐える
   ★超えた相手は黙って切る。理由を返すと、探る側に手がかりを与える。 */
const MSG_PER_SEC = 120;          // 1人が1秒に送ってよい電文の数
const IP_LIMIT = Number(process.env.IP_LIMIT || 8);    // 同じIPからの同時接続
const CONN_LIMIT = Number(process.env.CONNS || 400);   // 全体の同時接続
const NAME_MAX = 12;
const FILL_WAIT_S = 15;        // これだけ待っても埋まらなければCPUで埋めて開始
const SNAP_HZ = 20;            // 写しを配る回数(v113)
/* ★★★v173 #384: 計算の刻みを 60 → 20 に落とした(環境変数 TICK で変えられる)。
   ★実測(本番 Render 無料枠 = 0.1 CPU、僕1人だけ接続):
       設計 20回/秒 の写しが 15.7回/秒 しか届かない
       = 1歩に 64ms かかっている(設計は16.7ms)= 【4倍粗い】
   ★そして下の時計には「重い時は dt を 0.05 で丸める」保護が入っている。
     64ms かかっているのに 0.05秒 しか進めない → ゲーム内時間が実時間の78%。
     この【スローモーション】が、カクつき・攻撃が通らない の正体だった。
   ★TICK_HZ=20 なら1歩がちょうど 0.05秒 = 丸めが発動しない
     → 時間が実時間どおりに進む。しかも計算量は3分の1。
   ★写しは元々 20回/秒 なので、手元に届く情報量は【変わらない】。
     オンライン対戦でサーバー20〜30Hzは普通の設計。
   ★横移動の当たり判定は元からサブステップ化されている(nSub: 0.3mごと最大16分割)
     ので、刻みを粗くしても壁を抜けるようにはならない。 */
const TICK_HZ = Number(process.env.TICK || 20);
/* ★★★v173 #384: 刺客の数。オンラインだけ減らす(利用者「オンライン時のみにしてね」)。
   ★index.html 側は globalThis.__MOB_N が入っている時だけこれに従う =
     手元のブラウザは 10 のまま。★世界を読み込む【前】に入れる必要がある。 */
const MOB_ONLINE = Number(process.env.MOBS || 4);
globalThis.__MOB_N = MOB_ONLINE;
const ORB_HZ = 2;              // ★v176 #389: 落ちている物の一覧を配る回数
const PING_HZ = 2;             // ★v117 #280: 往復の時間を測る回数(毎秒2回)
/* ★★★v117 #280: 遅れ(lag)は【サーバーが測る】。クライアントに申告させない ——
   させると「私は0.5秒遅れています」と言うだけで半秒前の世界を撃てる人が出る。
   ★lag = 片道の遅れ + 再生の遅らせ(NET_LERP_MS)。
     その人の画面は「届くまでの時間」ぶんと「滑らかにするために遅らせた」ぶん、
     合わせてこれだけ過去を見ている。 */
function applyLag(m, rttMs, mod) {
  const half = rttMs / 2000;
  const lerp = (mod && mod.NET_LERP_MS ? mod.NET_LERP_MS : 60) / 1000;
  /* 1回の跳ねで大きく動かない(平均に寄せる)。回線は常に少し揺れている */
  m.rtt = m.rtt ? m.rtt * 0.7 + rttMs * 0.3 : rttMs;
  const lag = Math.min(mod && mod.LAG_MAX ? mod.LAG_MAX : 0.25, m.rtt / 2000 + lerp);
  if (m.fighter && m.fighter.netInput) m.fighter.netInput.lag = lag;
  return lag;
}
const MAPS = ['venezia', 'cairo', 'colosseo', 'skyline'];

let roomN = 0, modN = 0;
const rooms = new Map();       // id -> room
/* ★★★v169 #337: 【世界の使い回し】。公開の前に必ず要る直し ——
   ★import('...?r=1') で読み込んだ世界は、Node のモジュール表に【永久に残る】。
     部屋が終わっても解放されないので、部屋を作るたびに約30MBずつ増え続ける。
     実測: 空 64MB → 1部屋 96MB → 2部屋 114MB。無料枠(512MB)なら
     十数部屋、つまり公開して数時間で落ちる。
   ★止め方は「読み込む数を増やさない」しかない。終わった世界を捨てずに棚へ戻し、
     次の部屋がそれを使い回す —— startBattle() が世界を丸ごと作り直すので、
     使い回しても前の試合は残らない(cleanupBattle も今までどおり通す)。
   ★棚に戻す時は【その世界が生まれた時のスロット名】も一緒に持ち回る。
     コマ送りの予約(requestAnimationFrame)はスロット名で仕分けているので、
     名前が変わると予約が迷子になって試合が止まる。 */
const modPool = [];            // 空いている世界(使い回す)
const waiting = [];            // 待合室の客
const clients = new Map();     // sock -> client

/* ★★★v170 #341: 名前の掃除。★【サーバー側で】やるのが肝 ——
   画面側で逃がす(esc)のは"描く時の守り"で、こちらは"入れる時の守り"。
   ★2つ要る理由: 画面側だけだと、細工したクライアントで入られた時に
     名前そのものが汚れたまま全員へ配られる。逆にサーバー側だけだと、
     将来どこかで innerHTML に渡す新しい画面を足した時に破れる。
     【入口と出口の両方で守る】—— どちらか一方は必ずいつか漏れる。
   ★消すのは記号だけ。日本語や絵文字は通す(遊ぶ人の名前を壊さない)。 */
function cleanName(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/[<>&"'\\`]/g, '')                 // HTMLとして意味を持つ字
    .replace(/[\u0000-\u001f\u007f]/g, '')       // 制御文字(改行で表示を崩す)
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')  // 見えない字・書字方向の細工
    .trim()
    .slice(0, NAME_MAX) || '客';
}

/* ---------- 部屋 ---------- */
async function makeRoom(members) {
  const id = 'r' + (++roomN);
  /* ★同じファイルをもう1回読み込むと、世界がもう1つ生まれる。
     ?r= を付けないと Node が「もう読んだ」と言って同じ世界を返してくる。
     ★★v169 #337: ただし読み込んだ世界は永久に残るので、まず棚を見る。 */
  let slot, mod;
  const reuse = modPool.pop();
  if (reuse) {
    slot = reuse.slot; mod = reuse.mod;
    globalThis.__rafSlot = slot;
  } else {
    slot = 'w' + (++modN);
    globalThis.__rafSlot = slot;
    mod = await import('./_extracted_testable.mjs?r=' + slot);
  }
  const seed = (Math.random() * 4294967296) >>> 0;
  const map = MAPS[Math.floor(Math.random() * MAPS.length)];
  /* ★★v170 #341: 名乗ってきたキャラIDを【必ず名簿と突き合わせる】。
     ★v114〜v169 はそのまま startBattle へ渡していた —— 存在しないIDを送るだけで
       その部屋が例外で落ちる(=誰でも他人の試合を壊せる)。
     ★知らないIDなら黙って既定に落とす。断るより、続くほうが被害が小さい。 */
  const okChar = (c) => (typeof c === 'string' && mod.CHAR_DEFS[c]) ? c : mod.CHAR_ORDER[0];
  const chars = [], names = [];
  for (let i = 0; i < ROOM_MAX; i++) {
    const m = members[i];
    chars.push(m ? okChar(m.char) : mod.CHAR_ORDER[Math.floor(Math.random() * mod.CHAR_ORDER.length)]);
    names.push(m ? cleanName(m.name) : 'CPU' + (i + 1));
  }
  for (let i = 0; i < mod.MOB_N; i++) {
    chars.push(mod.CHAR_ORDER[Math.floor(Math.random() * mod.CHAR_ORDER.length)]);
    names.push('刺客');
  }
  const roster = { chars, names };
  mod.startBattle(chars[0], map, seed, roster);
  /* 人が座っている席だけ netInput を付ける = そこはAIが黙る */
  const room = { id, slot, mod, seed, map, roster, members, t: 0, snapAcc: 0, over: false, endT: 0 };
  members.forEach((m, i) => {
    if (!m) return;
    m.room = room; m.slot = i;
    const f = mod.world.fighters[i];
    f.netInput = { mx: 0, mz: 0, facing: 0, dy: 0, atk: false, stand: false, crouch: false,
      jump: false, skill: false, ult: false,
      dash: false, vault: false, climb: false, skillHeld: false };   // ★v181 #394/#398
    m.fighter = f;
    m.sock.send(JSON.stringify({ t: 'start', room: id, seed, map, slot: i, roster }));
  });
  rooms.set(id, room);
  console.log(`[部屋] ${id} 開始 — 人${members.filter(Boolean).length}人 / CPU${ROOM_MAX - members.filter(Boolean).length}人 / ${map} / 種${seed}`);
  return room;
}

function closeRoom(room, why) {
  rooms.delete(room.id);
  for (const m of room.members) {
    if (!m || !m.sock.open) continue;
    m.room = null; m.fighter = null; m.slot = -1;
    m.sock.send(JSON.stringify({ t: 'end', why }));
    waiting.push(m);           // 待合室へ戻す
  }
  try { room.mod.cleanupBattle && room.mod.cleanupBattle(); } catch (e) {}
  /* ★v169 #337: 世界は捨てずに棚へ戻す(次の部屋が使い回す) */
  modPool.push({ slot: room.slot, mod: room.mod });
  console.log(`[部屋] ${room.id} 終了(${why}) — 残り部屋 ${rooms.size} / 空き世界 ${modPool.length}`);
}

/* ---------- 全体の時計 ---------- */
let lastMs = Date.now();
setInterval(() => {
  const now = Date.now();
  let dt = (now - lastMs) / 1000;
  lastMs = now;
  if (dt > 0.05) dt = 0.05;                 // 重くなった時は刻みを丸める(本体と同じ考え)
  globalThis.__advanceClock(dt * 1000);

  for (const room of [...rooms.values()]) {
    globalThis.__rafSlot = room.slot;        // ★v169 #337: 予約の棚は【世界】の名前で引く
    globalThis.__runRaf(room.slot);          // ★その部屋の1フレームだけ進める
    room.t += dt;
    /* 写しを配る */
    room.snapAcc += dt;
    if (room.snapAcc >= 1 / SNAP_HZ) {
      room.snapAcc = 0;
      const snap = room.mod.snapshotWorld();
      const msg = JSON.stringify({ t: 'snap', ...snap });
      for (const m of room.members) if (m && m.sock.open) m.sock.send(msg);
    }
    /* ★★★v176 #389: 落ちている物(チップ・回復・シールド)を配る。
       ★写しには fighters と安置しか入っていなかったので、【撃破で落ちる金のチップが
         繋いでいる人の画面に一度も出なかった】。v125 以降チップは唯一の成長手段
         なので、"見えない"では済まない穴だった。
       ★毎回の写しに混ぜると 67個で約1.4KB × 20回/秒 = 27KB/秒。
         位置がほとんど変わらない物なので【2回/秒だけ別便】= 2.7KB/秒に収めた。 */
    room.orbAcc = (room.orbAcc || 0) + dt;
    if (room.orbAcc >= 1 / ORB_HZ) {
      room.orbAcc = 0;
      try {
        /* ★★v181 #396: 同じ便に【割れた窓の番号一覧】も乗せる。
           ★別便を増やさないのは、どちらも「ほとんど変わらない物」だから ——
             電文の種類が増えるほど、受け側で1つ落とした時の食い違いも増える。 */
        const om = JSON.stringify({ t: 'orbs', o: room.mod.snapshotOrbs(),
          gl: room.mod.snapshotGlass ? room.mod.snapshotGlass() : [],
          /* ★v181 #402: チップの枚数(競技者8席ぶん)。これが無いと
             手元の表示が「チップ -530 / 300」のような負の数になる。 */
          en: room.mod.snapshotEnergy ? room.mod.snapshotEnergy() : [] });
        for (const m of room.members) if (m && m.sock.open) m.sock.send(om);
      } catch (e) { /* 世界が入れ替わる瞬間などは黙って見送る */ }
    }
    /* 終わったか(全滅 or 制限時間) */
    if (!room.over && (room.mod.world.ended || room.t > 600)) { room.over = true; room.endT = 0; }
    if (room.over) { room.endT += dt; if (room.endT > 3) closeRoom(room, room.mod.world.ended ? '決着' : '時間切れ'); }
    /* ★v117 #280: 往復の時間を測る。返事(pog)が来た時に lag を置き直す */
    room.pingAcc = (room.pingAcc || 0) + dt;
    if (room.pingAcc >= 1 / PING_HZ) {
      room.pingAcc = 0;
      for (const m of room.members) {
        if (!m || !m.sock.open) continue;
        m.pingK = (m.pingK || 0) + 1;
        m.pingAt = now;
        m.sock.send(JSON.stringify({ t: 'png', k: m.pingK, rtt: Math.round(m.rtt || 0) }));
      }
    }
    /* 誰も居なくなった部屋は畳む */
    if (!room.members.some((m) => m && m.sock.open)) closeRoom(room, '無人');
  }
}, 1000 / TICK_HZ);

/* ---------- 待合室(マッチング) ---------- */
let waitT = 0;
setInterval(async () => {
  waiting.forEach((m) => { if (!m.sock.open) m.dead = true; });
  for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i].dead) waiting.splice(i, 1);
  if (!waiting.length) { waitT = 0; return; }
  waitT += 0.5;
  /* 8人そろった → すぐ部屋を作る / そろわなくても15秒でCPUを混ぜて開始 */
  if (waiting.length >= ROOM_MAX || waitT >= FILL_WAIT_S) {
    /* ★v169 #336: 上限に達していたら部屋を作らない。★待っている人には
       「満員」と伝え続ける —— 黙って待たせると、壊れていると思われる。 */
    if (rooms.size >= ROOM_LIMIT) {
      const full = JSON.stringify({ t: 'wait', n: waiting.length, need: ROOM_MAX,
        sec: 0, full: true });
      for (const m of waiting) if (m.sock.open) m.sock.send(full);
      return;
    }
    const members = waiting.splice(0, ROOM_MAX);
    while (members.length < ROOM_MAX) members.push(null);
    waitT = 0;
    await makeRoom(members);
  } else {
    const msg = JSON.stringify({ t: 'wait', n: waiting.length, need: ROOM_MAX, sec: Math.max(0, Math.ceil(FILL_WAIT_S - waitT)) });
    for (const m of waiting) if (m.sock.open) m.sock.send(msg);
  }
}, 500);

/* ---------- HTTP(ゲーム本体を配る) ---------- */
/* ★★★v170 #338: 【配ってよいファイルの名簿】。利用者「codeとかも見られたくない」。
   ★v114〜v169 は「フォルダの中の、名前が英数字のファイルなら何でも配る」だった。
     実測: /server.mjs /build.mjs /test_driver.mjs /_extracted_testable.mjs が
     全部 HTTP 200 で落とせた —— 名前を当てるだけでサーバーの中身も
     テストコードも読める状態。自分のPCで動かす場合、そのフォルダに置いてある
     物は【何であれ】外から取れてしまう。
   ★名簿方式にする。★"危ない物を弾く"ではなく"良い物だけ通す" ——
     弾く方式は、次に置いたファイルを守れない(名簿は置いても増えない)。 */
const PUBLIC_FILES = new Set(['index.html']);
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  if (!PUBLIC_FILES.has(file)) { res.writeHead(404); res.end('not found'); return; }
  const full = path.join(HERE, file);
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    const type = full.endsWith('.html') ? 'text/html; charset=utf-8'
      : full.endsWith('.mjs') || full.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    /* ★★v170 #341: 守りのヘッダ。
       ★nosniff: 中身を勝手に別の型と解釈させない
       ★frame-ancestors: 他所のサイトに枠で埋め込んで、なりすましに使わせない
       ★CSP: 読み込んでよい出どころを【three.js を配っている所と自分】だけに絞る。
         ★このゲームは script を1枚の中に直書きしているので unsafe-inline は外せない ——
           外せない物は外せないと書いておく。それでも "他所から script を持ってこられない"
           という一番効く制限は掛かる。 */
    res.writeHead(200, {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': CSP,
    });
    res.end(data);
  });
});

attachWs(server, {
  onOpen(sock) {
    /* ★v170 #341: 入口の蓋。全体の数と、同じIPからの数。 */
    if (clients.size >= CONN_LIMIT) { try { sock.close(); } catch (e) {} return; }
    if (sock.ip) {
      let same = 0;
      for (const c0 of clients.values()) if (c0.sock.ip === sock.ip) same++;
      if (same >= IP_LIMIT) { try { sock.close(); } catch (e) {} return; }
    }
    clients.set(sock, { sock, name: '客', char: 'jotaro', room: null, slot: -1, fighter: null,
      rtt: 0, pingK: 0, pingAt: 0, msgN: 0, msgT: Date.now() });
  },
  onText(sock, str) {
    const c = clients.get(sock);
    if (!c) return;
    /* ★★v170 #341: 流量の蓋。1秒ごとに数え直して、超えたら切る。
       ★"捨てる"ではなく"切る"—— 捨てるだけだと、送り続ける側は
         costが変わらないので攻撃が続く。 */
    const now2 = Date.now();
    if (now2 - c.msgT >= 1000) { c.msgT = now2; c.msgN = 0; }
    if (++c.msgN > MSG_PER_SEC) { try { sock.close(); } catch (e) {} return; }
    if (str.length > 4096) { try { sock.close(); } catch (e) {} return; }
    let m;
    try { m = JSON.parse(str); } catch (e) { return; }
    if (m.t === 'join') {
      c.name = cleanName(m.name);
      c.char = String(m.char || 'jotaro').slice(0, 24);
      if (!c.room && !waiting.includes(c)) waiting.push(c);
      sock.send(JSON.stringify({ t: 'wait', n: waiting.length, need: ROOM_MAX, sec: FILL_WAIT_S }));
    } else if (m.t === 'in') {
      const n = c.fighter && c.fighter.netInput;
      if (!n) return;
      /* ★v170 #341: 送られてくる数は【必ず有限で、決めた範囲に収める】。
         ★NaN や Infinity が1つ入るだけで、その人の座標が壊れて
           世界じゅうの計算(距離・エリア・当たり)が NaN に染まる。 */
      const fin = (v, lo, hi) => { const x = +v; return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0; };
      n.mx = fin(m.mx, -1, 1); n.mz = fin(m.mz, -1, 1);
      n.facing = fin(m.f, -Math.PI * 2, Math.PI * 2); n.dy = fin(m.dy, -8, 8);
      n.atk = !!m.atk; n.stand = !!m.stand; n.crouch = !!m.crouch;
      /* 押した瞬間の物は【消えるまで残す】 —— 1回ぶんの入力を落とさないため */
      if (m.jump) n.jump = true;
      if (m.skill) n.skill = true;
      if (m.ult) n.ult = true;
      /* ★★★v181 #394: ダッシュ・窓抜け・壁登り。
         ★v114〜v180 の電文にはこの3つが無かった —— つまりオンラインでは
           【誰ひとりダッシュできず、窓も抜けられず、壁も登れなかった】。
         ★窓抜けが届かないと、割れた窓が手元だけで割れてサーバー側の箱が残る
           = 利用者の言う「殴っても当たらないけど進めない壁」。 */
      if (m.dash) n.dash = true;
      if (m.vault) n.vault = true;
      n.climb = !!m.climb;        // ★壁登りだけは押しっぱなし(離した瞬間に手が離れる)
      /* ★★★v181 #398: 技ボタンを"押している間"。これが無いと、ネット越しの人は
         タケルのブロッキング/カゲミツの時飛ばし/レンジの設置狙いを
         【一度始めたら二度と解けない】(精神力が尽きるまで吸われ続ける)。 */
      n.skillHeld = !!m.sk;
    } else if (m.t === 'pog') {
      /* ★v117 #280: 返事が返ってきた。★自分が送った番号(k)の返事だけを見る ——
         見ないと、古い返事や作った返事で遅れをいくらでも盛れる。 */
      if (c.pingAt && m.k === c.pingK) {
        applyLag(c, Date.now() - c.pingAt, c.room && c.room.mod);
        c.pingAt = 0;
      }
    }
  },
  onClose(sock) {
    const c = clients.get(sock);
    clients.delete(sock);
    if (!c) return;
    const i = waiting.indexOf(c); if (i >= 0) waiting.splice(i, 1);
    if (c.fighter) c.fighter.netInput = null;      // 抜けた席はCPUが引き継ぐ
    if (c.room) { const j = c.room.members.indexOf(c); if (j >= 0) c.room.members[j] = null; }
  },
});

server.listen(PORT, () => {
  console.log(`POPO'S LAST SURVIVOR サーバー起動 — http://localhost:${PORT}/`);
  console.log(`  1部屋 ${ROOM_MAX}人 / ${FILL_WAIT_S}秒で埋まらなければCPUが埋める`);
  console.log(`  同時に立てられる部屋: ${ROOM_LIMIT}(環境変数 ROOMS で変えられる)`);
  console.log('  同じWi-Fiの人は  http://<このPCのIP>:' + PORT + '/  を開く');
});
export { server, rooms, waiting, makeRoom, applyLag, clients };
