'use strict';
// ---------------------------------------------------------------------------
// Units & constants. The world is measured in pixels; 1 metre = PX pixels.
// ---------------------------------------------------------------------------
const PX = 12;          // pixels per metre
const LW = 42;          // lane width (3.5 m)
const SW = 30;          // sidewalk width (2.5 m)
const CR = 72;          // kerb radius at junction corners (6 m)
const TAU = Math.PI * 2;
const HEAD = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };
const DIRV = { E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, N: { x: 0, y: -1 } };

const toKmh = v => v / PX * 3.6;
const fromKmh = k => k / 3.6 * PX;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

function normAng(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
const angDiff = (a, b) => normAng(a - b);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const P = (x, y) => ({ x, y });

/** Snap a heading to the nearest cardinal direction name. */
function cardinal(h) {
  const a = normAng(h);
  if (Math.abs(a) <= Math.PI / 4) return 'E';
  if (Math.abs(a) >= 3 * Math.PI / 4) return 'W';
  return a > 0 ? 'S' : 'N';
}

function rect(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
function inRect(p, r, m = 0) {
  return p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;
}
function expandRect(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
function rectDist(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}
/** Annular sector: {cx,cy,r1,r2,a1,a2}; angles in screen space (atan2), a1 < a2. */
function inSector(p, s) {
  const dx = p.x - s.cx, dy = p.y - s.cy;
  const r = Math.hypot(dx, dy);
  if (r < s.r1 || r > s.r2) return false;
  let d = normAng(Math.atan2(dy, dx) - s.a1);
  if (d < 0) d += TAU;
  return d <= s.a2 - s.a1;
}
function inShape(p, s) { return s.r2 !== undefined ? inSector(p, s) : inRect(p, s); }

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function polyDist(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, segDist(p, pts[i - 1], pts[i]));
  return best;
}

/** Corners of an oriented box centred at (x,y) with heading h, length l, width w. */
function obb(x, y, h, l, w) {
  const c = Math.cos(h), s = Math.sin(h);
  const hl = l / 2, hw = w / 2;
  return [
    P(x + c * hl - s * hw, y + s * hl + c * hw),
    P(x + c * hl + s * hw, y + s * hl - c * hw),
    P(x - c * hl + s * hw, y - s * hl - c * hw),
    P(x - c * hl - s * hw, y - s * hl + c * hw),
  ];
}
function obbOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const p1 = poly[i], p2 = poly[(i + 1) % 4];
      const nx = p2.y - p1.y, ny = p1.x - p2.x;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const q of A) { const d = q.x * nx + q.y * ny; minA = Math.min(minA, d); maxA = Math.max(maxA, d); }
      for (const q of B) { const d = q.x * nx + q.y * ny; minB = Math.min(minB, d); maxB = Math.max(maxB, d); }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/** Round the corners of a polyline with quadratic Bézier curves. */
function smoothPolyline(pts, r = 60, steps = 12) {
  if (pts.length < 3) return pts.slice();
  const out = [pts[0]];
  const n = pts.length;
  for (let i = 1; i < n - 1; i++) {
    const a = pts[i - 1], c = pts[i], b = pts[i + 1];
    const da = dist(a, c), db = dist(c, b);
    if (da < 1e-6 || db < 1e-6) continue;
    const ra = Math.min(r, i === 1 ? da * 0.95 : da / 2);
    const rb = Math.min(r, i === n - 2 ? db * 0.95 : db / 2);
    const rr = Math.min(ra, rb);
    const p1 = P(c.x + (a.x - c.x) / da * rr, c.y + (a.y - c.y) / da * rr);
    const p2 = P(c.x + (b.x - c.x) / db * rr, c.y + (b.y - c.y) / db * rr);
    // skip nearly straight corners
    const cross = (c.x - a.x) * (b.y - c.y) - (c.y - a.y) * (b.x - c.x);
    if (Math.abs(cross) / (da * db) < 0.02) { out.push(c); continue; }
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push(P(u * u * p1.x + 2 * u * t * c.x + t * t * p2.x, u * u * p1.y + 2 * u * t * c.y + t * t * p2.y));
    }
  }
  out.push(pts[n - 1]);
  return out;
}

/** Arc-length parameterised polyline used by AI agents. */
class Path {
  constructor(pts) {
    // drop duplicate points
    this.pts = [pts[0]];
    for (let i = 1; i < pts.length; i++) if (dist(pts[i], this.pts[this.pts.length - 1]) > 0.5) this.pts.push(pts[i]);
    const n = this.pts.length;
    this.cum = new Float64Array(n);
    for (let i = 1; i < n; i++) this.cum[i] = this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]);
    this.len = this.cum[n - 1];
    // maximum comfortable speed per vertex based on curvature (3 m/s² lateral)
    const aLat = 3 * PX;
    this.vmax = new Float64Array(n).fill(Infinity);
    for (let i = 1; i < n - 1; i++) {
      const a0 = Math.atan2(this.pts[i].y - this.pts[i - 1].y, this.pts[i].x - this.pts[i - 1].x);
      const a1 = Math.atan2(this.pts[i + 1].y - this.pts[i].y, this.pts[i + 1].x - this.pts[i].x);
      const ds = (this.cum[i + 1] - this.cum[i - 1]) / 2;
      const k = Math.abs(angDiff(a1, a0)) / Math.max(ds, 1);
      if (k > 1e-4) this.vmax[i] = Math.sqrt(aLat / k);
    }
    this.startA = Math.atan2(this.pts[1].y - this.pts[0].y, this.pts[1].x - this.pts[0].x);
    this.endA = Math.atan2(this.pts[n - 1].y - this.pts[n - 2].y, this.pts[n - 1].x - this.pts[n - 2].x);
  }
  seg(s) {
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    return lo;
  }
  at(s) {
    s = clamp(s, 0, this.len);
    const i = this.seg(s);
    const a = this.pts[i], b = this.pts[Math.min(i + 1, this.pts.length - 1)];
    const L = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / L;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), a: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  project(p) {
    let best = Infinity, bs = 0;
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
      const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
      if (d < best) { best = d; bs = this.cum[i - 1] + t * Math.sqrt(l2); }
    }
    return bs;
  }
}

/** Deterministic PRNG so decorations are stable between attempts. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
