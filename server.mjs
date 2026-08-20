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

/* ★v212 #436: エンジン版数を起動時に控える。HTMLは毎リクエスト読み直すが、
   審判エンジンは起動時に抽出したまま —— ファイルだけ差し替えると
   「配るHTMLは新しいのに判定は古い」が起きる(v211で実際に起きた)。
   startにこの版数を同梱し、手元と違えば遊ぶ人へ知らせる。 */
const ENGINE_VER = (() => {
  try { return (fs.readFileSync(path.join(HERE, 'index.html'), 'utf8')
    .match(/GAME_VERSION = '([^']+)'/) || [])[1] || '?'; } catch (e) { return '?'; }
})();

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
/* ★v217: veneziaは引退(利用者の指示。バグ記録の大半がこの地図だった)。
   戻す時はここに 'venezia' を足し、index.html の MAP_DEFS から retired を外す。 */
const MAPS = ['cairo', 'colosseo', 'skyline'];

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
  /* サーバーに「操作している自分」は居ない。席0を isPlayer にすると、
     その席の人が抜けたあと CPU がキーボード待ちでスポーンに凍る。 */
  mod.startBattle(chars[0], map, seed, roster, -1);
  /* 人が座っている席だけ netInput を付ける = そこはAIが黙る */
  const room = { id, slot, mod, seed, map, roster, members, t: 0, snapAcc: 0, over: false, endT: 0 };
  mod.world.onAct = (f, act, ok) => { try { watchAct(room, f, act, ok); } catch (e) {} };
  /* 技を断った理由を、その席の人へ届ける。手元には isPlayer が居ても
     判定をしているのは審判なので、審判が喋らないと理由は消える。 */
  mod.world.onSay = (f, msg) => {
    const m = room.members.find((x) => x && x.fighter === f);
    if (!m || !m.sock.open) return;
    try { m.sock.send(JSON.stringify({ t: 'say', m: String(msg).slice(0, 40) })); } catch (e) {}
  };
  members.forEach((m, i) => {
    if (!m) return;
    m.room = room; m.slot = i;
    const f = mod.world.fighters[i];
    f.netInput = { mx: 0, mz: 0, facing: 0, dy: 0, atk: false, stand: false, crouch: false,
      jump: false, skill: false, ult: false,
      dash: false, vault: false, climb: false, skillHeld: false,
      ax: NaN, ay: NaN, az: NaN, q: 0 };
    m.fighter = f;
    m.sock.send(JSON.stringify({ t: 'start', room: id, seed, map, slot: i, roster,
      humans: members.filter(Boolean).length, sv: ENGINE_VER }));
  });
  /* ★v213 #442: 計測用 —— NOBOTS=1 で立てたサーバーはCPUの敵と刺客を眠らせる。
     ネット品質の物差しから戦闘の乱数(殴られて飛ばされた分)を取り除くため。本番では使わない。 */
  if (process.env.NOBOTS) {
    for (const f of mod.world.fighters) if (!f.netInput) { f.alive = false; f.hp = 0; }
  }
  rooms.set(id, room);
  console.log(`[部屋] ${id} 開始 — 人${members.filter(Boolean).length}人 / CPU${ROOM_MAX - members.filter(Boolean).length}人 / ${map} / 種${seed}`);
  return room;
}

/* ★★★v182 #404: 【走っている部屋の空席に座らせる】。
   利用者「何故かサーバーがfullとか言われる」。
   ★正体: ROOMS=1(無料枠のCPUが1部屋ぶんしか無い)ので、誰かが試合中だと
     次の人は必ず「満員」になる —— つまり【友達が後から入れない】。
     待合室は"次の部屋が空くまで"待つ作りで、最大10分待たされることになる。
   ★部屋には最初から8席あり、人が居ない席はCPUが動かしている(v114の継ぎ目)。
     抜けた人の席は onClose が netInput を外してCPUに戻している —— つまり
     【席の受け渡しは元から出来ていた】。入口側でそれを使っていなかっただけ。
   ★だから部屋を増やさずに解決する = CPUの負担は1ミリも増えない。
   ★生きている席にだけ座らせる。死体に座らせると、入った瞬間に観戦になる。 */

/* ★★★v188 #413: 【途中参加した人を、公平な状態で座らせる】。
   利用者「スポーン地点からスキルとか使ってもほぼ動けない」——
   本物のサーバーにつないでテストプレイして、これが再現した。

   ★何が起きていたか:
     ROOMS=1 なので、部屋が1つ走っていると次の人は必ず途中参加(v182 #404)になる。
     その席を動かしていたのはCPUで、【体力が残り少ない】ことも
     【安置(エリア)の外に立っている】こともある。
     座った瞬間にCPUの思考は止まる(netInput が付くと updateAI が黙る)ので、
     人が操作を始める前の1〜2秒、その体は【棒立ちのまま】エリアの外で焼かれる。
     実測: 途中参加して1.5秒後には hp=0。8方向どこへ歩いても 0.00m ——
     利用者の言う「湧いた所からスキルを使っても動けない」そのもの。
   ★しかも【死んだ瞬間を手元が見ていない】ので、死亡画面も出ない。
     本人には「理由もなく動けない」としか映らない。

   ★直し: 席を引き継ぐ時は、体力・精神力を満タンに戻し、
     【今の安置の内側】の空いている所へ置き直す。少しの無敵も付ける
     (置き直した直後に流れ弾で消えないだけの猶予)。
   ★レベルとチップは引き継ぐ —— 途中から入って裸一貫では、もう追いつけない。 */
/* ★★v216 #448: 「リスポーン直後すぐ殺される」の直し。
   v188 の無敵2秒は【席に座った瞬間】から数えていた —— でも本人の画面は
   そこから地図を組み立てている(重いPCで1〜3秒)。見えた頃には無敵が切れ、
   12m先の敵は走れば1.5秒で届く。= 本人には「湧いた瞬間に殺された」。
   ★直し3点:
     1) 保護は invulnT でなく protT(被弾だけ防ぐ)。invulnT は窓をすり抜ける性質を
        持つので、審判だけが長く持つと手元との窓の食い違い=見えない壁の種になる。
     2) 座った時は8秒(読み込みの上限)。【最初の入力が届いた時】= 画面が見えた時に
        2.5秒へ縮めて、そこから数え直す。攻撃したら0.15秒で即解除(守られたまま殴れない)。
     3) 置き直しは敵から25m以上(無ければ14m→8mと緩める)。 */
const SEAT_PROT_LOAD = 8.0;    // 座ってから最初の入力までの保護(読み込みの上限)
const SEAT_PROT_PLAY = 2.5;    // 最初の入力が届いてからの保護
function takeoverSpot(mod, f) {
  const z = mod.world.zone;
  const R = Math.max(6, (z.r || 60) * 0.7);
  for (let t = 0; t < 420; t++) {
    const minD = t < 280 ? 25 : (t < 380 ? 14 : 8);   // ★v216: まず25m、無ければ緩める
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R;
    const x = (z.cx || 0) + Math.cos(a) * r, zz = (z.cz || 0) + Math.sin(a) * r;
    if (Math.hypot(x, zz) > mod.WORLD_R - 6) continue;
    const gy = mod.groundHeightAt(x, zz, 0.5, 0.45);
    if (gy > 0.6) continue;                       // 地上だけ(屋上に湧かせない)
    if (!mod.spotFree(x, zz, gy, 0.7)) continue;  // 立てない所は選ばない
    let near = false;
    for (const o of mod.world.fighters) {
      if (o === f || !o.alive) continue;
      if (Math.hypot(o.pos.x - x, o.pos.z - zz) < minD) { near = true; break; }
    }
    if (near) continue;                           // 敵の真隣に湧かせない
    return { x, z: zz, y: gy };
  }
  return null;
}
function prepareTakeover(room, f) {
  const mod = room.mod;
  f.alive = true;
  f.hp = f.maxHp;
  f.sp = f.maxSp;
  f.spExhaust = 0;
  f.stunT = 0; f.slowT = 0;
  f.protT = SEAT_PROT_LOAD;          // ★v216 #448: 着地保護(被弾だけ防ぐ)
  f._seatFresh = true;               //   最初の入力が届いたら SEAT_PROT_PLAY へ縮める
  if (f.knock) f.knock.set(0, 0, 0);
  try {
    const s = takeoverSpot(mod, f);
    if (s) { f.pos.x = s.x; f.pos.z = s.z; f.y = s.y; f.vy = 0; f.grounded = true; }
  } catch (e) { /* 置き直せなくても、体力が戻っているだけで詰みは消える */ }
  return f;
}

function seatInto(room, seat, c) {
  const f = room.mod.world.fighters[seat];
  if (!f) return false;
  prepareTakeover(room, f);          // ★v188 #413: 公平な状態にしてから渡す
  room.members[seat] = c;
  c.room = room; c.slot = seat; c.fighter = f;
  f.netInput = { mx: 0, mz: 0, facing: 0, dy: 0, atk: false, stand: false, crouch: false,
    jump: false, skill: false, ult: false,
    dash: false, vault: false, climb: false, skillHeld: false,
    ax: NaN, ay: NaN, az: NaN, q: 0 };
  const humans = room.members.filter((x) => x && x.sock && x.sock.open).length;
  c.sock.send(JSON.stringify({ t: 'start', room: room.id, seed: room.seed,
    map: room.map, slot: seat, roster: room.roster, humans, sv: ENGINE_VER }));
  for (const m of room.members) {
    if (!m || m === c || !m.sock || !m.sock.open) continue;
    try { m.sock.send(JSON.stringify({ t: 'humans', n: humans })); } catch (e) {}
  }
  console.log(`[部屋] ${room.id} に途中参加 — 席${seat + 1} (${c.name})`
    + ` → (${f.pos.x.toFixed(0)}, ${f.pos.z.toFixed(0)}) 体力満タン / 人${humans}`);
  return true;
}
function findOpenSeat() {
  for (const room of rooms.values()) {
    if (room.over) continue;
    for (let i = 0; i < ROOM_MAX; i++) {
      const m = room.members[i];
      if (m && m.sock.open) continue;              // 人が座っている
      const f = room.mod.world.fighters[i];
      if (!f) continue;
      /* ★v188 #413: 倒れている席も使えるようにした。
         ★v182 は「死体に座らせると入った瞬間に観戦になる」ので避けていたが、
           それは【座らせ方】の問題だった —— prepareTakeover が体力を戻して
           安置の内側へ置き直すので、倒れている席でも公平に始められる。
         ★ROOMS=1 では席が8つしかない。生きている席だけに絞ると、
           終盤は「満員」と言われて友達が一切入れない。 */
      return { room, seat: i };
    }
  }
  return null;
}
/* 待っている人を、空いている席へ順に座らせる。座れた人数を返す。
   ★【入った瞬間に】呼ぶのが肝。待合室の時計(15秒)を待たせると、
     友達は"満員"の画面を15秒見ることになる —— それが利用者の見た症状。 */
function fillOpenSeats() {
  let n = 0;
  for (let i = waiting.length - 1; i >= 0; i--) {
    const c = waiting[i];
    if (!c.sock.open) continue;
    const open = findOpenSeat();
    if (!open) break;
    waiting.splice(i, 1);
    try { seatInto(open.room, open.seat, c); n++; } catch (e) { waiting.push(c); break; }
  }
  return n;
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

/* ★★★v200: 「押しているのに進まない」瞬間を、審判の側から記録する。
   ★手元の記録(黒箱)はもう使えない —— v197で位置の決定権がサーバーへ移ったので、
     手元は「自分がなぜ止まっているか」を知らない。実際、利用者の画面には
     引っかかりの記録に【まわりに壁なし】と出ていた。壁が無いのは本当で、
     ただし手元から見た話にすぎない。
   ★だから審判が持っている物を全部並べる: 出た距離 / 想定 / 体の状態 / 近くの箱。
     ここで「箱なし・状態なし」と出たら、当たり判定でも技でもない何かが
     入力を捨てているということになり、探す場所が一段絞れる。 */
/* その瞬間、体がどんな都合を抱えていたか。止まりも操作拒否も同じ物差しで見る。 */
function stateTags(f) {
  const st = [];
  const on = (c, s) => { if (c) st.push(s); };
  on(f.stunT > 0, '気絶' + (f.stunT || 0).toFixed(2));
  on(!f.grounded, '空中');
  on(f.ropeT >= 0, '糸');
  on(f.vaultT >= 0, '乗り越え');
  on((f.climbT || 0) > 0, '壁登り');
  on((f.diveT || 0) > 0, '潜り');
  on(f.blinkT >= 0, '瞬間移動');
  on(f.rollerT >= 0 || f.rollerDropT >= 0 || f.rollerAiming, '落下奥義');
  on((f.tsChargeT || 0) > 0, '時止め溜め');
  on(f.swingT >= 0, '殴り');
  on(!!f.attackHeld, '攻撃押し');
  on(!!f.standOn, '構え');
  on(!!f.crouch, 'しゃがみ');
  on(!!f.inWater, '水');
  on((f.spExhaust || 0) > 0, '息切れ');
  on((f.skillCd || 0) > 0, '技待ち' + (f.skillCd || 0).toFixed(2));
  on(f.knock && f.knock.lengthSq && f.knock.lengthSq() > 0.001, 'のけぞり');
  on(f.airBullet && f.airBullet.life > 0, '空気弾');
  return st;
}

/* ★★★v201: 押した瞬間の操作を審判が受け取り、通したか弾いたかを書き留める。
   ★弾かれた時、手元には音も表示も出ない —— 利用者からは
     「ジャンプもスキルも使えない」としか見えない。理由をここに残す。 */
function watchAct(room, f, act, ok) {
  const m = room.members.find((x) => x && x.fighter === f);
  if (!m) return;                                  // CPUの操作は書かない
  if (ok) {
    room._actOk = (room._actOk || 0) + 1;
    if (room._actOk % 8 !== 1) return;              // 通った物は間引いて残す
  }
  const d = f.def || {};
  console.log(`[操作] ${m.name || '?'} 席${m.slot + 1} ${d.id} ${act} ${ok ? '通った' : '★弾いた'}`
    + ` 精神${Math.round(f.sp || 0)}/技代${Math.round(room.mod.skillCostOf
        ? room.mod.skillCostOf(d.id, f.level) : -1)}`
    + ` 段${f.level}(技は段${d.skillLv || 1}から/奥義は段${d.ultLv || 1}から)`
    + (d.id === 'itoha' ? ` フック残${(f.hookCharge || 0).toFixed(2)}` : '')
    + ` 状態[${stateTags(f).join(' ') || 'なし'}]`);
}

function watchStuck(room, m, dt) {
  const f = m.fighter;
  const n = f && f.netInput;
  if (!f || !n || !f.alive) { m._stuckT = 0; m._sx = undefined; return; }
  const mag = Math.hypot(n.mx || 0, n.mz || 0);
  const px = m._sx, pz = m._sz;
  m._sx = f.pos.x; m._sz = f.pos.z;
  m._stuckCd = Math.max(0, (m._stuckCd || 0) - dt);
  if (px === undefined) return;
  const base = (f.def && f.def.stats && f.def.stats.speed) || 7;
  const want = mag * base * dt;
  const got = Math.hypot(f.pos.x - px, f.pos.z - pz);
  if (mag > 0.35 && want > 0.001 && got < want * 0.2) m._stuckT = (m._stuckT || 0) + dt;
  else m._stuckT = 0;
  if (m._stuckT < 0.5 || m._stuckCd > 0) return;
  m._stuckCd = 6; m._stuckT = 0;
  const st = stateTags(f);
  let boxes = [];
  try { boxes = room.mod.bbBlockers(f, 3) || []; } catch (e) {}
  console.log(`[止まり] ${m.name || '?'} 席${m.slot + 1} ${room.map}`
    + ` (${f.pos.x.toFixed(1)}, ${f.pos.z.toFixed(1)}) 高${(f.y || 0).toFixed(2)}`
    + ` 指${mag.toFixed(2)} 出${got.toFixed(3)}m/想定${want.toFixed(3)}m`
    + ` 精神${Math.round(f.sp || 0)}`
    + ` 状態[${st.join(' ') || 'なし'}]`
    + ` 箱[${boxes.length ? boxes.join(' | ') : 'なし'}]`);
  /* ★v204: 箱の中に埋まっている時だけ引きはがす。正面の壁に押し付けている分は触らない。 */
  try {
    if (room.mod.trappedInGeometry && room.mod.trappedInGeometry(f) && room.mod.unstickFighter) {
      room.mod.unstickFighter(f);
      console.log(`[止まり] ${m.name || '?'} 席${m.slot + 1} 引きはがした → (${f.pos.x.toFixed(1)}, ${f.pos.z.toFixed(1)})`);
    }
  } catch (e) {}
}

/* ---------- 全体の時計 ---------- */
let lastMs = Date.now();
let tickAcc = 0;
setInterval(() => {
  const now = Date.now();
  let wall = (now - lastMs) / 1000;
  lastMs = now;
  /* ★v196: 重い時に 0.05 で切ると、ゲーム時間が実時間より遅れる。
     手元は60fpsで歩き、サーバーはスポーン付近のまま → 3mで引き戻される。
     遅れ分は 0.05秒コマを追いつかせる。
     ★★v197: 50msおきに起きる作りだと、混んでいる時に起きるのが遅れ、
       【1回で5コマまとめて進めて写しも1通だけ】になる。受け側から見ると
       写しの間隔が 50ms と 250ms を行き来する = 止まって追いつくの繰り返し。
       さらに、まとめ進めの間は古い入力が使われ続けるので、
       スティックを離しても数m滑る。
       10msおきに様子を見て、溜まった分だけ 0.05秒コマを進める形にした。
       1回で進めるのは2コマまで —— 上限を大きくすると、まとめ進めが戻ってくる。 */
  if (wall > 0.25) wall = 0.25;
  const step = 1 / TICK_HZ;
  tickAcc += wall;
  let n = 0;
  while (tickAcc >= step && n < 2) { tickAcc -= step; n++; }
  if (!n) return;
  for (let k = 0; k < n; k++) {
    globalThis.__advanceClock(step * 1000);
    for (const room of [...rooms.values()]) {
      globalThis.__rafSlot = room.slot;
      globalThis.__runRaf(room.slot);
    }
  }
  const dt = step * n;

  for (const room of [...rooms.values()]) {
    room.t += dt;
    /* 写しを配る */
    /* ★★v207 #423: 回線が詰まって入力が0.35秒来ない席は【その場で足を止める】。
       止めないと、詰まりの間じゅう審判の中の体だけが最後の向きへ走り続け、
       回復した瞬間に3m超のズレ=強制引き戻しになる(揺らぎ試験で実測)。
       ★v208: 0.35秒だと、詰まり中に手元が逆へ歩いた分と合わさって3mの線を
       またぐ回が残った(実測3.08m)。0.25秒×7.6m/s=1.9m に締める。
       入力は60回/秒で届くので、0.25秒無音=本物の詰まりだけが該当する。 */
    { const nowIn = Date.now();
      for (const mb of room.members) {
        if (!mb || !mb.fighter || !mb.fighter.netInput) continue;
        if (mb.lastInT && nowIn - mb.lastInT > 450) {
          const ni = mb.fighter.netInput;
          ni.mx = 0; ni.mz = 0; ni.atk = false; ni.skillHeld = false;
        }
      }
    }
    room.snapAcc += dt;
    if (room.snapAcc >= 1 / SNAP_HZ) {
      /* ★v197: 0 に戻すと余りを捨てるので、配る間隔が少しずつ伸びる。差し引きにする。 */
      room.snapAcc -= 1 / SNAP_HZ;
      if (room.snapAcc > 1 / SNAP_HZ) room.snapAcc = 0;
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
    /* 終わったか(全滅 or 制限時間)
       ★v205: 人が1人の部屋は手元が試合を動かしている。
         サーバー側の体は入力が来ないので安置で死に、審判が「決着」にして
         数秒で部屋を畳む → 遊んでいる最中に線が切れる。
         1人の間は審判の決着では畳まない。無人・10分・人が2人以上の決着だけ。 */
    const liveH = room.members.filter((m) => m && m.sock && m.sock.open).length;
    if (!room.over && (room.t > 600 || (liveH >= 2 && room.mod.world.ended))) {
      room.over = true; room.endT = 0;
    }
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
    for (const m of room.members) if (m && m.sock.open) watchStuck(room, m, dt);
    /* 誰も居なくなった部屋は畳む */
    if (!room.members.some((m) => m && m.sock.open)) closeRoom(room, '無人');
  }
}, 10);

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
      /* ★v182 #404: 断る前に【走っている部屋の空席】へ入れてみる。
         ★これで「友達が後から入る」が成立する(部屋は増やさないのでCPUはそのまま)。 */
      fillOpenSeats();
      if (!waiting.length) { waitT = 0; return; }
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
      /* ★★v182 #404: 部屋がもう立てられない時は【その場で空席を探す】。
         ★待合室の時計を待たせると、友達は"満員"の画面を最大15秒見ることになる。 */
      if (rooms.size >= ROOM_LIMIT) fillOpenSeats();
      if (c.room) return;                       // 席に着けた = もう待合室に用は無い
      sock.send(JSON.stringify({ t: 'wait', n: waiting.length, need: ROOM_MAX, sec: FILL_WAIT_S }));
    } else if (m.t === 'in') {
      const n = c.fighter && c.fighter.netInput;
      if (!n) return;
      c.lastInT = Date.now();   /* ★v207 #423: 最後に入力が届いた時刻 */
      /* ★v216 #448: 着地保護は【最初の入力が届いた時】から数え直す。
         入力は画面が動き出すと勝手に60回/秒で流れてくる = 「見えた」合図に使える。
         攻撃・技・奥義を押したら即解除(守られたまま殴るのは無し)。 */
      { const ff = c.fighter;
        if (ff && ff._seatFresh) {
          ff._seatFresh = false;
          ff.protT = Math.min(Math.max(ff.protT || 0, 0), SEAT_PROT_PLAY);
          ff._seatProt = true;
        }
        if (ff && ff._seatProt) {
          if (m.atk || m.skill || m.ult) { ff._seatProt = false; ff.protT = Math.min(ff.protT || 0, 0.15); }
          else if ((ff.protT || 0) <= 0) ff._seatProt = false;
        }
      }
      /* ★v170 #341: 送られてくる数は【必ず有限で、決めた範囲に収める】。
         ★NaN や Infinity が1つ入るだけで、その人の座標が壊れて
           世界じゅうの計算(距離・エリア・当たり)が NaN に染まる。 */
      const fin = (v, lo, hi) => { const x = +v; return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : 0; };
      /* ★v203: 指示の番号。手元がこの番号で自分の位置を覚えているので、
         写しに載せて返す = 手元は「同じ時点どうし」で較べられる。 */
      { const q = +m.q; if (Number.isFinite(q) && q > (n.q || 0)) n.q = Math.min(2e9, q); }
      n.mx = fin(m.mx, -1, 1); n.mz = fin(m.mz, -1, 1);
      /* ★#441は実測で棄却: 入力を平均すると「q番まで反映」の返事と中身がズレて、
         曲がるたび偽の誤差を自分で作っていた(敵なし計測で42m/45秒のドラグ)。最新1個に戻す。 */
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
      /* ★★★v185 #407: 狙いの線の【起点】。角度だけだとサーバーは体の中心から
         線を引くので、手元のクロスヘア(肩越しの注視点)と別の物に当たる。
         ★範囲は広めに取って、体からの距離の制限は index.html 側(AIM_ORIGIN_MAX)で
           掛ける —— "どこまで許すか"の判断は世界の側に1つだけ置く。 */
      n.ax = fin(m.ax, -600, 600); n.ay = fin(m.ay, -100, 400); n.az = fin(m.az, -600, 600);
    } else if (m.t === 'gb') {
      /* ★★v216 #450: 手元が予測で割った窓の番号。手元だけ割れて審判に板が残ると
         「割れた窓に押し戻される見えない壁」、逆なら「板をすり抜ける」に見える。
         ★中身は信用しない: 実在する番号で、まだ生きていて、
           本人がその窓から6m以内の時だけ割る(遠くの窓を割る嘘は捨てる)。 */
      const f = c.fighter, room = c.room;
      if (!f || !f.alive || !room || !room.mod) return;
      const gl = room.mod.town && room.mod.town.glassList;
      const g = gl && gl[m.i | 0];
      if (!g || !g.alive) return;
      if (Math.hypot(g.cx - f.pos.x, g.cz - f.pos.z) > 6) return;
      try { room.mod.breakGlass(g); } catch (e) {}
    } else if (m.t === 'diag') {
      /* ★★v198: 遊んでいる人の手元の実測値を記録に残す。
         ★「カクつく」の一言では、絵が重いのか写しが遅れているのかが分からない。
           fps が低ければ絵の話、g90/gmax が大きいか stv(待ち時間の割合)が
           高ければ通信の話 —— 直す場所が正反対になる。
         ★記録は1人3秒に1行。名前と席だけで、位置や操作は残さない。 */
      const num = (v, hi) => { const x = +v; return Number.isFinite(x) ? Math.min(hi, Math.max(0, Math.round(x))) : -1; };
      console.log(`[手元] ${c.name || '?'} 席${c.slot + 1}`
        + ` fps${num(m.fps, 500)}`
        + ` 写し中央${num(m.g50, 9999)}ms/9割${num(m.g90, 9999)}ms/最大${num(m.gmax, 99999)}ms`
        + ` 待ち${num(m.stv, 100)}%`
        + ` 往復${num(m.rtt, 99999)}ms`
        + ` 先読みのずれ${num(m.fx, 99999)}cm 合わせ直し${num(m.sn, 9999)}回`);
    } else if (m.t === 'bug') {
      /* ★★v209 #426: 遊んでいる人の画面が検知した異常を書き溜める。
         利用者に「いちいち報告」させないための受け口。
         ★中身は信用しない: 長さを刻み、1人1分5件まで、ファイルは500KBで打ち切り。 */
      const nowB = Date.now();
      if (!c.bugT || nowB - c.bugT > 60000) { c.bugT = nowB; c.bugN = 0; }
      if (++c.bugN <= 5) {
        const line = `[${new Date().toISOString()}] ${String(m.v || '?').slice(0, 12)} ${String(m.k || '?').slice(0, 24)}`
          + ` 地図=${String(m.m || '?').slice(0, 12)} 座標=${String(m.pos || '?').slice(0, 40)}`
          + ` ${String(m.d || '').slice(0, 220)} (${c.name})\n`;
        console.log('★バグ通報 ' + line.trim());
        import('fs').then((fs) => {
          try {
            const F = 'バグ記録.txt';
            let ok = true;
            try { ok = !fs.existsSync(F) || fs.statSync(F).size < 500000; } catch (e) {}
            if (ok) fs.appendFileSync(F, line);
          } catch (e) {}
        }).catch(() => {});
      }
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
    if (c.room) {
      const j = c.room.members.indexOf(c); if (j >= 0) c.room.members[j] = null;
      const humans = c.room.members.filter((x) => x && x.sock && x.sock.open).length;
      for (const m of c.room.members) {
        if (!m || !m.sock || !m.sock.open) continue;
        try { m.sock.send(JSON.stringify({ t: 'humans', n: humans })); } catch (e) {}
      }
    }
  },
});

server.listen(PORT, () => {
  console.log(`POPO'S LAST SURVIVOR サーバー起動 — http://localhost:${PORT}/`);
  console.log(`  審判エンジンの版: ${ENGINE_VER} (index.html を差し替えたら立ち上げ直すこと)`);
  console.log(`  1部屋 ${ROOM_MAX}人 / ${FILL_WAIT_S}秒で埋まらなければCPUが埋める`);
  console.log(`  同時に立てられる部屋: ${ROOM_LIMIT}(環境変数 ROOMS で変えられる)`);
  console.log('  同じWi-Fiの人は  http://<このPCのIP>:' + PORT + '/  を開く');
});
export { server, rooms, waiting, makeRoom, applyLag, clients };
