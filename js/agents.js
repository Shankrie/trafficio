'use strict';
// ---------------------------------------------------------------------------
// AI road users: cars, buses, pedestrians and trains following fixed paths.
// ---------------------------------------------------------------------------

const AGENT_DIMS = { car: [4.4, 1.85], bus: [12, 2.55], truck: [8.5, 2.5], ped: [0.55, 0.65], train: [64, 3.2], police: [4.7, 1.9] };
const CAR_COLORS = ['#2f6fdf', '#f2f2f2', '#2b2b30', '#d7d7d7', '#1f8a70', '#f2a33a', '#7b3fb8', '#c0392b', '#8fa3b8', '#3a506b'];
const PED_COLORS = ['#e74c3c', '#2980b9', '#8e44ad', '#16a085', '#f39c12', '#d35400', '#2c3e50'];

let agentSeq = 0;

class Agent {
  constructor(kind, path, o = {}) {
    this.id = ++agentSeq;
    this.kind = kind; this.path = path;
    const [l, w] = AGENT_DIMS[kind] || AGENT_DIMS.car;
    this.l = l * PX; this.w = w * PX;
    this.speed = fromKmh(o.speed || (kind === 'ped' ? 5 : 40));
    this.s = o.startS !== undefined ? o.startS : (kind === 'ped' ? 0 : this.l / 2);
    this.v = o.v0 !== undefined ? fromKmh(o.v0) : this.speed;
    this.gates = [];
    this.tags = o.tags || [];
    this.color = o.color || (kind === 'ped' ? PED_COLORS[this.id % PED_COLORS.length] : CAR_COLORS[this.id % CAR_COLORS.length]);
    this.done = false; this.braking = false; this.waitT = 0;
    this.blink = null; this.blinkEnd = 0;
    if (o.blink !== undefined) { this.blink = o.blink; this.blinkEnd = o.blinkEnd || path.len; }
    else if (kind !== 'ped' && kind !== 'train') this.autoBlink();
    this.pose();
  }
  autoBlink() {
    const p = this.path;
    const total = angDiff(p.endA, p.startA);
    if (Math.abs(total) < 0.6) return;
    this.blink = total > 0 ? 'right' : 'left';
    // blink until heading is close to final heading
    for (let i = 1; i < p.pts.length; i++) {
      const a = Math.atan2(p.pts[i].y - p.pts[i - 1].y, p.pts[i].x - p.pts[i - 1].x);
      if (Math.abs(angDiff(p.endA, a)) < 0.25) { this.blinkEnd = p.cum[i]; break; }
    }
  }
  pose() {
    const p = this.path.at(this.s);
    this.x = p.x; this.y = p.y; this.h = p.a;
  }
  get front() { return this.s + this.l / 2; }
  box(shrink = 0) { return obb(this.x, this.y, this.h, this.l - shrink, this.w - shrink); }

  /** Distance along own path to the nearest obstacle ahead (Infinity if none). */
  obstacleDist(W, G) {
    const look = this.kind === 'ped' ? 22 : 34 + this.v * 1.4 + this.v * this.v / (2 * 4 * PX);
    const step = this.kind === 'ped' ? 4 : 10;
    const hw = this.w / 2 + (this.kind === 'ped' ? 2 : 3);
    const obs = [];
    const consider = o => {
      if (Math.abs(o.x - this.x) > look + 80 + o.l || Math.abs(o.y - this.y) > look + 80 + o.l) return;
      obs.push(o);
    };
    for (const a of W.agents) if (a !== this && !a.done && a.kind !== 'train') {
      if (this.kind === 'ped' && a.kind === 'ped') continue;
      consider(a);
    }
    if (G && G.car) consider(G.car);
    const zebras = this.kind === 'ped' ? [] : W.zebras.filter(z => z.busy && rectDist(this, z.rect) < look + this.l && zebraBlocker(W, z, this));
    if (!obs.length && !zebras.length) return Infinity;
    const f0 = this.front;
    for (let d = 0; d <= look; d += step) {
      const q = this.path.at(f0 + d);
      if (f0 + d > this.path.len + 30) break;
      // give way to pedestrians on a zebra crossing (stop before it)
      for (const z of zebras) if (inRect(q, z.rect, 4) && d > 0) return d;
      for (const o of obs) {
        const c = Math.cos(o.h), s = Math.sin(o.h);
        const dx = q.x - o.x, dy = q.y - o.y;
        const lx = Math.abs(dx * c + dy * s) - o.l / 2;
        const ly = Math.abs(-dx * s + dy * c) - o.w / 2;
        const out = Math.hypot(Math.max(lx, 0), Math.max(ly, 0));
        if (out < hw) return d;
      }
    }
    return Infinity;
  }

  update(dt, W, G) {
    if (this.kind === 'train') {
      this.s += this.v * dt;
      if (this.s - this.l / 2 > this.path.len) this.done = true;
      this.pose();
      return;
    }
    const path = this.path;
    const decel = 4 * PX;
    let want = this.speed;
    if (this.kind !== 'ped') {
      const i0 = path.seg(this.s);
      const look = this.v * this.v / (2 * decel) + 80;
      for (let i = i0; i < path.pts.length && path.cum[i] - this.s < look; i++) {
        const vm = path.vmax[i];
        if (vm === Infinity) continue;
        const d = Math.max(0, path.cum[i] - this.s);
        want = Math.min(want, Math.sqrt(vm * vm + 2 * decel * d));
      }
    }
    const front = this.front;
    for (const g of this.gates) {
      if (g.passed) continue;
      const d = g.s - front;
      if (d < -4) { g.passed = true; continue; }
      if (g.committed) continue;
      if (d > 600) continue;
      const open = g.open(this, W, G);
      if (open) { if (d < (g.hard ? 5 : 14)) g.committed = true; continue; }
      if (!g.hard && this.v > 2 * PX && this.v * this.v / (2 * Math.max(d, 1)) > 4.5 * PX) { g.committed = true; continue; }
      want = Math.min(want, Math.sqrt(2 * decel * Math.max(0, d - 3)));
      if (d < 4) want = 0;
    }
    const ob = this.obstacleDist(W, G);
    if (ob < Infinity) {
      const gap = this.kind === 'ped' ? 6 : 22;
      want = Math.min(want, Math.sqrt(2 * decel * 1.5 * Math.max(0, ob - gap)));
      if (ob < gap) want = 0;
    }
    const acc = (this.kind === 'ped' ? 3 : this.kind === 'bus' ? 1.4 : 2.3) * PX;
    if (this.v < want) this.v = Math.min(want, this.v + acc * dt);
    else this.v = Math.max(want, this.v - 9 * PX * dt);
    this.braking = this.v > 0.2 ? want < this.v - 2 : true;
    this.waitT = this.v < 0.5 ? this.waitT + dt : 0;
    this.s += this.v * dt;
    if (this.s - this.l / 2 >= path.len) this.done = true;
    this.pose();
  }
}

// ---------------------------------------------------------------------------
// Vehicle drawing (shared by player and AI)
// ---------------------------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r * k), 0, 255); g = clamp(Math.round(g * k), 0, 255); b = clamp(Math.round(b * k), 0, 255);
  return `rgb(${r},${g},${b})`;
}

/** Draw a car-like vehicle. v: {x,y,h,l,w,color,braking,blink,kind,reversing} */
function drawVehicle(ctx, v, time) {
  ctx.save();
  ctx.translate(v.x, v.y);
  ctx.rotate(v.h);
  const L = v.l, Wd = v.w;
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -L / 2 + 3, -Wd / 2 + 4, L, Wd, 5); ctx.fill();
  if (v.kind === 'bus' || v.kind === 'truck') {
    ctx.fillStyle = v.color;
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(-L / 2 + 8, -Wd / 2 + 4, L - 16, Wd - 8);
    ctx.fillStyle = '#25303b';
    ctx.fillRect(L / 2 - 10, -Wd / 2 + 3, 7, Wd - 6);
    if (v.kind === 'bus') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = -L / 2 + 14; x < L / 2 - 18; x += 22) ctx.fillRect(x, -Wd / 2 + 6, 14, Wd - 12); }
  } else {
    ctx.fillStyle = v.color;
    roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 7); ctx.fill();
    ctx.fillStyle = shade(v.color, 0.78);
    roundRect(ctx, -L * 0.22, -Wd / 2 + 3, L * 0.42, Wd - 6, 4); ctx.fill();
    // windscreen & rear window
    ctx.fillStyle = '#1d2733';
    roundRect(ctx, L * 0.12, -Wd / 2 + 3.5, L * 0.13, Wd - 7, 3); ctx.fill();
    roundRect(ctx, -L * 0.33, -Wd / 2 + 4, L * 0.09, Wd - 8, 2); ctx.fill();
    if (v.kind === 'police') {
      const on = Math.floor(time * 6) % 2;
      ctx.fillStyle = on ? '#2a7fff' : '#ff3030';
      ctx.fillRect(-4, -Wd / 2 + 3, 5, Wd / 2 - 3);
      ctx.fillStyle = on ? '#ff3030' : '#2a7fff';
      ctx.fillRect(-4, 0, 5, Wd / 2 - 3);
    }
  }
  // head lights
  ctx.fillStyle = '#fff6c8';
  ctx.fillRect(L / 2 - 3, -Wd / 2 + 2, 3, 5); ctx.fillRect(L / 2 - 3, Wd / 2 - 7, 3, 5);
  // brake / tail lights
  ctx.fillStyle = v.braking ? '#ff2a2a' : '#8b1a1a';
  ctx.fillRect(-L / 2, -Wd / 2 + 2, 3, 5); ctx.fillRect(-L / 2, Wd / 2 - 7, 3, 5);
  if (v.braking) {
    ctx.fillStyle = 'rgba(255,40,40,0.35)';
    ctx.beginPath(); ctx.arc(-L / 2 - 2, -Wd / 2 + 4, 6, 0, TAU); ctx.arc(-L / 2 - 2, Wd / 2 - 4, 6, 0, TAU); ctx.fill();
  }
  if (v.reversing) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-L / 2, -2, 3, 4); }
  // indicators
  if (v.blink && Math.floor(time * 3.2) % 2 === 0) {
    const side = v.blink === 'left' ? -1 : 1;
    ctx.fillStyle = '#ffb000';
    ctx.beginPath();
    ctx.arc(L / 2 - 2, side * (Wd / 2 - 1), 3.2, 0, TAU);
    ctx.arc(-L / 2 + 2, side * (Wd / 2 - 1), 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,176,0,0.35)';
    ctx.beginPath(); ctx.arc(L / 2 - 2, side * (Wd / 2 - 1), 7, 0, TAU); ctx.arc(-L / 2 + 2, side * (Wd / 2 - 1), 7, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, a, time) {
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(a.h);
  const swing = a.v > 0.5 ? Math.sin(time * 9 + a.id) * 3 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(2, 3, 5, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#333';
  ctx.fillRect(-2 + swing, -4, 4, 2); ctx.fillRect(-2 - swing, 2, 4, 2);
  ctx.fillStyle = a.color;
  ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 6.5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f1c9a5';
  ctx.beginPath(); ctx.arc(0.5, 0, 3, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5a3d2b';
  ctx.beginPath(); ctx.arc(-0.5, 0, 2.6, Math.PI / 2, -Math.PI / 2); ctx.fill();
  ctx.restore();
}

function drawTrain(ctx, a) {
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(a.h);
  const L = a.l, Wd = a.w, car = 15 * PX;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 4, -Wd / 2 + 5, L, Wd);
  for (let x = -L / 2; x < L / 2 - 1; x += car + 6) {
    const w = Math.min(car, L / 2 - x);
    const loco = x + car >= L / 2 - 1;
    ctx.fillStyle = loco ? '#c0392b' : '#2e5e8c';
    roundRect(ctx, x, -Wd / 2, w, Wd, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 6, -Wd / 2 + 5, w - 12, Wd - 10);
  }
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(L / 2 - 4, -Wd / 2 + 4, 4, 6); ctx.fillRect(L / 2 - 4, Wd / 2 - 10, 4, 6);
  ctx.restore();
}

function drawAgent(ctx, a, time) {
  if (a.kind === 'ped') drawPed(ctx, a, time);
  else if (a.kind === 'train') drawTrain(ctx, a);
  else drawVehicle(ctx, { ...a, x: a.x, y: a.y, h: a.h, l: a.l, w: a.w, blink: a.s < a.blinkEnd ? a.blink : null }, time);
}
