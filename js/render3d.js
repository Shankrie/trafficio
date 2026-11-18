'use strict';
// ---------------------------------------------------------------------------
// Top-down 3D renderer (three.js). World (x, y) maps to three (x, 0, y), Y up.
// The 2D ground drawing (roads, markings) is reused as tiled ground textures;
// buildings, vehicles, trees, signs and lights are cel-shaded 3D meshes.
// ---------------------------------------------------------------------------

const TILE = 512;          // world px per ground tile
const TILE_RES = 1.5;      // texture pixels per world px

function hash2(x, y) {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((y | 0) + 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

class Renderer3D {
  static supported() {
    if (typeof THREE === 'undefined') return false;
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  constructor(canvas) {
    this.canvas = canvas;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(40, 1, 10, 9000);
    this.camYaw = null;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    // toon gradient: 3 hard steps
    const g = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    this.gradient = new THREE.DataTexture(g, 3, 1, THREE.RGBAFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.mats = {};
    this.texCache = {};
    this.resize();
  }

  // ------------------------------------------------------------ helpers ---
  toon(color, extra = {}) {
    const { noCache, ...params } = extra;
    const key = 't' + color + (params.map ? params.map.uuid : '');
    if (!noCache && this.mats[key]) return this.mats[key];
    const m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, ...params });
    if (!noCache) this.mats[key] = m;
    return m;
  }
  basic(color, extra = {}) {
    const key = 'b' + color + JSON.stringify(extra);
    if (!this.mats[key]) this.mats[key] = new THREE.MeshBasicMaterial({ color, ...extra });
    return this.mats[key];
  }
  canvasTex(key, w, h, draw) {
    if (this.texCache[key]) return this.texCache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    this.texCache[key] = t;
    return t;
  }
  signTexture(type, value) {
    const wide = type === 'town' || type === 'townEnd';
    return this.canvasTex(`sign:${type}:${value}`, wide ? 192 : 128, 128, (ctx, w, h) => drawSign(ctx, type, value, w / 2, h / 2, wide ? 80 : 116));
  }
  lightTexture(state) {
    return this.canvasTex(`light:${state}`, 64, 128, (ctx) => { ctx.scale(3, 3); drawTrafficLight(ctx, 10.5, 21, state); });
  }
  edges(mesh, color = 0x1a1d24) {
    const key = 'line' + color;
    const mat = this.mats[key] || (this.mats[key] = new THREE.LineBasicMaterial({ color }));
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), mat);
    l.position.copy(mesh.position); l.rotation.copy(mesh.rotation); l.scale.copy(mesh.scale);
    return l;
  }
  box(w, h, d, mat, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    return m;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // -------------------------------------------------------------- world ---
  setWorld(W) {
    if (this.scene) this.dispose();
    this.W = W;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#79a35a');
    scene.add(new THREE.HemisphereLight(0xdff2ff, 0x6d8a4c, 0.55));
    const sun = this.sun = new THREE.DirectionalLight(0xfff3dc, 0.62);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.mobile ? 1024 : 2048, this.mobile ? 1024 : 2048);
    const S = 800;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 3000 });
    sun.shadow.bias = -0.0005;
    scene.add(sun); scene.add(sun.target);

    // base ground beyond the map
    const base = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), new THREE.MeshLambertMaterial({ color: '#79a35a' }));
    base.rotation.x = -Math.PI / 2; base.position.y = -1; scene.add(base);
    this.tiles = new Map();

    this.buildDecor(W);
    this.buildSigns(W);
    this.buildLights(W);
    this.buildCrossings(W);
    this.buildRoute(W);
    this.buildGoal(W);
    this.agentMeshes = new Map();
    this.player = this.makeVehicle({ kind: 'car', l: 4.4 * PX, w: 1.85 * PX, color: '#e8412c' }, true);
    scene.add(this.player);
    this.failRing = new THREE.Mesh(new THREE.RingGeometry(40, 47, 40), this.basic('#ff3b30', { transparent: true, opacity: 0.9, depthWrite: false }));
    this.failRing.rotation.x = -Math.PI / 2; this.failRing.visible = false; scene.add(this.failRing);
    this.blameRing = new THREE.Mesh(new THREE.RingGeometry(1, 1.15, 40), this.basic('#ffc400', { transparent: true, opacity: 0.9, depthWrite: false }));
    this.blameRing.rotation.x = -Math.PI / 2; this.blameRing.visible = false; scene.add(this.blameRing);
    this.camYaw = null;
    this.camPos.set(0, 0, 0);
  }
  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const t of this.tiles.values()) { t.material.map.dispose(); t.material.dispose(); }
    this.tiles.clear();
    this.renderer.renderLists.dispose();
  }

  updateTiles(cx, cy, radius) {
    const W = this.W;
    const i0 = Math.floor((cx - radius) / TILE), i1 = Math.floor((cx + radius) / TILE);
    const j0 = Math.floor((cy - radius) / TILE), j1 = Math.floor((cy + radius) / TILE);
    const want = new Set();
    let built = 0;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const key = i + ',' + j;
      want.add(key);
      if (this.tiles.has(key) || built > 3) continue;
      built++;
      const c = document.createElement('canvas');
      c.width = c.height = TILE * TILE_RES;
      const ctx = c.getContext('2d');
      ctx.scale(TILE_RES, TILE_RES); ctx.translate(-i * TILE, -j * TILE);
      drawWorld(ctx, W, { x: i * TILE, y: j * TILE, w: TILE, h: TILE }, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(TILE, TILE), new THREE.MeshLambertMaterial({ map: tex }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(i * TILE + TILE / 2, 0, j * TILE + TILE / 2);
      m.receiveShadow = true;
      this.scene.add(m);
      this.tiles.set(key, m);
    }
    for (const [key, m] of this.tiles) {
      if (want.has(key)) continue;
      const [i, j] = key.split(',').map(Number);
      if (i < i0 - 2 || i > i1 + 2 || j < j0 - 2 || j > j1 + 2) {
        this.scene.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose();
        this.tiles.delete(key);
      }
    }
  }

  buildDecor(W) {
    const scene = this.scene;
    const facade = this.canvasTex('facade', 64, 64, (ctx) => {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#5f7c99';
      for (const x of [8, 36]) for (const y of [10, 38]) ctx.fillRect(x, y, 20, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (const x of [8, 36]) for (const y of [10, 38]) ctx.fillRect(x, y, 20, 3);
    });
    facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
    const walls = ['#efe6d6', '#e8e1d4', '#f3eddf', '#dfe3e6', '#f0dcc0', '#e6d2c3', '#d8dfd0'];
    this.houses = [];
    for (const h of W.decor.houses) {
      const r = hash2(h.x, h.y);
      const floors = r < 0.55 ? 1 : r < 0.85 ? 2 : r < 0.96 ? 3 : 5;
      const H = floors * 34 + 10;
      const tex = facade.clone(); tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round((h.w + h.h) / 2 / 34)), floors);
      const wallMat = this.toon(walls[Math.floor(r * 97) % walls.length], { map: tex, noCache: true });
      const roofMat = this.toon(h.roof);
      const flat = floors >= 3 || hash2(h.y, h.x) < 0.25;
      const mats = [wallMat, wallMat, flat ? roofMat : wallMat, wallMat, wallMat, wallMat];
      const m = new THREE.Mesh(new THREE.BoxGeometry(h.w, H, h.h), mats);
      m.position.set(h.x + h.w / 2, H / 2, h.y + h.h / 2);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m); scene.add(this.edges(m));
      if (!flat) {
        const ridgeAlongX = h.ridgeH;
        const rg = gableGeometry(ridgeAlongX ? h.w + 6 : h.h + 6, ridgeAlongX ? h.h + 6 : h.w + 6, Math.min(h.w, h.h) * 0.45);
        const roof = new THREE.Mesh(rg, roofMat);
        roof.position.set(h.x + h.w / 2, H, h.y + h.h / 2);
        if (!ridgeAlongX) roof.rotation.y = Math.PI / 2;
        roof.castShadow = true;
        scene.add(roof); scene.add(this.edges(roof));
      } else if (floors >= 2) {
        const ac = this.box(14, 8, 12, this.toon('#b9bec4'), h.x + h.w * 0.3, H + 4, h.y + h.h * 0.35);
        scene.add(ac);
      }
      this.houses.push({ mesh: m, x: h.x + h.w / 2, y: h.y + h.h / 2, H });
    }
    // trees as instanced meshes
    const trees = W.decor.trees;
    if (trees.length) {
      const trunkG = new THREE.CylinderGeometry(2.4, 3.2, 16, 6);
      const crownG = new THREE.IcosahedronGeometry(1, 0);
      const trunks = new THREE.InstancedMesh(trunkG, this.toon('#6b4a2e'), trees.length);
      const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: this.gradient }), trees.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
      trees.forEach((t, i) => {
        p.set(t.x, 8, t.y); s.set(1, 1, 1); q.identity();
        M.compose(p, q, s); trunks.setMatrixAt(i, M);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.shade * 6);
        p.set(t.x, 16 + t.r * 0.8, t.y); s.set(t.r * 1.05, t.r * 0.95, t.r * 1.05);
        M.compose(p, q, s); crowns.setMatrixAt(i, M);
        col.set(t.shade < 0.5 ? '#3f8a3a' : '#57a043'); crowns.setColorAt(i, col);
      });
      trunks.castShadow = crowns.castShadow = true;
      scene.add(trunks); scene.add(crowns);
    }
    // roundabout island: low hedge ring
    for (const rb of W.rbs) {
      const hedge = new THREE.Mesh(new THREE.TorusGeometry(rb.r1 - 14, 7, 6, 32), this.toon('#3d7d36'));
      hedge.rotation.x = -Math.PI / 2; hedge.position.set(rb.cx, 4, rb.cy); hedge.castShadow = true;
      scene.add(hedge);
      const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(30, 0), new THREE.MeshToonMaterial({ color: '#4c9a40', gradientMap: this.gradient }));
      tree.position.set(rb.cx, 48, rb.cy); tree.castShadow = true; scene.add(tree);
      scene.add(this.box(8, 30, 8, this.toon('#6b4a2e'), rb.cx, 15, rb.cy));
    }
  }

  buildSigns(W) {
    const poleMat = this.toon('#8d939b');
    const poleG = new THREE.CylinderGeometry(1.2, 1.2, 34, 6);
    for (const s of W.signs) {
      const pole = new THREE.Mesh(poleG, poleMat);
      pole.position.set(s.x, 17, s.y); pole.castShadow = true;
      this.scene.add(pole);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.signTexture(s.type, s.value) }));
      const wide = s.type === 'town' || s.type === 'townEnd';
      sp.scale.set(wide ? 54 : 36, 36, 1);
      sp.position.set(s.x, 44, s.y);
      this.scene.add(sp);
    }
  }
  buildLights(W) {
    this.lightSprites = [];
    const poleMat = this.toon('#3a3f47');
    for (const L of W.lights) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 46, 6), poleMat);
      pole.position.set(L.x, 23, L.y); pole.castShadow = true;
      this.scene.add(pole);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.lightTexture('red') }));
      sp.scale.set(20, 40, 1); sp.position.set(L.x, 62, L.y);
      sp.userData.L = L; sp.userData.state = 'red';
      this.scene.add(sp);
      this.lightSprites.push(sp);
    }
  }
  buildCrossings(W) {
    this.crossingParts = [];
    const stripe = this.canvasTex('barrier', 64, 8, (ctx) => {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#e53935'; ctx.fillRect(i * 8, 0, 8, 8); }
    });
    stripe.wrapS = THREE.RepeatWrapping;
    for (const cr of W.crossings) {
      if (!cr.guarded) continue;
      const r = cr.road;
      for (const p of [{ x: cr.x - 75, y: r.c + r.half + 16, dirY: -1 }, { x: cr.x + 75, y: r.c - r.half - 16, dirY: 1 }]) {
        const post = this.box(6, 30, 6, this.toon('#e6e6e6'), p.x, 15, p.y);
        this.scene.add(post);
        const L = r.half + 4;
        const outer = new THREE.Group(); outer.position.set(p.x, 22, p.y);
        if (p.dirY < 0) outer.rotation.y = Math.PI;
        const pivot = new THREE.Group(); outer.add(pivot);
        const tex = stripe.clone(); tex.needsUpdate = true; tex.repeat.set(L / 64 * 4, 1);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(3, 3, L), new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient }));
        arm.position.z = L / 2; arm.castShadow = true;
        pivot.add(arm);
        this.scene.add(outer);
        const lampOn = this.basic('#ff2b2b'), lampOff = this.basic('#4a1d1d');
        const lamps = [-5, 5].map(dx => {
          const l = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), lampOff);
          l.position.set(p.x + dx, 33, p.y); this.scene.add(l); return l;
        });
        this.crossingParts.push({ cr, pivot, lamps, lampOn, lampOff });
      }
    }
  }
  buildRoute(W) {
    if (!W.route) return;
    const pts = [];
    const path = new Path(W.route);
    for (let s = 0; s < path.len; s += 26) pts.push(path.at(s));
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(4.5, 10), this.basic('#46beff', { transparent: true, opacity: 0.75, depthWrite: false }), pts.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    pts.forEach((p, i) => { M.compose(new THREE.Vector3(p.x, 0.8, p.y), q, new THREE.Vector3(1, 1, 1)); dots.setMatrixAt(i, M); });
    this.scene.add(dots);
  }
  buildGoal(W) {
    if (!W.goal) return;
    const r = W.goal.rect;
    this.goalMat = new THREE.MeshBasicMaterial({ color: '#3ce678', transparent: true, opacity: 0.25, depthWrite: false });
    const g = new THREE.Mesh(new THREE.BoxGeometry(r.w, 24, r.h), this.goalMat);
    g.position.set(r.x + r.w / 2, 12, r.y + r.h / 2);
    this.scene.add(g);
    this.scene.add(this.edges(g, 0x3ce678));
    const tex = this.canvasTex('goalP:' + W.goal.stop, 64, 64, (ctx) => {
      ctx.fillStyle = '#1565c0'; roundRect(ctx, 4, 4, 56, 56, 10); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 44px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(W.goal.stop ? 'P' : '★', 32, 35);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
    sp.scale.set(30, 30, 1); sp.position.set(r.x + r.w / 2, 46, r.y + r.h / 2);
    this.goalSprite = sp;
    this.scene.add(sp);
  }

  // ----------------------------------------------------------- vehicles ---
  makeVehicle(v, player = false) {
    const g = new THREE.Group();
    const L = v.l, Wd = v.w;
    const body = this.toon(v.color);
    const ud = g.userData;
    if (v.kind === 'ped') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 13, 8), this.toon(v.color));
      b.position.y = 8.5; b.castShadow = true; g.add(b);
      const h = new THREE.Mesh(new THREE.SphereGeometry(3, 10, 8), this.toon('#f1c9a5'));
      h.position.y = 18; h.castShadow = true; g.add(h);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(3.1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.toon('#5a3d2b'));
      hair.position.y = 18.3; g.add(hair);
      return g;
    }
    if (v.kind === 'train') {
      const car = 15 * PX;
      for (let x = -L / 2; x < L / 2 - 1; x += car + 6) {
        const w = Math.min(car, L / 2 - x);
        const loco = x + car >= L / 2 - 1;
        const m = this.box(w, 40, Wd, this.toon(loco ? '#c0392b' : '#2e5e8c'), x + w / 2, 24, 0);
        g.add(m); g.add(this.edges(m));
        const roof = this.box(w - 8, 3, Wd - 8, this.toon('#9aa4ad'), x + w / 2, 45.5, 0);
        g.add(roof);
        const win = this.box(w - 14, 9, Wd + 0.6, this.basic('#22303d'), x + w / 2, 32, 0, false);
        g.add(win);
      }
      return g;
    }
    const tall = v.kind === 'bus' || v.kind === 'truck';
    const H = tall ? 30 : 11;
    const lift = 4;
    const bm = this.box(L, H, Wd, body, 0, lift + H / 2, 0);
    g.add(bm); g.add(this.edges(bm));
    if (tall) {
      g.add(this.box(L - 8, 9, Wd + 0.6, this.basic('#22303d'), -2, lift + H - 9, 0, false));
      g.add(this.box(L - 10, 2, Wd - 6, this.toon('#d9dde2'), 0, lift + H + 1, 0));
    } else {
      const cab = this.box(L * 0.5, 8, Wd - 3, this.basic('#1f2a36'), -L * 0.05, lift + H + 4, 0);
      g.add(cab);
      const roof = this.box(L * 0.36, 1.6, Wd - 4, body, -L * 0.07, lift + H + 8.8, 0);
      g.add(roof); g.add(this.edges(cab));
      if (player) {
        // little roof stripes so the player car stands out
        g.add(this.box(L * 0.3, 0.6, 3, this.basic('#ffffff'), -L * 0.07, lift + H + 9.9, -3.5, false));
        g.add(this.box(L * 0.3, 0.6, 3, this.basic('#ffffff'), -L * 0.07, lift + H + 9.9, 3.5, false));
      }
    }
    const wheelG = this.wheelG || (this.wheelG = new THREE.CylinderGeometry(4.2, 4.2, 3, 10));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelG, this.toon('#1c1c1f'));
      w.rotation.x = Math.PI / 2; w.position.set(sx * L * 0.32, 4.2, sz * (Wd / 2 - 1));
      g.add(w);
    }
    const head = this.basic('#fff6c8');
    for (const sz of [-1, 1]) g.add(this.box(1.5, 3, 4.5, head, L / 2 + 0.3, lift + H - 3, sz * (Wd / 2 - 4), false));
    ud.brake = [-1, 1].map(sz => { const m = this.box(1.5, 3, 4.5, this.basic('#7a1414'), -L / 2 - 0.3, lift + H - 3, sz * (Wd / 2 - 4), false); g.add(m); return m; });
    ud.blinkL = []; ud.blinkR = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const m = this.box(3.5, 3, 2.5, this.basic('#ffb000'), sx * (L / 2 - 2), lift + H + 0.5, sz * (Wd / 2 + 0.5), false);
      m.visible = false; g.add(m);
      (sz < 0 ? ud.blinkL : ud.blinkR).push(m);
    }
    ud.rev = this.box(1.5, 2.5, 3, this.basic('#ffffff'), -L / 2 - 0.4, lift + H - 3, 0, false);
    ud.rev.visible = false; g.add(ud.rev);
    return g;
  }
  syncVehicle(g, v, time, blink) {
    g.position.set(v.x, 0, v.y);
    g.rotation.y = -v.h;
    const ud = g.userData;
    if (ud.brake) {
      const on = this.basic('#ff2a2a'), off = this.basic('#7a1414');
      for (const m of ud.brake) m.material = v.braking ? on : off;
      const lit = blink && Math.floor(time * 3.2) % 2 === 0;
      for (const m of ud.blinkL) m.visible = !!(lit && blink === 'left');
      for (const m of ud.blinkR) m.visible = !!(lit && blink === 'right');
      ud.rev.visible = !!v.reversing;
    }
  }

  // ------------------------------------------------------------- render ---
  render(game, dt) {
    const W = game.W;
    if (!W) return;
    if (this.W !== W) this.setWorld(W);
    const car = game.car, time = W.time;

    // agents
    const seen = new Set();
    for (const a of W.agents) {
      seen.add(a.id);
      let g = this.agentMeshes.get(a.id);
      if (!g) { g = this.makeVehicle(a); this.agentMeshes.set(a.id, g); this.scene.add(g); }
      this.syncVehicle(g, a, time, a.s < a.blinkEnd ? a.blink : null);
    }
    for (const [id, g] of this.agentMeshes) if (!seen.has(id)) { this.scene.remove(g); this.agentMeshes.delete(id); }
    this.syncVehicle(this.player, car, time, car.signal === 'none' ? null : car.signal);

    // lights & crossings
    for (const sp of this.lightSprites) {
      const st = sp.userData.L.cycle.state(sp.userData.L.group);
      if (st !== sp.userData.state) { sp.userData.state = st; sp.material.map = this.lightTexture(st); sp.material.needsUpdate = true; }
    }
    for (const c of this.crossingParts) {
      c.pivot.rotation.x = -(Math.PI / 2) * (1 - c.cr.barrier);
      const on = Math.floor(time * 2.5) % 2;
      c.lamps[0].material = c.cr.flashing && on ? c.lampOn : c.lampOff;
      c.lamps[1].material = c.cr.flashing && !on ? c.lampOn : c.lampOff;
    }
    if (this.goalMat) {
      this.goalMat.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 4));
      this.goalSprite.position.y = 46 + Math.sin(time * 2.5) * 3;
    }
    // failure markers
    const failing = game.state === 'fail';
    this.failRing.visible = failing;
    if (failing) {
      this.failRing.position.set(car.x, 1.5, car.y);
      this.failRing.material.opacity = 0.6 + 0.4 * Math.sin((game.failT || 0) * 10);
      const b = game.blame;
      this.blameRing.visible = !!(b && !b.done);
      if (this.blameRing.visible) { const r = Math.max(26, b.l * 0.6); this.blameRing.scale.set(r, r, 1); this.blameRing.position.set(b.x, 1.6, b.y); }
    } else this.blameRing.visible = false;

    // camera: behind and above the car, turning slowly with it
    const k = Math.min(1, dt * 3);
    if (this.camYaw === null || dt > 0.3) { this.camYaw = car.h; this.camTarget.set(car.x, 0, car.y); }
    const turn = angDiff(car.h, this.camYaw);
    this.camYaw = normAng(this.camYaw + turn * Math.min(1, dt * (car.v < -1 ? 0.5 : 1.6)));
    const look = clamp(car.v * 0.6, -60, 170);
    const tx = car.x + Math.cos(car.h) * look, ty = car.y + Math.sin(car.h) * look;
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.z += (ty - this.camTarget.z) * k;
    const aspect = this.camera.aspect;
    const zoomOut = 1 + Math.min(0.35, toKmh(Math.abs(car.v)) / 260);
    let D = Math.max(720, 430 / (0.728 * aspect));
    D = Math.min(D, 1500) * zoomOut;
    const elev = 1.08; // ~62° above the horizon
    const back = Math.cos(elev) * D, up = Math.sin(elev) * D;
    const want = new THREE.Vector3(this.camTarget.x - Math.cos(this.camYaw) * back, up, this.camTarget.z - Math.sin(this.camYaw) * back);
    if (this.camPos.lengthSq() === 0 || dt > 0.3) this.camPos.copy(want); else this.camPos.lerp(want, Math.min(1, dt * 4));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);

    // sun follows the view so shadows are always sharp nearby
    this.sun.position.set(this.camTarget.x - 400, 900, this.camTarget.z - 250);
    this.sun.target.position.set(this.camTarget.x, 0, this.camTarget.z);

    this.updateTiles(this.camTarget.x + Math.cos(this.camYaw) * D * 0.25, this.camTarget.z + Math.sin(this.camYaw) * D * 0.25, D * 0.95);
    this.renderer.render(this.scene, this.camera);
  }
}

/** Gable roof, ridge along X: width w (x), depth d (z), ridge height rh. */
function gableGeometry(w, d, rh) {
  const x = w / 2, z = d / 2;
  const v = [
    // slope -z
    -x, 0, -z, x, 0, -z, x, rh, 0, -x, 0, -z, x, rh, 0, -x, rh, 0,
    // slope +z
    -x, 0, z, -x, rh, 0, x, rh, 0, -x, 0, z, x, rh, 0, x, 0, z,
    // gables
    -x, 0, -z, -x, rh, 0, -x, 0, z,
    x, 0, -z, x, 0, z, x, rh, 0,
  ];
  // flip winding so faces point outwards
  for (let i = 0; i < v.length; i += 9) for (let k = 0; k < 3; k++) { const t = v[i + 3 + k]; v[i + 3 + k] = v[i + 6 + k]; v[i + 6 + k] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
