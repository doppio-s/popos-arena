/* 同じ種で試合を立て、出現位置が「全員が全地点」になっていないか、
   出現直後に壁の中にいないかを数字で見る。 */
import './server_env.mjs';
const mod = await import('./_extracted_testable.mjs');
const { startBattle, cleanupBattle, world, town, TOTAL_FIGHTERS, CHAR_ORDER, MOB_N } = mod;

function inWall(f) {
  const x = f.pos.x, z = f.pos.z, y = f.y, r = 0.55;
  for (const b of town.buildings) {
    if (b.dead) continue;
    if (y >= b.h - 0.01) continue;
    if (y + 1.65 <= (b.y0 || 0)) continue;
    if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return true;
  }
  return false;
}

const maps = ['skyline', 'venezia', 'cairo', 'colosseo', 'minato'];
const seed = 3439276824; // 利用者が遊んだ skyline の種に近い形で固定
let bad = 0;
const say = (s) => console.log(s);

function roster() {
  const chars = [], names = [];
  for (let i = 0; i < TOTAL_FIGHTERS; i++) { chars.push('itoha'); names.push('席' + (i + 1)); }
  for (let i = 0; i < MOB_N; i++) { chars.push(CHAR_ORDER[0]); names.push('刺客'); }
  return { chars, names };
}

for (const map of maps) {
  startBattle('itoha', map, seed, roster(), 0);
  const pos = world.fighters.map((f, i) => ({
    i, name: f.name, x: +f.pos.x.toFixed(2), z: +f.pos.z.toFixed(2), y: +f.y.toFixed(2),
    r: Math.hypot(f.pos.x, f.pos.z),
    trapped: inWall(f),
    fromSpot: !!f._spawnFromSpot,
  }));
  const key = (p) => p.x.toFixed(1) + ',' + p.z.toFixed(1);
  const dup = new Map();
  for (const p of pos) dup.set(key(p), (dup.get(key(p)) || 0) + 1);
  const dups = [...dup.entries()].filter(([, n]) => n > 1);
  const trapped = pos.filter((p) => p.trapped);
  const noSpot = pos.filter((p) => !p.fromSpot);
  say(`=== ${map} 人${TOTAL_FIGHTERS} 刺客${MOB_N} 箱${town.buildings.length} ===`);
  say('位置: ' + pos.map((p) => `#${p.i}(${p.x},${p.z})r${p.r.toFixed(0)}${p.trapped ? ' ★壁' : ''}`).join(' '));
  if (dups.length) { say('★同じ地点に複数: ' + dups.map(([k, n]) => k + 'x' + n).join(' | ')); bad++; }
  if (trapped.length) { say('★壁の中で出現: ' + trapped.map((p) => '#' + p.i).join(',')); bad++; }
  if (noSpot.length) { say('予備地点: ' + noSpot.map((p) => '#' + p.i).join(',')); }
  cleanupBattle();
}

/* 同じ種を2回立てて、出現位置が一致するか */
startBattle('itoha', 'skyline', seed, roster(), 0);
const a = world.fighters.map((f) => [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)]);
cleanupBattle();
startBattle('itoha', 'skyline', seed, roster(), 0);
const b = world.fighters.map((f) => [+f.pos.x.toFixed(2), +f.pos.z.toFixed(2)]);
cleanupBattle();
const mismatch = a.filter((p, i) => p[0] !== b[i][0] || p[1] !== b[i][1]);
say('同じ種の再現: ' + (mismatch.length ? '★ずれた ' + mismatch.length + '人' : '一致'));
if (mismatch.length) bad++;

say(bad ? `\n不合格 ${bad}` : '\n重複も壁の中の出現もなし');
process.exit(bad ? 1 : 0);
