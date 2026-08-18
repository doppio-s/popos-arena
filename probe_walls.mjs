/* 「見えない壁」を、遊ばずに洗い出す。
   ★狙い: 立って歩いている人(足元 y=0 / 身長1.65m / 半径0.55m)を止める箱のうち、
     【止まる理由が絵から読み取れない物】を挙げる。
   ★怪しさの根拠は当たり判定の条件そのもの:
       spotFree: y >= b.h-0.01 なら無視(乗れる高さ)
                 y + 1.65 <= b.y0 なら無視(頭より上)
                 standable かつ b.h - y <= 0.46 なら無視(またげる)
     つまり以下の2種類は「絵では通れそうなのに止まる」箱になる。
       A) 低いのに乗れない: h が 0.46〜0.95 で standable でない
          → 膝〜腰の高さ。またげず、乗れず、壁にも見えない。
       B) 浮いているのに足を止める: b.y0 が 0.9 以上(頭より下だが腰より上)
          → 庇・梁・橋の下。絵ではくぐれるのに、体ごと止まる。
   使い方: node probe_walls.mjs [地図名...]   (既定=全部) */
import './server_env.mjs';
globalThis.__rafSlot = 'walls';
const mod = await import('./_extracted_testable.mjs?r=walls');
const { startBattle, town, CHAR_DEFS, CHAR_ORDER, MAP_DEFS, WORLD_R } = mod;

const want = process.argv.slice(2);
const maps = MAP_DEFS.map((m) => m.id).filter((id) => !want.length || want.includes(id));
const BODY_H = 1.65;
const STEP_OVER = 0.46;

const fix = (v) => (Math.round(v * 100) / 100);

for (const mapId of maps) {
  const seed = 12345;
  const chars = [];
  const names = [];
  for (let i = 0; i < 8; i++) { chars.push(CHAR_ORDER[i % CHAR_ORDER.length]); names.push('x'); }
  startBattle(chars[0], mapId, seed, { chars, names }, -1);

  const lowBlock = [];      // A) 低いのにまたげない
  const overhead = [];      // B) 浮いているのに足を止める
  for (const b of town.buildings) {
    if (b.dead) continue;
    const y0 = b.y0 || 0;
    if (Math.hypot(b.x, b.z) > WORLD_R + 4) continue;
    const area = (b.hw * 2) * (b.hd * 2);
    if (area < 0.02) continue;                 // 飾りの極小物は数えない
    /* 足元 y=0 の人を止めるか */
    const blocksFeet = (0 < b.h - 0.01) && (BODY_H > y0)
      && !(b.standable && b.h <= STEP_OVER);
    if (!blocksFeet) continue;
    if (y0 >= 0.9) {
      overhead.push(b);
    } else if (b.h <= 0.95 && !b.standable) {
      lowBlock.push(b);
    }
  }

  const brief = (list, n) => list.slice(0, n).map((b) =>
    `(${fix(b.x)},${fix(b.z)}) 高${fix(b.h)} 下${fix(b.y0 || 0)} 半${fix(b.hw)}x${fix(b.hd)}`
    + `${b.glassRef ? ' 窓' : ''}${b.standable ? ' 乗れる' : ''}`).join('\n    ');

  console.log('=== ' + mapId + ' — 箱' + town.buildings.length + '個');
  console.log('  A) 低いのにまたげず乗れない: ' + lowBlock.length + '個');
  if (lowBlock.length) console.log('    ' + brief(lowBlock, 8));
  console.log('  B) 浮いているのに足を止める: ' + overhead.length + '個');
  if (overhead.length) console.log('    ' + brief(overhead, 8));
}
process.exit(0);
