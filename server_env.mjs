/* ★★v114 #277: サーバー用のブラウザもどき。
   ★テスト環境(_balenv.mjs)とほぼ同じだが、1つだけ大事な違いがある:
     【部屋ごとに requestAnimationFrame の置き場所を分ける】。
     1つのプロセスで何部屋も動かすので、置き場所が1つだと部屋Bの予約が
     部屋Aの予約を上書きして、片方の試合が止まる。
   ★globalThis.__rafSlot に部屋の名前を入れてから読み込む/回すことで、
     その部屋の予約がその部屋の棚に入る。 */
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;

const rafSlots = new Map();
globalThis.__rafSlot = 'main';
globalThis.requestAnimationFrame = (fn) => { rafSlots.set(globalThis.__rafSlot, fn); return 1; };
globalThis.__runRaf = (slot) => {
  const fn = rafSlots.get(slot);
  if (!fn) return false;
  rafSlots.delete(slot);
  fn();
  return true;
};

let fakeNow = 0;
globalThis.performance = { now: () => fakeNow };
globalThis.__advanceClock = (ms) => { fakeNow += ms; };

globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const HIDDEN_AT_BIRTH = new Set(['cfgScreen', 'crouchBtn', 'vaultBtn', 'moveHint', 'tsClock', 'crimsonClock', 'cancelBtn', 'perfHud']);
function makeFakeElement(id) {
  const el = {
    id,
    style: { setProperty() {}, removeProperty() {} },
    classList: {
      _set: new Set(HIDDEN_AT_BIRTH.has(id) ? ['hidden'] : []),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
      toggle(c, on) { if (on === undefined) on = !this._set.has(c); if (on) this._set.add(c); else this._set.delete(c); },
    },
    children: [], parentNode: null, _innerHTML: '', textContent: '',
    get innerHTML() { return this._innerHTML; },
    set innerHTML(v) { this._innerHTML = v; this.children = []; },
    appendChild(c) { this.children.push(c); c.parentNode = el; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setAttribute() {}, getAttribute: () => null, focus() {}, blur() {}, click() {},
    querySelector: () => null, querySelectorAll: () => [],
    /* Canvasは絵のためだけの物なので、全部から返事だけ返す(サーバーは絵を描かない) */
    getContext: () => ({
      clearRect() {}, fillRect() {}, strokeRect() {}, strokeText() {}, fillText() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
      fill() {}, stroke() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
      drawImage() {}, putImageData() {}, createImageData: () => ({ data: [] }),
      getImageData: () => ({ data: [] }),
      measureText: () => ({ width: 128 }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createLinearGradient: () => ({ addColorStop() {} }),
      set fillStyle(v) {}, get fillStyle() { return '#000'; },
      set strokeStyle(v) {}, get strokeStyle() { return '#000'; },
      set lineWidth(v) {}, get lineWidth() { return 1; },
      set font(v) {}, get font() { return '10px sans-serif'; },
      set globalAlpha(v) {}, get globalAlpha() { return 1; },
      set textAlign(v) {}, get textAlign() { return 'left'; },
      set textBaseline(v) {}, get textBaseline() { return 'top'; },
      set lineCap(v) {}, get lineCap() { return 'butt'; },
      set lineJoin(v) {}, get lineJoin() { return 'miter'; },
      set shadowBlur(v) {}, get shadowBlur() { return 0; },
      set shadowColor(v) {}, get shadowColor() { return '#000'; },
      set globalCompositeOperation(v) {}, get globalCompositeOperation() { return 'source-over'; },
    }),
    width: 256, height: 256,
  };
  return el;
}
const registry = {};
const idsFromHtml = ['c', 'hud', 'hpFill', 'hpText', 'spFill', 'spText', 'enFill', 'enText', 'lvPips',
  'aliveN', 'zoneMsg', 'killLog', 'crosshair', 'aimWind', 'hitMark', 'stickZone', 'stickBase', 'stickKnob',
  'atkBtn', 'atkKnob', 'standBtn', 'specialBtn', 'specialName', 'ultBtn', 'ultName', 'jumpBtn', 'crouchBtn',
  'vaultBtn', 'cancelBtn', 'pcHint', 'title', 'charCards', 'startBtn', 'resultScreen', 'resultTitle',
  'resultBody', 'againBtn', 'gearBtn', 'cfgScreen', 'cfgToast', 'moveHint', 'tsClock', 'radar', 'radarDots',
  'announce', 'ver', 'labels', 'spWarn', 'aimRing', 'minimap',
  'crimsonOverlay', 'crimsonClock', 'breathWrap', 'breathFill', 'breathLabel', 'mapPick', 'mapPickWrap', 'mapPickNote', 'seaOverlay',
  'titleOnlineBtn', 'netScreen', 'netStatus', 'netSub', 'netName', 'netGoBtn', 'netCancelBtn', 'netBadge',
  'perfHud', 'cfgGfx', 'cfgGfxV', 'cfgPerf', 'adTitle', 'adResult'];
for (const id of idsFromHtml) registry[id] = makeFakeElement(id);
globalThis.document = {
  getElementById: (id) => (registry[id] || (registry[id] = makeFakeElement(id))),
  createElement: (tag) => makeFakeElement('created-' + tag),
  body: makeFakeElement('body'),
  addEventListener() {},
};
const _ls = {};
globalThis.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
};
globalThis.AudioContext = undefined;
globalThis.webkitAudioContext = undefined;
