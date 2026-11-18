'use strict';
// ---------------------------------------------------------------------------
// Player car, rule checking, camera, HUD and main loop.
// ---------------------------------------------------------------------------

class PlayerCar {
  constructor(x, y, h) {
    this.x = x; this.y = y; this.h = h; this.v = 0; this.steer = 0;
    this.l = 4.4 * PX; this.w = 1.85 * PX; this.wheelbase = 2.7 * PX;
    this.kind = 'car'; this.color = '#e8412c';
    this.signal = 'none'; this.signalTime = 0; this.sigAccum = 0; this.lastSig = null;
    this.braking = false; this.reversing = false; this.revHold = 0; this.odo = 0;
  }
  toggleSignal(dir) {
    this.signal = this.signal === dir ? 'none' : dir;
    this.signalTime = 0; this.sigAccum = 0;
  }
  front() { return P(this.x + Math.cos(this.h) * this.l / 2, this.y + Math.sin(this.h) * this.l / 2); }
  update(dt, inp, now) {
    const maxF = fromKmh(110), maxR = fromKmh(14);
    const A = 3.0 * PX, B = 8.0 * PX;
    this.braking = false;
    if (inp.up && !inp.down) {
      this.revHold = 0;
      if (this.v < -0.1) { this.v = Math.min(0, this.v + B * dt); this.braking = true; }
      else this.v += A * Math.max(0.15, 1 - this.v / maxF) * dt;
    } else if (inp.down) {
      if (this.v > 0.3 * PX) { this.v = Math.max(0, this.v - B * dt); this.braking = true; this.revHold = 0; }
      else {
        this.braking = true;
        this.revHold += dt;
        if (this.revHold > 0.4) this.v = Math.max(-maxR, this.v - 2.2 * PX * dt);
        else if (this.v > 0) this.v = 0;
      }
    } else {
      this.revHold = 0;
      const d = (0.35 * PX + Math.abs(this.v) * 0.04) * dt;
      this.v = Math.abs(this.v) <= d ? 0 : this.v - Math.sign(this.v) * d;
    }
    if (inp.brake) {
      const d = 11 * PX * dt;
      this.v = Math.abs(this.v) <= d ? 0 : this.v - Math.sign(this.v) * d;
      this.braking = true;
    }
    this.v = clamp(this.v, -maxR, maxF);
    this.reversing = this.v < -0.1;
    // steering – less lock at speed
    const sp = Math.abs(this.v) / PX;
    const maxSteer = 0.62 / (1 + sp * 0.07);
    const target = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0) + (inp.steer || 0)) * maxSteer;
    const rate = (inp.left || inp.right || inp.steer) ? (inp.touch ? 1.6 : 2.6) : 4.0; // gentler ramp on touch screens
    this.steer += clamp(clamp(target, -maxSteer, maxSteer) - this.steer, -rate * dt, rate * dt);
    const h0 = this.h;
    this.h = normAng(this.h + this.v / this.wheelbase * Math.tan(this.steer) * dt);
    this.x += Math.cos(this.h) * this.v * dt;
    this.y += Math.sin(this.h) * this.v * dt;
    this.odo += Math.abs(this.v) * dt;
    // indicator self-cancelling after the turn (like a real steering column)
    if (this.signal !== 'none') {
      const dh = angDiff(this.h, h0);
      this.signalTime += dt;
      this.sigAccum += this.signal === 'right' ? Math.max(0, dh) : Math.max(0, -dh);
      this.lastSig = { dir: this.signal, t: now, dur: this.signalTime };
      if (this.sigAccum > 0.95 && Math.abs(this.steer) < 0.08) { this.signal = 'none'; this.signalTime = 0; this.sigAccum = 0; }
    }
  }
}

// --------------------------------------------------------------- helpers ----
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = v => Array.isArray(v) ? rnd(v[0], v[1]) : v;

/** Any (non-pedestrian) vehicle inside any of the shapes. */
function vehicleIn(W, G, shapes, o = {}) {
  shapes = [].concat(shapes);
  const minV = o.minV || 0;
  const test = v => shapes.some(s => inShape(v, s) || inShape(frontOf(v), s));
  for (const a of W.agents) {
    if (a.done || a.kind === 'ped' || a.kind === 'train' || a === o.exclude) continue;
    if (o.tags && !a.tags.some(t => o.tags.includes(t))) continue;
    if (a.v >= minV && test(a)) return a;
  }
  if (o.player !== false && G && G.car && Math.abs(G.car.v) >= minV && test(G.car)) return G.car;
  return null;
}
function frontOf(v) { return P(v.x + Math.cos(v.h) * v.l / 2, v.y + Math.sin(v.h) * v.l / 2); }

/** True when no vehicle is on / about to reach the zebra (pedestrian may step out). */
function zebraClear(W, G, z) {
  const vs = W.agents.filter(a => !a.done && a.kind !== 'ped' && a.kind !== 'train');
  if (G && G.car) vs.push(G.car);
  const cx = z.rect.x + z.rect.w / 2, cy = z.rect.y + z.rect.h / 2;
  for (const v of vs) {
    // vehicle body on the crossing: wait
    if (obb(v.x, v.y, v.h, v.l, v.w).some(q => inRect(q, z.rect)) || inRect(v, z.rect)) return false;
    const f = frontOf(v);
    const d = rectDist(f, z.rect);
    const c = Math.cos(v.h), s = Math.sin(v.h);
    const toward = (cx - v.x) * c + (cy - v.y) * s > 0;
    const sp = Math.abs(v.v);
    if (!toward || sp < 1.0 * PX) continue; // stopped / yielding or driving away
    if (d < 30 || d / sp < 2.2) return false;
  }
  return true;
}

/** Gate at the point of a path closest to `pt`. */
function gateAt(path, pt, open, hard = false) { return { s: path.project(pt), open, hard }; }
function lightGate(path, line, cyc, g) { return gateAt(path, line.mid, () => cyc.state(g) === 'green'); }

/** Pedestrian crossing a zebra. side: -1 starts on the low-coordinate side (north/west), +1 the other. */
function pedCross(W, z, side, o = {}) {
  const R = z.road, along = (o.offset !== undefined ? o.offset : rnd(-12, 12));
  const edge = R.half + 26, curb = R.half + 24;
  const walkIn = o.walkIn !== undefined ? o.walkIn : 70, walkOut = 90;
  let pts, gp;
  if (z.axis === 'h') {
    const x = z.pos + along, y0 = R.c + side * edge, y1 = R.c - side * edge;
    pts = [P(x - walkIn * side, y0), P(x, y0), P(x, y1), P(x + walkOut * side, y1)];
    gp = P(x, R.c + side * curb);
  } else {
    const y = z.pos + along, x0 = R.c + side * edge, x1 = R.c - side * edge;
    pts = [P(x0, y - walkIn * side), P(x0, y), P(x1, y), P(x1, y + walkOut * side)];
    gp = P(R.c + side * curb, y);
  }
  return W.agent('ped', pts, {
    speed: o.speed || rnd(4.3, 5.4),
    gates: path => [gateAt(path, gp, (a, W2, G) => zebraClear(W2, G, z), true)],
  });
}

// ------------------------------------------------------------------ Game ----
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = { up: false, down: false, left: false, right: false, brake: false, steer: 0 };
    this.state = 'menu';
    this.cam = { x: 0, y: 0, z: 1 };
    this.toasts = [];
    this.levelIndex = 0;
    this.last = performance.now();
    this.r3d = null;
    const gl = document.getElementById('gl');
    if (gl && Renderer3D.supported()) {
      try { this.r3d = new Renderer3D(gl); } catch (e) { console.warn('3D view unavailable', e); this.r3d = null; }
    }
    this.view3d = !!this.r3d;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  setView3d(on) {
    this.view3d = !!(on && this.r3d);
    const gl = document.getElementById('gl');
    if (gl) gl.style.display = this.view3d ? 'block' : 'none';
    return this.view3d;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    this.canvas.width = Math.round(this.vw * dpr); this.canvas.height = Math.round(this.vh * dpr);
    this.canvas.style.width = this.vw + 'px'; this.canvas.style.height = this.vh + 'px';
    if (this.r3d) this.r3d.resize();
  }

  load(i) {
    this.levelIndex = i;
    this.level = LEVELS[i];
    this.run = (this.run || 0) + 1;
    this.blame = null;
    agentSeq = 0;
    const W = new World(this.level.world || {});
    this.level.build(W);
    W.finalize();
    this.W = W;
    const p = W.player;
    this.car = new PlayerCar(p.x, p.y, p.h);
    this.cam.x = p.x; this.cam.y = p.y;
    this.time = 0; this.toasts = [];
    this.trk = { wrongT: 0, overT: 0, offT: 0, jt: null, rbIn: new Map(), rbDirT: 0 };
    this.prevFront = this.car.front();
    this.failInfo = null;
    this.setObjective(this.level.objective || '');
    // warm up the traffic so the world feels alive
    for (let k = 0; k < (this.level.warmup || 0) * 30; k++) this.simWorld(1 / 30, true);
  }
  setObjective(t) { this.objective = t; const el = document.getElementById('objective'); if (el) el.innerHTML = t; }
  toast(text, good = true) { this.toasts.push({ text, t: 0, good }); }

  // --------------------------------------------------------- simulation ----
  simWorld(dt, warm = false) {
    const W = this.W;
    W.time += dt;
    for (const c of W.cycles) c.update(dt);
    for (const s of W.spawners) {
      if (s.active && !s.active(W, this)) continue;
      s.next -= dt;
      if (s.next > 0) continue;
      if (s.max && s.count >= s.max) { s.next = Infinity; continue; }
      const path = s.path || new Path(s.make(W, this));
      const p0 = path.at(0);
      const blocked = W.agents.some(a => !a.done && a.kind !== 'ped' && dist(a, p0) < 130) || (!warm && dist(this.car, p0) < 130);
      if (blocked) { s.next = 0.4; continue; }
      W.agent(s.kind || 'car', path, { speed: pick(s.speed || 45), gates: s.gates, tags: s.tags, color: s.color, blink: s.blink });
      s.count++;
      s.next = pick(s.interval || [4, 7]);
    }
    for (const z of W.zebras) {
      const R = z.rect, ext = z.axis === 'h' ? rect(R.x - 6, R.y - 22, R.x + R.w + 6, R.y + R.h + 22) : rect(R.x - 22, R.y - 6, R.x + R.w + 22, R.y + R.h + 6);
      z.busy = W.agents.some(a => a.kind === 'ped' && inRect(a, ext) && (a.v > 0.3 || inRect(a, R)));
    }
    for (const a of W.agents) a.update(dt, W, warm ? null : this);
    W.agents = W.agents.filter(a => !a.done);
    for (const cr of W.crossings) this.updateCrossing(cr, dt);
  }
  updateCrossing(cr, dt) {
    let flashing = false;
    for (const a of this.W.agents) {
      if (a.kind !== 'train') continue;
      const dir = Math.sin(a.h) >= 0 ? 1 : -1;
      const frontD = (cr.y - a.y) * dir - a.l / 2;
      const tailPast = (a.y - cr.y) * dir - a.l / 2 > cr.road.half + 20;
      if (frontD < 1900 && !tailPast) flashing = true;
    }
    if (cr.guarded) {
      if (flashing) cr.flashT += dt; else cr.flashT = Math.max(0, cr.flashT - dt);
      cr.flashing = flashing || cr.barrier > 0.05;
      const target = flashing && cr.flashT > 1.5 ? 1 : 0;
      cr.barrier = clamp(cr.barrier + clamp(target - cr.barrier, -dt / 3, dt / 3), 0, 1);
    }
  }

  update(dt) {
    if (this.state !== 'play') {
      if (this.state === 'fail' || this.state === 'win') { this.failT = (this.failT || 0) + dt; this.updateToasts(dt); }
      return;
    }
    this.time += dt;
    const W = this.W, car = this.car;
    this.simWorld(dt);
    this.prevFront = car.front();
    car.update(dt, this.input, W.time);
    for (const t of W.triggers) if (!t.fired && inShape(car, t.shape)) { t.fired = true; t.fn(this); }
    this.checkRules(dt);
    this.updateToasts(dt);
  }
  updateToasts(dt) { for (const t of this.toasts) t.t += dt; this.toasts = this.toasts.filter(t => t.t < 2.6); }

  fail(key, extra) {
    if (this.state !== 'play') return;
    const r = RULES[key] || { title: key, text: '', ket: '' };
    this.failInfo = { ...r, key, extra };
    this.state = 'fail'; this.failT = 0;
    const run = this.run;
    setTimeout(() => { if (this.run === run && this.state === 'fail') UI.showResult(false); }, 900);
  }
  win() {
    if (this.state !== 'play') return;
    this.state = 'win'; this.failT = 0;
    Progress.complete(this.levelIndex, this.time);
    const run = this.run;
    setTimeout(() => { if (this.run === run && this.state === 'win') UI.showResult(true); }, 500);
  }

  checkRules(dt) {
    const W = this.W, car = this.car, trk = this.trk;
    const c = P(car.x, car.y), front = car.front(), prevFront = this.prevFront;
    const speed = Math.abs(car.v);

    // collisions
    const box = obb(car.x, car.y, car.h, car.l - 2, car.w - 2);
    for (const a of W.agents) {
      if (Math.abs(a.x - car.x) > (a.l + car.l) || Math.abs(a.y - car.y) > (a.l + car.l)) continue;
      if (dist(a, car) > (a.l + car.l) / 2 + 10) continue;
      if (obbOverlap(box, a.box(1))) { this.blame = a; return this.fail(a.kind === 'train' ? 'trainCrash' : 'crash'); }
    }
    // off-road
    if (!inRect(c, W.bounds)) return this.fail('offroad');
    const corners = obb(car.x, car.y, car.h, car.l - 6, car.w - 4);
    const off = corners.filter(p => !W.isSurface(p)).length;
    if (!W.isSurface(c) || off >= 2) trk.offT += dt; else trk.offT = 0;
    if (trk.offT > 0.12) return this.fail('offroad');
    // route
    if (W.route && polyDist(c, W.route) > 130) return this.fail('route');

    // lane discipline
    const nearRb = W.rbs.some(rb => Math.hypot(c.x - rb.cx, c.y - rb.cy) < rb.r2 + 70);
    let wrong = false, solid = false;
    if (!W.junctionAt(c, true) && !nearRb && speed > 0.8 * PX) {
      for (const r of W.roads) {
        if (!inRect(c, r.rect)) continue;
        const along = r.axis === 'h' ? Math.cos(car.h) : Math.sin(car.h);
        if (Math.abs(along) < 0.5) continue;
        const sgn = Math.sign(along) * Math.sign(car.v);
        const tol = 9; // px past the centre line before it counts
        const w = r.axis === 'h' ? (sgn > 0 ? c.y < r.c - tol : c.y > r.c + tol) : (sgn > 0 ? c.x > r.c + tol : c.x < r.c - tol);
        if (w) { wrong = true; const pos = r.axis === 'h' ? c.x : c.y; solid = r.center === 'solid' || r.solid.some(s => pos >= s[0] && pos <= s[1]); }
      }
    }
    trk.wrongT = wrong ? trk.wrongT + dt : Math.max(0, trk.wrongT - dt * 2);
    if (trk.wrongT > 0.9) return this.fail(solid ? 'solidLine' : 'wrongLane');

    // speed
    const lim = W.limitAt(c);
    this.limit = lim;
    const kmh = toKmh(speed);
    if (kmh > lim + 4) trk.overT += dt; else trk.overT = Math.max(0, trk.overT - dt);
    if (trk.overT > 1.3) return this.fail('speeding', `You drove ${Math.round(kmh)} km/h where the limit is ${lim} km/h.`);

    // junction turns & indicators
    const jr = W.junctions.find(j => j.nArms >= 3 && inRect(c, j.region)) || null;
    if (jr && (!trk.jt || trk.jt.j !== jr)) {
      trk.jt = { j: jr, hIn: cardinal(car.h), sig: car.signal, sigT: car.signalTime, lane: this.laneIndex(jr, cardinal(car.h)), inBox: false };
    }
    if (trk.jt && !trk.jt.inBox && inRect(c, trk.jt.j.box)) { trk.jt.inBox = true; trk.jt.sig = car.signal; trk.jt.sigT = car.signalTime; }
    if (trk.jt && trk.jt.j !== jr) {
      const jt = trk.jt; trk.jt = null;
      const q = Math.round(angDiff(HEAD[cardinal(car.h)], HEAD[jt.hIn]) / (Math.PI / 2));
      const turn = q === 1 ? 'right' : q === 0 ? 'straight' : 'left';
      if (car.v > 0 && jt.inBox) {
        if (turn !== 'straight') {
          if (jt.sig !== turn) return this.fail('noSignal');
          if (jt.sigT < 0.5) return this.fail('lateSignal');
          if (jt.lane) {
            const [i, n] = jt.lane;
            if ((turn === 'right' && i !== 0) || (turn === 'left' && i !== n - 1)) return this.fail('laneTurn');
          }
          this.toast('Turn signal ✓');
        } else if (jt.sig !== 'none' && jt.sigT > 1.0) return this.fail('wrongSignal');
      }
    }

    // roundabouts
    for (const rb of W.rbs) {
      const dx = c.x - rb.cx, dy = c.y - rb.cy, r = Math.hypot(dx, dy);
      const was = trk.rbIn.get(rb) || false;
      if (r < rb.r2 - 6 && r > rb.r1) {
        if (!was) trk.rbIn.set(rb, true);
        const vx = Math.cos(car.h) * car.v, vy = Math.sin(car.h) * car.v;
        const cross = (dx * vy - dy * vx) / (r * Math.max(speed, 1));
        if (speed > 1 * PX && cross > 0.35) trk.rbDirT += dt; else trk.rbDirT = 0;
        if (trk.rbDirT > 0.4) return this.fail('rbDirection');
      } else if (was && r > rb.r2 + 12) {
        trk.rbIn.set(rb, false);
        const ls = car.lastSig;
        const ok = (car.signal === 'right' && car.signalTime > 0.4) || (ls && ls.dir === 'right' && W.time - ls.t < 1.2 && ls.dur > 0.4);
        if (!ok) return this.fail('rbSignal');
        this.toast('Exit signal ✓');
      }
    }

    // painted lines: stop signs, traffic lights, railway
    for (const l of W.lines) {
      const sx = l.b.x - l.a.x, sy = l.b.y - l.a.y, len = Math.hypot(sx, sy);
      const t = ((front.x - l.a.x) * sx + (front.y - l.a.y) * sy) / len;
      const lat = t > -14 && t < len + 14;
      const d = (l.mid.x - front.x) * l.dir.x + (l.mid.y - front.y) * l.dir.y;
      const pd = (l.mid.x - prevFront.x) * l.dir.x + (l.mid.y - prevFront.y) * l.dir.y;
      const facing = Math.cos(car.h) * l.dir.x + Math.sin(car.h) * l.dir.y > 0.3;
      if (l.light) {
        const st = l.light.cycle.state(l.light.group);
        if (st === 'yellow' && l.prevSt === 'green') l.yRec = lat && facing && d > 0 ? { d, v: speed } : null;
        if (st !== 'yellow') l.yRec = null;
        l.prevSt = st;
      }
      if (l.requireStop) {
        if (lat && facing && d > -6 && d < 170 && speed < fromKmh(0.6)) { if (!l.stopped) this.toast('Full stop ✓'); l.stopped = true; }
        if (Math.abs(d) > 400) l.stopped = false;
      }
      if (lat && facing && pd > 0 && d <= 0 && car.v > 0) {
        if (l.requireStop && !l.stopped) return this.fail(l.why || 'stopSign');
        l.stopped = false;
        if (l.light) {
          const st = l.light.cycle.state(l.light.group);
          if (st === 'red' || st === 'redyellow') return this.fail('redLight');
          if (st === 'yellow' && l.yRec) {
            const v = l.yRec.v, sd = v * 0.8 + v * v / (2 * 5 * PX);
            if (l.yRec.d > sd + 24) return this.fail('yellowLight');
          }
        }
        if (l.rail && l.rail.flashing) return this.fail('rail');
      }
    }

    // give-way rules
    for (const r of W.yieldRules) {
      const inside = r.conflict.some(s => inShape(front, s) || inShape(c, s));
      if (inside && !r.inside && car.v > 0) {
        const bad = W.agents.find(a => !a.done && a.kind !== 'ped' && a.kind !== 'train' &&
          (!r.tags || a.tags.some(t => r.tags.includes(t))) &&
          ((a.v > r.minV && r.watch.some(s => inShape(a, s) || inShape(frontOf(a), s))) ||
           (a.v > 0.3 * PX && r.conflict.some(s => inShape(a, s) || inShape(frontOf(a), s)))));
        if (bad) { this.blame = bad; return this.fail(r.key); }
      }
      r.inside = inside;
    }

    // pedestrian crossings
    for (const z of W.zebras) {
      const zr = expandRect(z.rect, 4);
      const inside = inRect(front, zr) || inRect(c, zr);
      if (inside && !z.inside && car.v > 0) {
        const ext = z.axis === 'h' ? rect(z.rect.x - 6, z.rect.y - 22, z.rect.x + z.rect.w + 6, z.rect.y + z.rect.h + 22)
                                   : rect(z.rect.x - 22, z.rect.y - 6, z.rect.x + z.rect.w + 22, z.rect.y + z.rect.h + 6);
        const ped = W.agents.find(a => a.kind === 'ped' && inRect(a, ext));
        if (ped) { this.blame = ped; return this.fail('yieldPed'); }
      }
      z.inside = inside;
    }

    // goal
    const g = W.goal;
    if (g && inRect(c, g.rect)) {
      const aligned = Math.cos(car.h - HEAD[g.heading]) > 0.6;
      if (!g.stop || (speed < fromKmh(0.8) && aligned)) return this.win();
    }
  }
  laneIndex(j, heading) {
    const road = (heading === 'E' || heading === 'W') ? j.h : j.v;
    if (road.n < 2) return null;
    const lat = { E: this.car.y - road.c, W: road.c - this.car.y, S: road.c - this.car.x, N: this.car.x - road.c }[heading];
    const i = clamp(road.n - 1 - Math.floor(lat / LW), 0, road.n - 1);
    return [i, road.n];
  }

  // ------------------------------------------------------------- render ----
  render(dt) {
    const ctx = this.ctx, W = this.W;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (W && this.view3d) {
      ctx.clearRect(0, 0, this.vw, this.vh);
      this.r3d.render(this, dt);
      this.drawHUD(ctx);
      return;
    }
    ctx.fillStyle = '#5d8a45'; ctx.fillRect(0, 0, this.vw, this.vh);
    if (!W) return;
    const car = this.car;
    // camera
    const look = clamp(car.v * 0.9, -80, 240);
    const tx = car.x + Math.cos(car.h) * look, ty = car.y + Math.sin(car.h) * look;
    const k = Math.min(1, dt * 3.5);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    const base = clamp(Math.sqrt(this.vw * this.vh) / 915, 0.55, 1.35);
    const zt = base * (1 - Math.min(0.28, toKmh(Math.abs(car.v)) / 330));
    this.cam.z += (zt - this.cam.z) * Math.min(1, dt * 1.5);
    const z = this.cam.z;
    const view = { x: this.cam.x - this.vw / 2 / z, y: this.cam.y - this.vh / 2 / z, w: this.vw / z, h: this.vh / z };
    const time = W.time;

    ctx.save();
    ctx.translate(this.vw / 2, this.vh / 2); ctx.scale(z, z); ctx.translate(-this.cam.x, -this.cam.y);
    drawWorld(ctx, W, view, time);
    // route guide
    if (W.route) {
      ctx.strokeStyle = 'rgba(70,190,255,0.45)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.setLineDash([2, 22]); ctx.lineDashOffset = -time * 30;
      ctx.beginPath(); W.route.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      ctx.setLineDash([]); ctx.lineCap = 'butt';
    }
    // goal
    if (W.goal) {
      const r = W.goal.rect, pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.fillStyle = `rgba(60,230,120,${0.18 + pulse * 0.15})`; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = 'rgba(60,230,120,0.95)'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]);
      ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(W.goal.stop ? 'P' : '★', r.x + r.w / 2, r.y + r.h / 2);
    }
    // agents
    for (const a of W.agents) if (a.kind === 'ped') drawAgent(ctx, a, time);
    for (const a of W.agents) if (a.kind !== 'ped' && a.kind !== 'train') drawAgent(ctx, a, time);
    drawVehicle(ctx, { ...car, blink: car.signal === 'none' ? null : car.signal }, time);
    for (const a of W.agents) if (a.kind === 'train') drawAgent(ctx, a, time);
    drawDecorTrees(ctx, W, view);
    // highlight on failure
    if (this.state === 'fail') {
      ctx.strokeStyle = `rgba(255,50,50,${0.6 + 0.4 * Math.sin(this.failT * 10)})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(car.x, car.y, 46, 0, TAU); ctx.stroke();
      if (this.blame && !this.blame.done) { ctx.strokeStyle = 'rgba(255,200,0,0.9)'; ctx.beginPath(); ctx.arc(this.blame.x, this.blame.y, Math.max(26, this.blame.l * 0.6), 0, TAU); ctx.stroke(); }
    }
    // railway crossings
    for (const cr of W.crossings) this.drawCrossing(ctx, cr, time);
    // lights & signs
    for (const L of W.lights) drawTrafficLight(ctx, L.x, L.y, L.cycle.state(L.group));
    for (const s of W.signs) if (s.x > view.x - 50 && s.x < view.x + view.w + 50 && s.y > view.y - 50 && s.y < view.y + view.h + 50) drawWorldSign(ctx, s);
    ctx.restore();

    this.drawHUD(ctx);
  }
  drawCrossing(ctx, cr, time) {
    if (!cr.guarded) return;
    const r = cr.road;
    const posts = [
      { x: cr.x - 75, y: r.c + r.half + 16, dirY: -1 },
      { x: cr.x + 75, y: r.c - r.half - 16, dirY: 1 },
    ];
    for (const p of posts) {
      // barrier arm (foreshortened when raised)
      const L = (r.half + 4) * cr.barrier + 6;
      ctx.save(); ctx.translate(p.x, p.y);
      for (let i = 0; i < L; i += 10) { ctx.fillStyle = (i / 10) % 2 ? '#fff' : '#e53935'; ctx.fillRect(-3, p.dirY * i, 6, p.dirY * Math.min(10, L - i)); }
      ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      // flashing lights
      const on = cr.flashing && Math.floor(time * 2.5) % 2;
      for (const [dx, lit] of [[-7, on], [7, cr.flashing && !on]]) {
        ctx.fillStyle = lit ? '#ff2b2b' : '#4a1d1d';
        ctx.beginPath(); ctx.arc(dx, -p.dirY * 12, 4.5, 0, TAU); ctx.fill();
        if (lit) { ctx.fillStyle = 'rgba(255,40,40,0.35)'; ctx.beginPath(); ctx.arc(dx, -p.dirY * 12, 10, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }

  drawHUD(ctx) {
    const car = this.car, W = this.W, vw = this.vw, vh = this.vh;
    const small = vw < 700;
    const s = small ? 0.8 : 1;
    ctx.save();
    // speed panel
    const touch = document.body.classList.contains('touch');
    const px = 16, py = vh - (touch ? 270 : 120);
    ctx.translate(px, py); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(14,20,32,0.78)'; roundRect(ctx, 0, 0, 250, 104, 14); ctx.fill();
    const kmh = Math.round(toKmh(Math.abs(car.v)));
    const over = kmh > (this.limit || 50) + 4;
    ctx.fillStyle = over ? '#ff5252' : '#fff'; ctx.font = 'bold 50px "Segoe UI", Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(kmh, 112, 62);
    ctx.fillStyle = '#9fb0c8'; ctx.font = '14px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillText('km/h', 118, 62);
    if (car.reversing) { ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 16px Arial'; ctx.fillText('R', 20, 30); }
    drawSign(ctx, 'speed', this.limit || W.defaultLimit, 205, 46, 64);
    // indicators
    const blinkOn = Math.floor(W.time * 3.2) % 2 === 0;
    const arrow = (x, dir, on) => {
      ctx.save(); ctx.translate(x, 86); ctx.scale(dir, 1);
      ctx.fillStyle = on ? '#3be36a' : 'rgba(255,255,255,0.15)';
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, -9); ctx.lineTo(0, -4); ctx.lineTo(12, -4); ctx.lineTo(12, 4); ctx.lineTo(0, 4); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    arrow(40, 1, car.signal === 'left' && blinkOn);
    arrow(140, -1, car.signal === 'right' && blinkOn);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '11px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Q', 64, 90); ctx.fillText('E', 116, 90);
    ctx.restore();

    // upcoming signs & lights
    const dir = P(Math.cos(car.h), Math.sin(car.h));
    const ahead = [];
    for (const sg of W.signs) {
      if (sg.facing && Math.abs(angDiff(HEAD[sg.facing], car.h)) > 0.9) continue;
      const rx = sg.x - car.x, ry = sg.y - car.y;
      const f = rx * dir.x + ry * dir.y, lat = Math.abs(-rx * dir.y + ry * dir.x);
      if (f > -10 && f < 720 && lat < 150) ahead.push({ sg, f });
    }
    ahead.sort((a, b) => a.f - b.f);
    let light = null;
    for (const L of W.lights) {
      if (Math.abs(angDiff(HEAD[L.facing], car.h)) > 0.8) continue;
      const rx = L.x - car.x, ry = L.y - car.y;
      const f = rx * dir.x + ry * dir.y, lat = Math.abs(-rx * dir.y + ry * dir.x);
      if (f > -20 && f < 900 && lat < 130 && (!light || f < light.f)) light = { L, f };
    }
    const items = ahead.slice(0, 3);
    if (items.length || light) {
      const bw = small ? 210 : 270, ih = 58;
      const bx = vw - bw - 14, by = small ? 140 : 76;
      const n = items.length + (light ? 1 : 0);
      ctx.fillStyle = 'rgba(14,20,32,0.72)'; roundRect(ctx, bx, by, bw, n * ih + 28, 12); ctx.fill();
      ctx.fillStyle = '#9fb0c8'; ctx.font = '11px "Segoe UI", Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('AHEAD', bx + 12, by + 14);
      let y = by + 28;
      if (light) {
        drawTrafficLight(ctx, bx + 32, y + ih / 2 - 2, light.L.cycle.state(light.L.group), 1.2);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px "Segoe UI", Arial';
        const st = light.L.cycle.state(light.L.group);
        const names = { red: 'Red – stop', yellow: 'Yellow – stop if you can', green: 'Green – go if clear', redyellow: 'Red + yellow – wait' };
        ctx.fillText(names[st], bx + 62, y + ih / 2 - 7);
        ctx.fillStyle = '#9fb0c8'; ctx.font = '12px "Segoe UI", Arial';
        ctx.fillText(`Šviesoforas · ${Math.max(0, Math.round(light.f / PX))} m`, bx + 62, y + ih / 2 + 11);
        y += ih;
      }
      for (const it of items) {
        drawSign(ctx, it.sg.type, it.sg.value, bx + 32, y + ih / 2, it.sg.type === 'town' || it.sg.type === 'townEnd' ? 34 : 40);
        const lb = signLabel(it.sg);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Segoe UI", Arial';
        wrapText(ctx, lb.lt, bx + 62, y + ih / 2 - 8, bw - 72, 15, 2);
        ctx.fillStyle = '#9fb0c8'; ctx.font = '12px "Segoe UI", Arial';
        ctx.fillText(`${lb.en} · ${Math.max(0, Math.round(it.f / PX))} m`, bx + 62, y + ih / 2 + 14);
        y += ih;
      }
    }

    // toasts
    let ty = py - 34;
    for (const t of this.toasts) {
      const a = t.t < 0.2 ? t.t / 0.2 : t.t > 2.1 ? (2.6 - t.t) / 0.5 : 1;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = 'bold 18px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(t.text).width + 30;
      ctx.fillStyle = t.good ? 'rgba(30,150,80,0.9)' : 'rgba(200,60,40,0.9)';
      roundRect(ctx, vw / 2 - w / 2, ty - 18, w, 36, 18); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(t.text, vw / 2, ty);
      ty -= 44;
    }
    ctx.globalAlpha = 1;
  }
}

function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.split(' ');
  let line = '', lines = [];
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  lines = lines.slice(0, maxLines);
  const off = (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, y - off + i * lh));
}
