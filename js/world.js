'use strict';
// ---------------------------------------------------------------------------
// World: road network, markings, signs, lights, railway, agents and rules.
// Levels build a World through the helper methods below.
// ---------------------------------------------------------------------------

const ARM_HEADING_IN = { s: 'N', n: 'S', e: 'W', w: 'E' }; // heading of traffic arriving from that arm
const ARM_HEADING_OUT = { n: 'N', e: 'E', s: 'S', w: 'W' }; // heading of traffic leaving into that arm
const ARM_ANGLE = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };

const COLORS = {
  grass: '#79a35a', grass2: '#6f9852', sidewalk: '#c9c4b8', kerb: '#9b978d', shoulder: '#b6a681',
  asphalt: '#4b4e54', marking: '#f3f3f0', yellowMark: '#f0c419',
};

class Road {
  constructor(axis, c, a, b, o) {
    this.axis = axis; this.c = c; this.a = Math.min(a, b); this.b = Math.max(a, b);
    this.n = o.n || 1;
    this.half = this.n * LW;
    this.sidewalk = o.sidewalk !== false;
    this.center = o.center || 'dashed';
    this.edge = o.edge !== undefined ? o.edge : !this.sidewalk;
    this.name = o.name || '';
    this.rect = axis === 'h'
      ? rect(this.a, c - this.half, this.b, c + this.half)
      : rect(c - this.half, this.a, c + this.half, this.b);
    this.gaps = [];      // intervals along the axis where the centre line is interrupted
    this.edgeGaps = [];  // intervals where edge lines are interrupted
    this.solid = [];     // intervals along the axis where the centre line is solid
  }
  /** Lateral coordinate of lane i (0 = rightmost) for traffic with the given heading name. */
  lane(heading, i = 0) {
    const off = (this.n - i - 0.5) * LW;
    if (heading === 'E' || heading === 'N') return this.c + off;
    return this.c - off;
  }
  /** Point on the lane centre at position `pos` along the road axis. */
  pt(heading, pos, i = 0) {
    const l = this.lane(heading, i);
    return this.axis === 'h' ? P(pos, l) : P(l, pos);
  }
}

class LightCycle {
  /** phases: [{d: seconds, A: state, B: state, ...}] */
  constructor(phases, offset = 0) {
    this.phases = phases; this.total = phases.reduce((s, p) => s + p.d, 0);
    this.t = offset; this.prev = {};
  }
  update(dt) { this.t += dt; }
  phaseAt(t) {
    let x = ((t % this.total) + this.total) % this.total;
    for (const p of this.phases) { if (x < p.d) return { p, left: p.d - x }; x -= p.d; }
    return { p: this.phases[0], left: 0 };
  }
  state(g) { return this.phaseAt(this.t).p[g] || 'red'; }
  timeLeft() { return this.phaseAt(this.t).left; }
}
/** Standard two-group cycle with yellow and red+yellow phases (Lithuanian sequence). */
function twoPhase(gA, gB, offset = 0) {
  return new LightCycle([
    { d: gA, A: 'green', B: 'red' },
    { d: 3, A: 'yellow', B: 'red' },
    { d: 1.5, A: 'red', B: 'red' },
    { d: 1.5, A: 'red', B: 'redyellow' },
    { d: gB, A: 'red', B: 'green' },
    { d: 3, A: 'red', B: 'yellow' },
    { d: 1.5, A: 'red', B: 'red' },
    { d: 1.5, A: 'redyellow', B: 'red' },
  ], offset);
}

class World {
  constructor(o = {}) {
    this.roads = []; this.junctions = []; this.rbs = []; this.zebras = []; this.lines = [];
    this.signs = []; this.lights = []; this.cycles = []; this.rails = []; this.crossings = [];
    this.zones = []; this.yieldRules = []; this.agents = []; this.spawners = []; this.triggers = [];
    this.decor = { trees: [], houses: [] }; this.extraDraw = [];
    this.route = null; this.goal = null; this.player = null;
    this.defaultLimit = o.limit || 50;
    this.town = o.town !== undefined ? o.town : true; // true, false or a rect
    this.seed = o.seed || 7;
    this.time = 0;
    this._dirty = true;
  }

  // ------------------------------------------------------------- roads ----
  hroad(y, x1, x2, o = {}) { const r = new Road('h', y, x1, x2, o); this.roads.push(r); this._dirty = true; return r; }
  vroad(x, y1, y2, o = {}) { const r = new Road('v', x, y1, y2, o); this.roads.push(r); this._dirty = true; return r; }

  detect() {
    if (!this._dirty) return;
    this._dirty = false;
    const keep = this.junctions.filter(j => j.manual);
    this.junctions = keep;
    for (const H of this.roads) {
      if (H.axis !== 'h') continue;
      for (const V of this.roads) {
        if (V.axis !== 'v') continue;
        if (V.c < H.a - V.half || V.c > H.b + V.half) continue;
        if (H.c < V.a - H.half || H.c > V.b + H.half) continue;
        const box = rect(V.c - V.half, H.c - H.half, V.c + V.half, H.c + H.half);
        const arms = {
          w: H.a < box.x - 1, e: H.b > box.x + box.w + 1,
          n: V.a < box.y - 1, s: V.b > box.y + box.h + 1,
        };
        const j = { x: V.c, y: H.c, box, h: H, v: V, arms, corners: [] };
        j.nArms = ['n', 'e', 's', 'w'].filter(a => arms[a]).length;
        const pairs = [['n', 'e', 1, -1], ['e', 's', 1, 1], ['s', 'w', -1, 1], ['w', 'n', -1, -1]];
        for (const [a1, a2, sx, sy] of pairs) {
          if (!arms[a1] || !arms[a2]) continue;
          const C = P(sx > 0 ? box.x + box.w : box.x, sy < 0 ? box.y : box.y + box.h);
          const F = P(C.x + sx * CR, C.y + sy * CR);
          j.corners.push({ C, F, sx, sy, sidewalk: H.sidewalk || V.sidewalk });
        }
        j.region = expandRect(box, CR);
        this.junctions.push(j);
        H.gaps.push([box.x, box.x + box.w]);
        V.gaps.push([box.y, box.y + box.h]);
        H.edgeGaps.push([box.x - (arms.n || arms.s ? CR : 0), box.x + box.w + CR]);
        V.edgeGaps.push([box.y - CR, box.y + box.h + CR]);
      }
    }
  }
  /** Junction nearest to a point. */
  jn(x, y) {
    this.detect();
    let best = null, bd = Infinity;
    for (const j of this.junctions) { const d = Math.hypot(j.x - x, j.y - y); if (d < bd) { bd = d; best = j; } }
    return best;
  }
  roadAt(p, axis) {
    for (const r of this.roads) if ((!axis || r.axis === axis) && inRect(p, r.rect)) return r;
    return null;
  }

  /** Roundabout with arms; arms = {n: len, e: len, s: len, w: len} (lengths measured from the centre). */
  roundabout(cx, cy, arms, o = {}) {
    const r1 = o.r1 || 80, r2 = o.r2 || 146;
    const rb = { cx, cy, r1, r2, rc: (r1 + r2) / 2, arms: {}, sidewalk: o.sidewalk !== false };
    for (const a of ['n', 'e', 's', 'w']) {
      if (!arms[a]) continue;
      const L = arms[a], s = r1 + 14;
      let road;
      if (a === 'e') road = this.hroad(cy, cx + s, cx + L, o);
      if (a === 'w') road = this.hroad(cy, cx - L, cx - s, o);
      if (a === 's') road = this.vroad(cx, cy + s, cy + L, o);
      if (a === 'n') road = this.vroad(cx, cy - L, cy - s, o);
      road.rbArm = rb;
      const lo = road.axis === 'h' ? cx - r2 - 40 : cy - r2 - 40, hi = road.axis === 'h' ? cx + r2 + 40 : cy + r2 + 40;
      road.gaps.push([lo, hi]); road.edgeGaps.push([lo, hi]);
      rb.arms[a] = { road, theta: ARM_ANGLE[a] };
    }
    this.rbs.push(rb);
    return rb;
  }
  inRoundabout(p, rb, extra = 0) {
    const r = Math.hypot(p.x - rb.cx, p.y - rb.cy);
    return r >= rb.r1 && r <= rb.r2 + extra;
  }

  // ---------------------------------------------------------- markings ----
  zebra(road, pos) {
    const w = 48;
    const r = road.axis === 'h'
      ? rect(pos - w / 2, road.c - road.half, pos + w / 2, road.c + road.half)
      : rect(road.c - road.half, pos - w / 2, road.c + road.half, pos + w / 2);
    const z = { road, pos, rect: r, axis: road.axis };
    road.gaps.push([pos - w / 2 - 2, pos + w / 2 + 2]);
    this.zebras.push(z);
    return z;
  }
  /** A painted transverse line {a,b,dir} across the incoming lanes. */
  line(a, b, dirName, o = {}) {
    const l = { a, b, dir: DIRV[dirName], heading: dirName, kind: o.kind || 'stop', mid: P((a.x + b.x) / 2, (a.y + b.y) / 2), ...o };
    this.lines.push(l);
    return l;
  }
  /** Geometry of the approach to junction j from arm `arm` (incoming lanes), line set `off` px before the box. */
  approach(j, arm, off = 8) {
    const B = j.box, H = j.h, V = j.v;
    switch (arm) {
      case 's': return { a: P(j.x, B.y + B.h + off), b: P(j.x + V.half, B.y + B.h + off), dir: 'N' };
      case 'n': return { a: P(j.x, B.y - off), b: P(j.x - V.half, B.y - off), dir: 'S' };
      case 'e': return { a: P(B.x + B.w + off, j.y), b: P(B.x + B.w + off, j.y - H.half), dir: 'W' };
      case 'w': return { a: P(B.x - off, j.y), b: P(B.x - off, j.y + H.half), dir: 'E' };
    }
  }
  /** Rectangle covering the incoming lanes of an arm from `from` to `from+len` px away from the box. */
  approachRect(j, arm, len, from = 0) {
    const B = j.box, H = j.h, V = j.v;
    switch (arm) {
      case 's': return rect(j.x, B.y + B.h + from, j.x + V.half, B.y + B.h + from + len);
      case 'n': return rect(j.x - V.half, B.y - from - len, j.x, B.y - from);
      case 'e': return rect(B.x + B.w + from, j.y - H.half, B.x + B.w + from + len, j.y);
      case 'w': return rect(B.x - from - len, j.y, B.x - from, j.y + H.half);
    }
  }
  stopLineAt(j, arm, o = {}) {
    const ap = this.approach(j, arm, o.off !== undefined ? o.off : 8);
    return this.line(ap.a, ap.b, ap.dir, o);
  }
  /** Line across a road at `pos` for traffic with the given heading. */
  lineAcross(road, pos, heading, o = {}) {
    const inner = road.c, outer = road.lane(heading, 0) + (road.lane(heading, 0) > road.c ? LW / 2 : -LW / 2);
    const a = road.axis === 'h' ? P(pos, inner) : P(inner, pos);
    const b = road.axis === 'h' ? P(pos, outer) : P(outer, pos);
    return this.line(a, b, heading, o);
  }

  // ------------------------------------------------------------- signs ----
  sign(x, y, type, value, facing) { const s = { x, y, type, value, facing }; this.signs.push(s); return s; }
  /** Sign at the right edge of a road for traffic with `heading`, at position `pos` along the axis. */
  roadSign(road, pos, heading, type, value, extra = 0) {
    const off = road.half + (road.sidewalk ? 16 : 22) + extra;
    let x, y;
    if (road.axis === 'h') { x = pos; y = heading === 'E' ? road.c + off : road.c - off; }
    else { y = pos; x = heading === 'S' ? road.c - off : road.c + off; }
    return this.sign(x, y, type, value, heading);
  }
  /** Sign placed before junction j on arm `arm` (right side of incoming traffic). */
  junctionSign(j, arm, type, value, back = 34, extra = 0) {
    const ap = this.approach(j, arm, 0);
    const d = DIRV[ap.dir];
    const rn = P(-d.y, d.x); // right-hand normal
    const off = 16 + extra;
    return this.sign(ap.b.x + rn.x * off - d.x * back, ap.b.y + rn.y * off - d.y * back, type, value, ap.dir);
  }
  stopSign(j, arm) {
    this.junctionSign(j, arm, 'stop', null, 40);
    return this.stopLineAt(j, arm, { requireStop: true, why: 'stopSign' });
  }
  yieldSign(j, arm) {
    this.junctionSign(j, arm, 'yield', null, 40);
    return this.stopLineAt(j, arm, { kind: 'yield' });
  }

  // ------------------------------------------------------------ lights ----
  cycle(c) { this.cycles.push(c); return c; }
  /** Traffic light for arm of junction j, controlled by group `g` of cycle `c`. */
  light(j, arm, c, g, o = {}) {
    const ln = this.stopLineAt(j, arm, { light: { cycle: c, group: g }, off: o.off !== undefined ? o.off : 8 });
    const d = DIRV[ln.heading];
    const rn = P(-d.y, d.x);
    const L = { x: ln.b.x + rn.x * 18 - d.x * 6, y: ln.b.y + rn.y * 18 - d.y * 6, cycle: c, group: g, facing: ln.heading, line: ln };
    this.lights.push(L);
    return ln;
  }

  // ----------------------------------------------------------- railway ----
  /** Vertical railway track at x. Returns rail object; crossings are detected against horizontal roads. */
  railway(x, y1, y2, o = {}) {
    const rail = { x, y1, y2 };
    this.rails.push(rail);
    for (const r of this.roads) {
      if (r.axis !== 'h' || x < r.a || x > r.b || r.c < y1 || r.c > y2) continue;
      const cr = { rail, road: r, x, y: r.c, guarded: !!o.guarded, flashing: false, barrier: 0, flashT: 0, lines: [] };
      r.gaps.push([x - 20, x + 20]); r.edgeGaps.push([x - 20, x + 20]);
      if (o.guarded) {
        // stop lines 10 m before the nearest rail
        cr.lines.push(this.lineAcross(r, x - 9 - 120, 'E', { rail: cr }));
        cr.lines.push(this.lineAcross(r, x + 9 + 120, 'W', { rail: cr }));
      }
      this.crossings.push(cr);
    }
    return rail;
  }

  // ------------------------------------------------------------- rules ----
  speedZone(r, limit) { this.zones.push({ rect: r, limit }); }
  limitAt(p) {
    let l = this.defaultLimit;
    for (const z of this.zones) if (inRect(p, z.rect)) l = z.limit;
    return l;
  }
  /** Player entering `conflict` while a vehicle is in `watch` (moving) or in `conflict` is a violation. */
  yieldRule(o) {
    const r = { conflict: [].concat(o.conflict), watch: [].concat(o.watch || []), key: o.key || 'yield', tags: o.tags || null, minV: o.minV !== undefined ? o.minV : 1.0 * PX, inside: false };
    this.yieldRules.push(r);
    return r;
  }
  goalAt(pt, heading, o = {}) {
    const along = 104, across = LW - 6;
    const horiz = heading === 'E' || heading === 'W';
    const r = horiz ? rect(pt.x - along / 2, pt.y - across / 2, pt.x + along / 2, pt.y + across / 2)
                    : rect(pt.x - across / 2, pt.y - along / 2, pt.x + across / 2, pt.y + along / 2);
    this.goal = { rect: r, stop: o.stop !== false, heading };
    return this.goal;
  }
  setRoute(pts, r = 70) { this.route = smoothPolyline(pts, r, 14); }
  hint(shape, text) { this.triggers.push({ shape, once: true, fn: g => g.setObjective(text) }); }
  trigger(shape, fn) { this.triggers.push({ shape, once: true, fn }); }
  start(x, y, heading) { this.player = { x, y, h: HEAD[heading] !== undefined ? HEAD[heading] : heading }; }

  // ------------------------------------------------------------ agents ----
  agent(kind, pts, o = {}) {
    const a = new Agent(kind, pts instanceof Path ? pts : new Path(pts), o);
    if (o.gates) a.gates = o.gates(a.path, a);
    this.agents.push(a);
    return a;
  }
  /** Repeating spawner. o: {pts | make(), kind, speed, interval:[a,b], first, gates(path), active(world,game), max} */
  spawner(o) {
    const s = { ...o, next: o.first !== undefined ? o.first : 0, count: 0 };
    if (o.pts) s.path = new Path(o.pts);
    this.spawners.push(s);
    return s;
  }

  /** Points of a path through junction j from arm `from` to arm `to`. */
  jpath(j, from, to, o = {}) {
    const inH = ARM_HEADING_IN[from], outH = ARM_HEADING_OUT[to];
    const inRoad = (from === 'n' || from === 's') ? j.v : j.h;
    const outRoad = (to === 'n' || to === 's') ? j.v : j.h;
    const li = inRoad.lane(inH, o.laneIn || 0), lo = outRoad.lane(outH, o.laneOut || 0);
    const B = j.box, inLen = o.inLen || 600, outLen = o.outLen || 600;
    const start = { s: P(li, B.y + B.h + inLen), n: P(li, B.y - inLen), e: P(B.x + B.w + inLen, li), w: P(B.x - inLen, li) }[from];
    const end = { n: P(lo, B.y - outLen), s: P(lo, B.y + B.h + outLen), e: P(B.x + B.w + outLen, lo), w: P(B.x - outLen, lo) }[to];
    const vertIn = from === 'n' || from === 's';
    const vertOut = to === 'n' || to === 's';
    if (vertIn === vertOut) return [start, end];
    const corner = vertIn ? P(li, lo) : P(lo, li);
    const turn = angDiff(HEAD[outH], HEAD[inH]);
    return smoothPolyline([start, corner, end], turn > 0 ? (o.r || 62) : (o.r || 95));
  }
  /** Points of a path through roundabout rb from arm `from` to arm `to`. */
  rbPath(rb, from, to, inLen = 700, outLen = 700) {
    const c = P(rb.cx, rb.cy), off = LW / 2;
    const th = ARM_ANGLE[from], tt = ARM_ANGLE[to];
    const u = a => P(Math.cos(a), Math.sin(a));
    const add = (p, v, k) => P(p.x + v.x * k, p.y + v.y * k);
    const vin = u(th - Math.PI / 2), vout = u(tt + Math.PI / 2);
    const start = add(add(c, u(th), inLen), vin, off);
    const e1 = add(add(c, u(th), rb.r2 + 26), vin, off);
    const aIn = th - Math.asin(off / rb.rc) - 0.22;
    let aOut = tt + Math.asin(off / rb.rc) + 0.22;
    while (aOut >= aIn) aOut -= TAU;
    while (aOut < aIn - TAU) aOut += TAU;
    const pts = [start, e1];
    for (let a = aIn; a > aOut; a -= 0.07) pts.push(add(c, u(a), rb.rc));
    pts.push(add(c, u(aOut), rb.rc));
    pts.push(add(add(c, u(tt), rb.r2 + 26), vout, off));
    pts.push(add(add(c, u(tt), outLen), vout, off));
    return smoothPolyline(pts, 34, 8);
  }

  // ------------------------------------------------------------ queries ---
  isSurface(p) {
    for (const r of this.roads) if (inRect(p, r.rect)) {
      if (r.rbArm && Math.hypot(p.x - r.rbArm.cx, p.y - r.rbArm.cy) < r.rbArm.r1) continue;
      return true;
    }
    for (const j of this.junctions) {
      if (inRect(p, j.box)) return true;
      for (const k of j.corners) {
        const inSq = (p.x - k.C.x) * k.sx >= 0 && (p.x - k.C.x) * k.sx <= CR && (p.y - k.C.y) * k.sy >= 0 && (p.y - k.C.y) * k.sy <= CR;
        if (inSq && Math.hypot(p.x - k.F.x, p.y - k.F.y) >= CR) return true;
      }
    }
    for (const rb of this.rbs) {
      const dx = p.x - rb.cx, dy = p.y - rb.cy, r = Math.hypot(dx, dy);
      if (r < rb.r1) continue;
      if (r <= rb.r2) return true;
      if (r <= rb.r2 + 40) {
        for (const a of Object.values(rb.arms)) {
          const ux = Math.cos(a.theta), uy = Math.sin(a.theta);
          if (dx * ux + dy * uy <= 0) continue;
          const lat = Math.abs(-dx * uy + dy * ux);
          if (lat <= a.road.half + 0.85 * (rb.r2 + 40 - r)) return true;
        }
      }
    }
    return false;
  }
  junctionAt(p, region = false) {
    for (const j of this.junctions) if (inRect(p, region ? j.region : j.box)) return j;
    return null;
  }

  // ------------------------------------------------------------- build ----
  finalize() {
    this.detect();
    // bounds
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of this.roads) { x1 = Math.min(x1, r.rect.x); y1 = Math.min(y1, r.rect.y); x2 = Math.max(x2, r.rect.x + r.rect.w); y2 = Math.max(y2, r.rect.y + r.rect.h); }
    this.bounds = rect(x1 - 500, y1 - 500, x2 + 500, y2 + 500);
    this.genDecor();
  }
  clearance(p) {
    let d = Infinity;
    for (const r of this.roads) d = Math.min(d, rectDist(p, expandRect(r.rect, r.sidewalk ? SW : 12)));
    for (const j of this.junctions) d = Math.min(d, rectDist(p, expandRect(j.box, SW)));
    for (const rb of this.rbs) {
      const r = Math.hypot(p.x - rb.cx, p.y - rb.cy);
      d = Math.min(d, r < rb.r1 ? 0 : Math.max(0, r - rb.r2 - SW));
    }
    for (const rail of this.rails) d = Math.min(d, Math.abs(p.x - rail.x) - 30 < 0 ? 0 : Math.abs(p.x - rail.x) - 30);
    return d;
  }
  genDecor() {
    const rnd = mulberry32(this.seed);
    const B = this.bounds;
    const houses = [];
    const townAt = p => this.town === true || (!!this.town && inRect(p, this.town));
    if (this.town) {
      const G = 130;
      for (let x = B.x; x < B.x + B.w; x += G) for (let y = B.y; y < B.y + B.h; y += G) {
        const w = 70 + rnd() * 45, h = 60 + rnd() * 45;
        const hx = x + (G - w) / 2, hy = y + (G - h) / 2;
        const c = P(hx + w / 2, hy + h / 2);
        const cl = this.clearance(c) - Math.max(w, h) / 2 * 1.42;
        if (cl > 8 && cl < 170 && townAt(c) && rnd() < 0.75) {
          const roofs = ['#b5523b', '#8e5a44', '#6b6f78', '#a7683f', '#7a4e3a', '#5e6d7e'];
          houses.push({ x: hx, y: hy, w, h, roof: roofs[Math.floor(rnd() * roofs.length)], ridgeH: rnd() < 0.5 });
        }
      }
    }
    const trees = [];
    const G2 = 56;
    for (let x = B.x; x < B.x + B.w; x += G2) for (let y = B.y; y < B.y + B.h; y += G2) {
      const p = P(x + rnd() * G2, y + rnd() * G2);
      const r = 14 + rnd() * 16;
      if (this.clearance(p) < r + 4) continue;
      if (houses.some(h => inRect(p, h, r + 6))) continue;
      const dense = (Math.sin(p.x * 0.0021 + 1.3) + Math.cos(p.y * 0.0027)) > (townAt(p) ? 0.9 : 0.1);
      if (rnd() < (dense ? 0.55 : 0.08)) trees.push({ x: p.x, y: p.y, r, shade: rnd() });
    }
    this.decor = { trees, houses };
  }
}

// ---------------------------------------------------------------------------
// Rendering of the static world
// ---------------------------------------------------------------------------
function visibleRect(view, r, m = 0) {
  return !(r.x + r.w < view.x - m || r.x > view.x + view.w + m || r.y + r.h < view.y - m || r.y > view.y + view.h + m);
}

function cornerPath(ctx, k, R) {
  const a0 = Math.atan2(-k.sy, 0), mid = Math.atan2(-k.sy, -k.sx);
  const sweep = angDiff(mid, a0) * 2;
  ctx.moveTo(k.C.x, k.C.y);
  for (let i = 0; i <= 12; i++) {
    const a = a0 + sweep * i / 12;
    ctx.lineTo(k.F.x + Math.cos(a) * R, k.F.y + Math.sin(a) * R);
  }
  ctx.closePath();
}
function cornerRing(ctx, k, R1, R2) {
  const a0 = Math.atan2(-k.sy, 0), mid = Math.atan2(-k.sy, -k.sx);
  const sweep = angDiff(mid, a0) * 2;
  for (let i = 0; i <= 12; i++) { const a = a0 + sweep * i / 12; ctx.lineTo(k.F.x + Math.cos(a) * R2, k.F.y + Math.sin(a) * R2); }
  for (let i = 12; i >= 0; i--) { const a = a0 + sweep * i / 12; ctx.lineTo(k.F.x + Math.cos(a) * R1, k.F.y + Math.sin(a) * R1); }
  ctx.closePath();
}

/** Complement of gap intervals within [a,b]. */
function openIntervals(a, b, gaps) {
  const g = gaps.map(x => [Math.max(a, x[0]), Math.min(b, x[1])]).filter(x => x[1] > x[0]).sort((p, q) => p[0] - q[0]);
  const out = []; let cur = a;
  for (const [s, e] of g) { if (s > cur) out.push([cur, s]); cur = Math.max(cur, e); }
  if (cur < b) out.push([cur, b]);
  return out;
}

function drawWorld(ctx, W, view, time) {
  // grass with subtle variation
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(view.x, view.y, view.w, view.h);
  ctx.fillStyle = COLORS.grass2;
  const T = 160;
  for (let x = Math.floor(view.x / T) * T; x < view.x + view.w; x += T)
    for (let y = Math.floor(view.y / T) * T; y < view.y + view.h; y += T)
      if (((x / T) * 7 + (y / T) * 13) % 5 === 0 || ((x / T) * 3 + (y / T) * 11) % 7 === 1) ctx.fillRect(x, y, T, T);

  // railway bed
  for (const rail of W.rails) {
    if (rail.x < view.x - 60 || rail.x > view.x + view.w + 60) continue;
    ctx.fillStyle = '#8f877a';
    ctx.fillRect(rail.x - 30, Math.max(view.y, rail.y1), 60, Math.min(view.h, rail.y2 - rail.y1));
  }

  // sidewalks / shoulders
  for (const r of W.roads) {
    const m = r.sidewalk ? SW : 12;
    const e = expandRect(r.rect, m);
    if (!visibleRect(view, e)) continue;
    ctx.fillStyle = r.sidewalk ? COLORS.sidewalk : COLORS.shoulder;
    ctx.fillRect(e.x, e.y, e.w, e.h);
  }
  for (const j of W.junctions) {
    if (!visibleRect(view, j.region, 40)) continue;
    const sw = j.h.sidewalk || j.v.sidewalk;
    const e = expandRect(j.box, sw ? SW : 12);
    ctx.fillStyle = sw ? COLORS.sidewalk : COLORS.shoulder;
    ctx.fillRect(e.x, e.y, e.w, e.h);
    for (const k of j.corners) {
      ctx.beginPath(); cornerRing(ctx, k, CR - (k.sidewalk ? SW : 12), CR); ctx.fill();
    }
  }
  for (const rb of W.rbs) {
    ctx.fillStyle = rb.sidewalk ? COLORS.sidewalk : COLORS.shoulder;
    ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r2 + (rb.sidewalk ? SW : 12), 0, TAU); ctx.fill();
  }

  // asphalt
  ctx.fillStyle = COLORS.asphalt;
  for (const r of W.roads) if (visibleRect(view, r.rect, 10)) ctx.fillRect(r.rect.x, r.rect.y, r.rect.w, r.rect.h);
  for (const j of W.junctions) {
    if (!visibleRect(view, j.region, 10)) continue;
    ctx.fillRect(j.box.x, j.box.y, j.box.w, j.box.h);
    ctx.beginPath();
    for (const k of j.corners) cornerPath(ctx, k, CR);
    ctx.fill();
  }
  for (const rb of W.rbs) {
    ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r2, 0, TAU); ctx.fill();
    for (const a of Object.values(rb.arms)) {
      const u = P(Math.cos(a.theta), Math.sin(a.theta)), n = P(-u.y, u.x);
      const h = a.road.half, R0 = rb.r2 + 40, R1 = rb.r2 - 12, wide = h + 0.85 * (R0 - R1);
      ctx.beginPath();
      ctx.moveTo(rb.cx + u.x * R0 + n.x * h, rb.cy + u.y * R0 + n.y * h);
      ctx.lineTo(rb.cx + u.x * R1 + n.x * wide, rb.cy + u.y * R1 + n.y * wide);
      ctx.lineTo(rb.cx + u.x * R1 - n.x * wide, rb.cy + u.y * R1 - n.y * wide);
      ctx.lineTo(rb.cx + u.x * R0 - n.x * h, rb.cy + u.y * R0 - n.y * h);
      ctx.fill();
    }
    // island
    ctx.fillStyle = COLORS.kerb; ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#86b062'; ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r1 - 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6e9a4c'; ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rb.r1 - 26, 0, TAU); ctx.fill();
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      ctx.fillStyle = i % 2 ? '#e2556b' : '#f3c84b';
      ctx.beginPath(); ctx.arc(rb.cx + Math.cos(a) * (rb.r1 - 16), rb.cy + Math.sin(a) * (rb.r1 - 16), 4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = COLORS.asphalt;
  }

  // lane markings
  ctx.strokeStyle = COLORS.marking; ctx.fillStyle = COLORS.marking;
  for (const r of W.roads) {
    if (!visibleRect(view, r.rect, 10)) continue;
    const open = openIntervals(r.a, r.b, r.gaps);
    const seg = (a, b, lat, dash) => {
      ctx.beginPath();
      ctx.setLineDash(dash ? [36, 48] : []);
      ctx.lineDashOffset = 0;
      if (r.axis === 'h') { ctx.moveTo(a, lat); ctx.lineTo(b, lat); } else { ctx.moveTo(lat, a); ctx.lineTo(lat, b); }
      ctx.stroke();
    };
    ctx.lineWidth = 3;
    for (const [a, b] of open) {
      if (r.center === 'dashed' || r.center === 'solid') {
        // solid sections near junctions/stop lines
        const solidIv = r.solid.map(s => [Math.max(a, s[0]), Math.min(b, s[1])]).filter(s => s[1] > s[0]);
        const dashIv = openIntervals(a, b, r.solid);
        for (const [s, e] of dashIv) seg(s, e, r.c, r.center === 'dashed');
        for (const [s, e] of solidIv) seg(s, e, r.c, false);
      }
      for (let k = 1; k < r.n; k++) { seg(a, b, r.c + k * LW, true); seg(a, b, r.c - k * LW, true); }
    }
    if (r.edge) {
      for (const [a, b] of openIntervals(r.a, r.b, r.edgeGaps)) { seg(a, b, r.c + r.half - 4, false); seg(a, b, r.c - r.half + 4, false); }
    }
  }
  ctx.setLineDash([]);
  // zebras
  for (const z of W.zebras) {
    if (!visibleRect(view, z.rect, 10)) continue;
    ctx.fillStyle = COLORS.marking;
    const R = z.rect;
    if (z.axis === 'h') for (let y = R.y + 3; y < R.y + R.h - 4; y += 14) ctx.fillRect(R.x, y, R.w, 7);
    else for (let x = R.x + 3; x < R.x + R.w - 4; x += 14) ctx.fillRect(x, R.y, 7, R.h);
  }
  // stop / yield lines
  for (const l of W.lines) {
    ctx.strokeStyle = COLORS.marking;
    ctx.lineWidth = l.kind === 'yield' ? 4 : 6;
    ctx.setLineDash(l.kind === 'yield' ? [9, 7] : []);
    ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // roundabout entry yield lines
  for (const rb of W.rbs) {
    for (const a of Object.values(rb.arms)) {
      const u = P(Math.cos(a.theta), Math.sin(a.theta)), n = P(Math.cos(a.theta - Math.PI / 2), Math.sin(a.theta - Math.PI / 2));
      const R = rb.r2 + 22, h = a.road.half;
      ctx.strokeStyle = COLORS.marking; ctx.lineWidth = 4; ctx.setLineDash([9, 7]);
      ctx.beginPath(); ctx.moveTo(rb.cx + u.x * R, rb.cy + u.y * R); ctx.lineTo(rb.cx + u.x * R + n.x * h, rb.cy + u.y * R + n.y * h); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  // railway tracks
  for (const rail of W.rails) {
    if (rail.x < view.x - 60 || rail.x > view.x + view.w + 60) continue;
    const y1 = Math.max(view.y - 20, rail.y1), y2 = Math.min(view.y + view.h + 20, rail.y2);
    for (let y = Math.floor(y1 / 16) * 16; y < y2; y += 16) {
      const onRoad = W.crossings.some(c => Math.abs(y - c.y) < c.road.half);
      ctx.fillStyle = onRoad ? '#3d3f44' : '#6b4f35';
      ctx.fillRect(rail.x - 20, y, 40, onRoad ? 16 : 6);
    }
    ctx.fillStyle = '#c8ccd2';
    ctx.fillRect(rail.x - 11, y1, 3, y2 - y1);
    ctx.fillRect(rail.x + 8, y1, 3, y2 - y1);
  }
}

function drawDecorTrees(ctx, W, view) {
  for (const h of W.decor.houses) {
    if (!visibleRect(view, h, 20)) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(h.x + 6, h.y + 6, h.w, h.h);
    ctx.fillStyle = h.roof; ctx.fillRect(h.x, h.y, h.w, h.h);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    if (h.ridgeH) ctx.fillRect(h.x, h.y, h.w, h.h / 2); else ctx.fillRect(h.x, h.y, h.w / 2, h.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (h.ridgeH) { ctx.moveTo(h.x, h.y + h.h / 2); ctx.lineTo(h.x + h.w, h.y + h.h / 2); }
    else { ctx.moveTo(h.x + h.w / 2, h.y); ctx.lineTo(h.x + h.w / 2, h.y + h.h); }
    ctx.stroke();
  }
  for (const t of W.decor.trees) {
    if (t.x < view.x - 40 || t.x > view.x + view.w + 40 || t.y < view.y - 40 || t.y > view.y + view.h + 40) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.arc(t.x + 5, t.y + 6, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = t.shade < 0.5 ? '#3f7a3a' : '#4d8a3f';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, TAU); ctx.fill();
  }
}
