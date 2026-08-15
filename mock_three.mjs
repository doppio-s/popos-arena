// Minimal THREE.js mock — real Vector3 math (this is what drives actual game logic),
// everything else (meshes/materials/renderer) is a structural no-op so the real
// game script can execute end-to-end without a browser/WebGL context.

export class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  lerp(v, a) { this.x += (v.x - this.x) * a; this.y += (v.y - this.y) * a; this.z += (v.z - this.z) * a; return this; }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  project() { this.z = 2; return this; } // テスト環境ではラベルを常に画面外扱いにする
}

class Object3DMock {
  constructor() {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.scale = new Vector3(1, 1, 1);
    this.children = [];
    this.parent = null;
    this.userData = {};
    this.castShadow = false;
    this.receiveShadow = false;
    /* ★v127 #290: 本物の three.js は visible の初期値が true。
       モックが持っていなかったので「まだ誰も触っていない物」が undefined になり、
       "見えている物を数える"系の検査が静かに嘘をついていた。本物に合わせる。 */
    this.visible = true;
  }
  /* ★v16: 本物の three.js は add/remove で parent を張り替える。
     モックがそれをしていなかったので、「シーンから外したか」を parent で
     測るテストが絶対に通らなかった(外れているのに parent が残る)。
     ここを本物に合わせて、parent を正しい判定材料にする。 */
  add(o) { if (o.parent && o.parent !== this && o.parent.remove) o.parent.remove(o); this.children.push(o); o.parent = this; return this; }
  updateMatrixWorld() { return this; }        // ★v136: 影のカメラの向き更新で呼ばれる
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); else fn(c); }
}

export class Group extends Object3DMock { constructor() { super(); this.isGroup = true; } }
export class Mesh extends Object3DMock {
  constructor(geo, mat) { super(); this.isMesh = true; this.geometry = geo || {}; this.material = mat || {}; }
}
export class Scene extends Object3DMock { constructor() { super(); this.background = null; this.fog = null; } }

/* ★v69 #225: 色を r/g/b に開く。ここが 1,1,1 のスタブだったせいで、
   「紫になっているか」を色として検査できなかった(テストが定数の写経にしかならない)。
   ★モックは"落ちなければいい"物ではなく、【何を検査可能にするか】を決める物。
     検査したい性質が増えたら、モックのほうを育てる。 */
class ColorMock {
  constructor(hex) { this.setHex(hex === undefined ? 0xffffff : hex); }
  setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  setHex(h) {
    this.hex = h;
    const n = typeof h === 'number' ? h : 0xffffff;
    this.r = ((n >> 16) & 255) / 255;
    this.g = ((n >> 8) & 255) / 255;
    this.b = (n & 255) / 255;
    return this;
  }
  set(h) { return this.setHex(h); }
  getHex() { return this.hex; }
}
export class Color extends ColorMock {}
export class Fog { constructor(color, near, far) { this.color = color; this.near = near; this.far = far; } }

// Geometries / materials: opaque placeholders, never inspected by game logic
/* ★v97 #257: 「見えない当たり判定」を機械的に探すために、モックに
   【どこへ置かれたか】を覚えさせた。本物の three は translate/rotate で
   頂点そのものを動かすので、モックが何も覚えないと"絵の位置"が検査できない。
   ★モックは"落ちなければいい"物ではなく【何を検査可能にするか】を決める物
     (v69 #225 で色を開いたのと同じ理由)。 */
class GeoMock {
  constructor(...a) { this.args = a; this._tx = 0; this._ty = 0; this._tz = 0; this._ry = 0; this._rx = 0; this._rz = 0; }
  dispose() {}
  translate(x = 0, y = 0, z = 0) { this._tx += x; this._ty += y; this._tz += z; return this; }
  rotateX(a = 0) { this._rx += a; return this; }
  rotateY(a = 0) { this._ry += a; return this; }
  rotateZ(a = 0) { this._rz += a; return this; }   // v25: キャラビルダーが襟・前髪の傾きで使う
  scale() { return this; }     // v25: 胸板・髪のつぶし/伸ばしで使う
}
export function mergeGeometries(list) {
  const g = new GeoMock('merged', list ? list.length : 0);
  g.parts = list ? list.slice() : [];   // ★v97: 何を混ぜたかを残す(絵の一覧を復元できるように)
  return g;
}
export class CapsuleGeometry extends GeoMock {}
export class OctahedronGeometry extends GeoMock {}
export class SphereGeometry extends GeoMock {}
export class BoxGeometry extends GeoMock {}
export class ConeGeometry extends GeoMock {}
export class CylinderGeometry extends GeoMock {}
export class TorusGeometry extends GeoMock {
  /* ★v75 #233: 本物の three.js は引数を parameters に名前付きで持っている。
     ボムのガイドの輪が「本物の定数(VOLARE_R 等)そのもので作られているか」を
     テストから確かめたいので、そこだけ生やす(モックは必要になった時に育てる)。 */
  get parameters() {
    return {
      radius: this.args[0], tube: this.args[1],
      radialSegments: this.args[2], tubularSegments: this.args[3],
    };
  }
}
export class RingGeometry extends GeoMock {}
export class CircleGeometry extends GeoMock {}   // v54: 落下地点の影

class MatMock {
  constructor(opts = {}) {
    Object.assign(this, opts);
    this.color = new ColorMock(opts.color !== undefined ? opts.color : 0xffffff);
    this.emissive = new ColorMock(0);
    if (opts.opacity === undefined) this.opacity = 1;
  }
  dispose() {}
}
export class MeshStandardMaterial extends MatMock {}
export class MeshBasicMaterial extends MatMock {}

/* v23: 擬音文字・ブルーム・ダメージ数字(Canvasスプライト)用。
   テストでは絵は要らないが、生成と位置・可視の出し入れは本物と同じ形で通す。 */
export class CanvasTexture {
  constructor(image) { this.image = image; this.needsUpdate = false; }
  dispose() {}
}
export class SpriteMaterial extends MatMock {}
export class Sprite extends Object3DMock {
  constructor(mat) { super(); this.isSprite = true; this.material = mat || {}; }
}

export const DoubleSide = 'DoubleSide';
export const BackSide = 'BackSide';
export const AdditiveBlending = 'AdditiveBlending';
export const PCFSoftShadowMap = 'PCFSoftShadowMap';
export const PCFShadowMap = 'PCFShadowMap';   // ★v136: 影のフィルタを軽い方へ

/* ★v94 #254: マップごとに光の色を替えるようになったので、ライトにも
   color / groundColor / intensity を持たせる(本物と同じ形)。
   ここが空だと applyMapLook が setHex で落ちる。 */
export class HemisphereLight extends Object3DMock {
  constructor(sky, ground, intensity) {
    super();
    this.isLight = true;      // ★v127: 本物の three.js と同じ印(光だけは消さない判定に使う)
    this.color = new ColorMock(sky);
    this.groundColor = new ColorMock(ground);
    this.intensity = intensity === undefined ? 1 : intensity;
  }
}
export class DirectionalLight extends Object3DMock {
  constructor(color, intensity) {
    super();
    this.isLight = true;      // ★v127: 同上
    this.color = new ColorMock(color);
    this.intensity = intensity === undefined ? 1 : intensity;
    /* ★v136 #300: 影のカメラを【本人の周り】へ運ぶようになったので、
       モックも target と mapSize の実数を持つ ——
       持たせないと「影の範囲を狭めた」ことをテストから確かめられない。
       ★モックは"落ちなければいい"物ではなく【何を検査可能にするか】を決める物。 */
    this.shadow = {
      mapSize: { x: 1024, y: 1024, set(x, y) { this.x = x; this.y = y === undefined ? x : y; } },
      camera: {},
    };
    this.target = new Object3DMock();
  }
}

export class PerspectiveCamera extends Object3DMock {
  constructor(fov, aspect, near, far) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; }
  updateProjectionMatrix() {}
  lookAt() {}
}

export class WebGLRenderer {
  /* ★v137 #301: 画質(pixelRatio)と描画の数え(info)を持たせた。
     ★"自動で画質が下がったか"も"数字が出せるか"も、ここが空っぽだと検査できない。 */
  constructor() {
    this.shadowMap = { enabled: false, type: null };
    this._pr = 1;
    this.info = { render: { calls: 0, triangles: 0, frame: 0 } };
  }
  setPixelRatio(v) { this._pr = v; }
  getPixelRatio() { return this._pr; }
  setSize() {}
  render() { this.info.render.frame++; }
}
