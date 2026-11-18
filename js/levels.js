'use strict';
// ---------------------------------------------------------------------------
// Levels – Lithuanian KET (Kelių eismo taisyklės). Difficulty increases.
// ---------------------------------------------------------------------------

function zebraSigns(W, z) {
  const r = z.road;
  if (r.axis === 'h') { W.roadSign(r, z.pos - 34, 'E', 'crosswalk'); W.roadSign(r, z.pos + 34, 'W', 'crosswalk'); }
  else { W.roadSign(r, z.pos + 34, 'N', 'crosswalk'); W.roadSign(r, z.pos - 34, 'S', 'crosswalk'); }
}
function straightTraffic(W, road, heading, o = {}) {
  const a = road.a - 40, b = road.b + 40;
  const pts = road.axis === 'h'
    ? (heading === 'E' ? [road.pt('E', a), road.pt('E', b)] : [road.pt('W', b), road.pt('W', a)])
    : (heading === 'S' ? [road.pt('S', a), road.pt('S', b)] : [road.pt('N', b), road.pt('N', a)]);
  return W.spawner({ pts, speed: o.speed || [40, 50], interval: o.interval || [4, 8], first: o.first || 0, gates: o.gates, tags: o.tags });
}
/** Signs, AI entry gates and the player's give-way rule for a roundabout. */
function setupRoundabout(W, rb, playerArm) {
  const sec = (a1, a2, r1 = rb.r1 - 2, r2 = rb.r2 + 4) => ({ cx: rb.cx, cy: rb.cy, r1, r2, a1, a2 });
  rb.gates = {};
  for (const [name, arm] of Object.entries(rb.arms)) {
    const th = arm.theta, aE = th - Math.asin((LW / 2) / rb.rc);
    const u = P(Math.cos(th), Math.sin(th)), vin = P(Math.cos(th - Math.PI / 2), Math.sin(th - Math.PI / 2));
    const R = rb.r2 + 26, off = arm.road.half + 18;
    // signs on the right of the entering traffic
    W.sign(rb.cx + u.x * (R + 70) + vin.x * off, rb.cy + u.y * (R + 70) + vin.y * off, 'roundabout', null, ARM_HEADING_IN[name]);
    W.sign(rb.cx + u.x * (R + 28) + vin.x * off, rb.cy + u.y * (R + 28) + vin.y * off, 'yield', null, ARM_HEADING_IN[name]);
    const gp = P(rb.cx + u.x * R + vin.x * LW / 2, rb.cy + u.y * R + vin.y * LW / 2);
    const watch = sec(aE - 0.25, aE + 1.3);
    rb.gates[name] = path => [gateAt(path, gp, (a, W2, G) => !vehicleIn(W2, G, watch, { exclude: a }), true)];
    if (name === playerArm) {
      W.yieldRule({ conflict: sec(aE - 0.45, aE + 0.25), watch: sec(aE + 0.25, aE + 1.1), key: 'yieldRb', minV: 2.2 * PX });
    }
  }
}

const LEVELS = [
  // ------------------------------------------------------------------ 1 --
  {
    title: 'First metres', lt: 'Pirmieji metrai',
    intro: 'Get to know your car. In Lithuania traffic drives on the <b>right</b> side of the road. Follow the blue route line, take the bend and park in the green zone.',
    learn: ['Keep to the right half of the road (dešinysis eismas).', 'Do not leave the carriageway.', 'Stop completely inside the parking zone.'],
    signs: [],
    objective: 'Drive along the road in the <b>right lane</b>. ↑ accelerate · ↓ brake · ← → steer',
    warmup: 6,
    build(W) {
      const A = W.hroad(0, -300, 1600);
      const B = W.vroad(1600, -1400, 0);
      W.start(60, A.lane('E'), 'E');
      W.setRoute([P(60, A.lane('E')), P(B.lane('N'), A.lane('E')), P(B.lane('N'), -1080)], 90);
      W.goalAt(P(B.lane('N'), -1020), 'N');
      W.hint(rect(1150, -50, 1200, 50), 'The road bends to the <b>left</b> – slow down and steer smoothly.');
      W.hint(rect(1550, -500, 1700, -460), 'Stop inside the green <b>P</b> zone (hold ↓ to brake).');
      W.spawner({ pts: smoothPolyline([P(B.lane('S'), -1400), P(B.lane('S'), A.lane('W')), P(-300, A.lane('W'))], 70), speed: [35, 45], interval: [5, 9], first: 0 });
    },
  },
  // ------------------------------------------------------------------ 2 --
  {
    title: 'Speed limits', lt: 'Greičio ribojimas',
    intro: 'Outside built-up areas a car may drive up to <b>90 km/h</b> on a paved road. The white town sign marks the start of a built-up area – the limit drops to <b>50 km/h</b>. Near the school a <b>30 km/h</b> sign applies until its end sign.',
    learn: ['Outside built-up areas: 90 km/h (cars, paved road).', 'Built-up area (gyvenvietė): 50 km/h.', 'Sign "Didžiausias leistinas greitis" applies until "Greičio ribojimo pabaiga".', 'Slow down BEFORE you reach the sign.'],
    signs: [['town', 'Trakai'], ['children'], ['speed', 30], ['speedEnd', 30]],
    objective: 'Drive to the town and park. Watch the speed limit (bottom-left).',
    world: { limit: 90, town: rect(1300, -900, 5000, 900) },
    warmup: 6,
    build(W) {
      const A = W.hroad(0, -300, 4400, { sidewalk: false });
      W.start(0, A.lane('E'), 'E');
      W.roadSign(A, 1300, 'E', 'town', 'Trakai');
      W.roadSign(A, 1300, 'W', 'townEnd', 'Trakai');
      W.speedZone(rect(1300, -200, 4600, 200), 50);
      W.roadSign(A, 2280, 'E', 'children');
      W.roadSign(A, 2420, 'E', 'speed', 30);
      W.speedZone(rect(2420, -200, 3300, 200), 30);
      W.roadSign(A, 3300, 'E', 'speedEnd', 30);
      W.setRoute([P(0, A.lane('E')), P(4200, A.lane('E'))]);
      W.goalAt(P(3950, A.lane('E')), 'E');
      W.hint(rect(600, -50, 640, 50), 'Built-up area ahead – be at <b>50 km/h</b> when you pass the town sign.');
      W.hint(rect(1900, -50, 1940, 50), 'School zone ahead – reduce speed to <b>30 km/h</b>.');
      W.hint(rect(3320, -50, 3360, 50), 'End of the 30 zone – 50 km/h again. Park in the <b>P</b> zone.');
      straightTraffic(W, A, 'W', { speed: [45, 50], interval: [5, 9] });
    },
  },
  // ------------------------------------------------------------------ 3 --
  {
    title: 'Turn signals', lt: 'Posūkio signalai',
    intro: 'Before every turn you must switch on the <b>turn indicator in advance</b>. Press <b>Q</b> for left and <b>E</b> for right. The indicator cancels itself after the turn. Never signal when you go straight.',
    learn: ['Signal well before the junction (≥ 0.5 s before entering).', 'Turn right from the right edge, left into the far lane.', 'No indicator when going straight – it would mislead others.'],
    signs: [],
    objective: 'Turn <b>RIGHT</b> at the junction – switch on the right indicator (<b>E</b>) first.',
    warmup: 4,
    build(W) {
      const A = W.hroad(0, -300, 1500);
      const V1 = W.vroad(1000, -700, 700);
      const B = W.hroad(700, 300, 2500);
      const V2 = W.vroad(1700, 200, 1200);
      W.start(0, A.lane('E'), 'E');
      W.setRoute([P(0, A.lane('E')), P(V1.lane('S'), A.lane('E')), P(V1.lane('S'), B.lane('E')), P(2300, B.lane('E'))]);
      W.goalAt(P(2200, B.lane('E')), 'E');
      W.hint(rect(V1.c - 60, 200, V1.c + 60, 240), 'Next: turn <b>LEFT</b> – switch on the left indicator (<b>Q</b>).');
      W.hint(rect(1150, 650, 1190, 760), 'Go <b>straight</b> through the next junction – no indicator. Then park.');
      straightTraffic(W, A, 'W', { interval: [6, 10] });
    },
  },
  // ------------------------------------------------------------------ 4 --
  {
    title: 'Pedestrian crossings', lt: 'Pėsčiųjų perėjos',
    intro: 'At an unregulated pedestrian crossing (<b>zebra</b>) pedestrians who are crossing or stepping onto the crossing have priority. Slow down, stop before the crossing and let them pass completely.',
    learn: ['Approach crossings at a speed that lets you stop.', 'Give way to pedestrians on or stepping onto the crossing.', 'Wait until the crossing is clear before driving on.'],
    signs: [['crosswalk']],
    objective: 'Drive through town and park. Watch out for pedestrians!',
    warmup: 5,
    build(W) {
      const A = W.hroad(0, -300, 3100);
      W.start(0, A.lane('E'), 'E');
      const z1 = W.zebra(A, 800), z2 = W.zebra(A, 1600), z3 = W.zebra(A, 2400);
      [z1, z2, z3].forEach(z => zebraSigns(W, z));
      W.trigger(rect(220, -50, 260, 50), () => pedCross(W, z1, -1, { walkIn: 8 }));
      W.trigger(rect(1080, -50, 1120, 50), () => { pedCross(W, z2, 1, { walkIn: 8, offset: -10 }); pedCross(W, z2, 1, { walkIn: 34, offset: 10 }); });
      W.trigger(rect(1900, -50, 1940, 50), () => { pedCross(W, z3, -1, { walkIn: 6, offset: 4, speed: 3.8 }); });
      W.setRoute([P(0, A.lane('E')), P(3000, A.lane('E'))]);
      W.goalAt(P(2850, A.lane('E')), 'E');
      straightTraffic(W, A, 'W', { speed: [35, 45], interval: [6, 10] });
    },
  },
  // ------------------------------------------------------------------ 5 --
  {
    title: 'Traffic lights', lt: 'Šviesoforai',
    intro: 'Traffic lights in Lithuania go <b>red → red + yellow → green → yellow → red</b>. Red and red + yellow mean stop. On yellow you must stop if you can do it safely. Stop at the stop line.',
    learn: ['Red / red + yellow: do not pass the stop line.', 'Yellow: stop unless you are too close to stop safely.', 'Green: go – but only if the junction is clear.'],
    signs: [['lights']],
    objective: 'Go <b>straight</b> through the first junction, then turn <b>right</b> at the second one.',
    warmup: 8,
    build(W) {
      const A = W.hroad(0, -300, 2300);
      const V1 = W.vroad(800, -900, 900);
      const V2 = W.vroad(1700, -900, 1100);
      const j1 = W.jn(800, 0), j2 = W.jn(1700, 0);
      const c1 = W.cycle(twoPhase(9, 9, 15)), c2 = W.cycle(twoPhase(10, 8, 25));
      const L1 = {}, L2 = {};
      for (const arm of ['w', 'e']) { L1[arm] = W.light(j1, arm, c1, 'A'); L2[arm] = W.light(j2, arm, c2, 'A'); }
      for (const arm of ['n', 's']) { L1[arm] = W.light(j1, arm, c1, 'B'); L2[arm] = W.light(j2, arm, c2, 'B'); }
      W.junctionSign(j1, 'w', 'lights', null, 300);
      W.start(0, A.lane('E'), 'E');
      W.setRoute([P(0, A.lane('E')), P(V2.lane('S'), A.lane('E')), P(V2.lane('S'), 1000)]);
      W.goalAt(P(V2.lane('S'), 800), 'S');
      // cross traffic
      for (const [V, L, c] of [[V1, L1, c1], [V2, L2, c2]]) {
        straightTraffic(W, V, 'S', { interval: [2.5, 5], gates: p => [lightGate(p, L.n, c, 'B')] });
        straightTraffic(W, V, 'N', { interval: [2.5, 5], gates: p => [lightGate(p, L.s, c, 'B')] });
      }
      straightTraffic(W, A, 'W', { interval: [4, 7], gates: p => [lightGate(p, L2.e, c2, 'A'), lightGate(p, L1.e, c1, 'A')] });
      W.hint(rect(1100, -50, 1140, 50), 'Turn <b>right</b> at the next lights – indicator <b>E</b>.');
    },
  },
  // ------------------------------------------------------------------ 6 --
  {
    title: 'STOP sign', lt: 'Ženklas STOP',
    intro: 'The octagonal <b>STOP</b> sign means: <b>stop completely</b> at the stop line – even if the road is empty – and give way to all vehicles on the road you are entering. Then turn right onto the main road when there is a safe gap.',
    learn: ['Come to a full stop (0 km/h) at the stop line.', 'Give way to traffic on the main road.', 'Signal right before turning.'],
    signs: [['stop'], ['main']],
    objective: 'Stop at the <b>STOP</b> line, then turn <b>right</b> onto the main road when it is safe.',
    warmup: 8,
    build(W) {
      const M = W.hroad(0, -1500, 1900);
      const S = W.vroad(0, 0, 900);
      const j = W.jn(0, 0);
      W.stopSign(j, 's');
      W.roadSign(M, -200, 'E', 'main'); W.roadSign(M, 200, 'W', 'main');
      W.start(S.lane('N'), 840, 'N');
      W.setRoute([P(S.lane('N'), 860), P(S.lane('N'), M.lane('E')), P(1600, M.lane('E'))]);
      W.goalAt(P(1450, M.lane('E')), 'E');
      W.yieldRule({ conflict: rect(-42, 0, 150, 42), watch: rect(-560, 0, -42, 42), key: 'yieldMain' });
      straightTraffic(W, M, 'E', { interval: [3.5, 8], speed: [45, 50] });
      straightTraffic(W, M, 'W', { interval: [3.5, 8], speed: [45, 50] });
      W.hint(rect(1, 300, 60, 340), 'Full stop at the line, look <b>left</b> for cars, signal <b>right</b> (E).');
      W.hint(rect(300, -10, 340, 60), 'Well done – continue and park in the <b>P</b> zone.');
    },
  },
  // ------------------------------------------------------------------ 7 --
  {
    title: 'Give way & main road', lt: 'Duoti kelią ir pagrindinis kelias',
    intro: 'The <b>inverted triangle</b> "Duoti kelią" means you must give way to traffic on the road you are entering – from both directions when you turn left. You do not have to stop if the road is clear. Once you are on the <b>main road</b> (yellow diamond), vehicles from side roads must give way to <b>you</b>.',
    learn: ['"Duoti kelią": give way to vehicles on the crossed road.', 'Turning left across both directions: check left AND right.', '"Pagrindinis kelias": you have priority at the next junctions.'],
    signs: [['yield'], ['main']],
    objective: 'Turn <b>LEFT</b> onto the main road – give way to cars from both sides.',
    warmup: 8,
    build(W) {
      const M = W.hroad(0, -2300, 1000);
      const S = W.vroad(0, 0, 900);
      const N2 = W.vroad(-1100, -900, 0);
      const j1 = W.jn(0, 0), j2 = W.jn(-1100, 0);
      W.yieldSign(j1, 's');
      const y2 = W.yieldSign(j2, 'n');
      W.roadSign(M, -250, 'W', 'main'); W.roadSign(M, -1500, 'W', 'main');
      W.roadSign(M, -800, 'E', 'main'); W.roadSign(M, 250, 'E', 'main');
      W.start(S.lane('N'), 840, 'N');
      W.setRoute([P(S.lane('N'), 860), P(S.lane('N'), M.lane('W')), P(-2100, M.lane('W'))]);
      W.goalAt(P(-1950, M.lane('W')), 'W');
      W.yieldRule({ conflict: rect(-150, -42, 150, 42), watch: [rect(-540, 0, -42, 42), rect(42, -42, 540, 0)], key: 'yieldMain' });
      const busy = (W2, G, a) => vehicleIn(W2, G, [W2.approachRect(j2, 'e', 560), W2.approachRect(j2, 'w', 560), j2.box], { exclude: a, minV: 0.4 * PX });
      const sideGate = p => [gateAt(p, y2.mid, (a, W2, G) => !busy(W2, G, a) || (a.waitT > 6 && G && Math.abs(G.car.v) < 0.5), true)];
      straightTraffic(W, M, 'E', { interval: [5, 11] });
      straightTraffic(W, M, 'W', { interval: [5, 11], first: 3 });
      W.trigger(rect(-260, -60, -220, 0), g => {
        g.setObjective('You are on the <b>main road</b> now – cars from the side road must give way to you. Keep going.');
        W.agent('car', W.jpath(j2, 'n', 'e', { inLen: 560, outLen: 1300 }), { speed: 35, gates: sideGate, color: '#2f6fdf' });
      });
      W.hint(rect(-1500, -60, -1460, 0), 'Park in the <b>P</b> zone.');
    },
  },
  // ------------------------------------------------------------------ 8 --
  {
    title: 'Equal junction', lt: 'Lygiareikšmių kelių sankryža',
    intro: 'At a junction without signs or lights all roads are equal. The <b>right-hand rule</b> applies: give way to vehicles approaching from your <b>right</b>. Vehicles coming from your left must give way to you.',
    learn: ['Equal roads: give way to vehicles from the RIGHT.', 'Vehicles from the left give way to you – go when it is your turn.', 'Slow down before every unregulated junction and look both ways.'],
    signs: [['equal']],
    objective: 'Drive <b>straight</b> through both junctions and park. Apply the right-hand rule.',
    warmup: 3,
    build(W) {
      const V = W.vroad(0, -1800, 1000);
      const H1 = W.hroad(0, -1000, 1000), H2 = W.hroad(-800, -1000, 1000);
      const j1 = W.jn(0, 0), j2 = W.jn(0, -800);
      W.junctionSign(j1, 's', 'equal', null, 200);
      W.junctionSign(j2, 's', 'equal', null, 200);
      W.start(V.lane('N'), 900, 'N');
      W.setRoute([P(V.lane('N'), 940), P(V.lane('N'), -1650)]);
      W.goalAt(P(V.lane('N'), -1500), 'N');
      W.yieldRule({ conflict: j1.box, watch: W.approachRect(j1, 'e', 380), key: 'yieldRight', tags: ['prio'] });
      W.trigger(rect(0, 690, 60, 720), () => {
        W.agent('car', [H1.pt('W', 1000), H1.pt('W', -1000)], { speed: 40, tags: ['prio'], color: '#f2a33a' });
      });
      W.trigger(rect(0, -120, 60, -90), g => {
        g.setObjective('A car comes from the <b>left</b> – it must give way to you. Go when safe.');
        const gp = W.approach(j2, 'w', 6);
        W.agent('car', [H2.pt('E', -1000), H2.pt('E', 1000)], {
          speed: 40, color: '#1f8a70',
          gates: p => [gateAt(p, P((gp.a.x + gp.b.x) / 2, (gp.a.y + gp.b.y) / 2), (a, W2, G) =>
            !G || G.car.y < j2.box.y - 20 || (a.waitT > 4 && Math.abs(G.car.v) < 0.5 * PX && !vehicleIn(W2, G, j2.box, { exclude: a })), true)],
        });
      });
      W.hint(rect(0, 500, 60, 530), 'Car approaching from the <b>right</b>! Who goes first?');
    },
  },
  // ------------------------------------------------------------------ 9 --
  {
    title: 'Turning left', lt: 'Posūkis į kairę',
    intro: 'When turning <b>left</b> – even on a green light – you must give way to <b>oncoming</b> vehicles going straight or turning right. Move into the junction, wait before the oncoming lane and turn when there is a gap (or when oncoming traffic stops for red).',
    learn: ['Signal left (Q) before the junction.', 'Give way to oncoming traffic going straight or right.', 'You may wait inside the junction and finish the turn when it is clear.'],
    signs: [['lights']],
    objective: 'Turn <b>LEFT</b> at the lights. Give way to oncoming traffic.',
    warmup: 6,
    build(W) {
      const V = W.vroad(0, -1300, 1000);
      const H = W.hroad(0, -1500, 1100);
      const j = W.jn(0, 0);
      const c = W.cycle(twoPhase(24, 8, 0));
      const L = {};
      for (const arm of ['n', 's']) L[arm] = W.light(j, arm, c, 'A');
      for (const arm of ['e', 'w']) L[arm] = W.light(j, arm, c, 'B');
      W.start(V.lane('N'), 900, 'N');
      W.setRoute([P(V.lane('N'), 940), P(V.lane('N'), H.lane('W')), P(-1300, H.lane('W'))]);
      W.goalAt(P(-1100, H.lane('W')), 'W');
      W.yieldRule({ conflict: rect(-42, -42, 0, 42), watch: W.approachRect(j, 'n', 400), key: 'yieldOncoming' });
      const nGate = p => [lightGate(p, L.n, c, 'A')];
      W.spawner({ pts: [V.pt('S', -1300), V.pt('S', 1000)], speed: [45, 50], interval: [2.2, 4.5], gates: nGate });
      W.spawner({ pts: W.jpath(j, 'n', 'w', { inLen: 1250, outLen: 1500 }), speed: 40, interval: [9, 14], first: 5, gates: nGate });
      straightTraffic(W, H, 'E', { interval: [3, 6], gates: p => [lightGate(p, L.w, c, 'B')] });
      straightTraffic(W, H, 'W', { interval: [3, 6], gates: p => [lightGate(p, L.e, c, 'B')] });
      W.hint(rect(0, 380, 60, 420), 'Signal <b>left</b> (Q), enter the junction and wait for a gap in oncoming traffic.');
    },
  },
  // ----------------------------------------------------------------- 10 --
  {
    title: 'Level crossings', lt: 'Geležinkelio pervažos',
    intro: 'Trains always have priority. When the <b>red lights flash</b> or the barrier is moving you must stop at the stop line (at least 10 m before the nearest rail) and wait. At an unguarded crossing with a <b>STOP</b> sign you must always stop and look before crossing.',
    learn: ['Flashing red lights / barrier: stop and wait.', 'Unguarded crossing + STOP: full stop, look both ways.', 'Never stop on the rails.'],
    signs: [['railBarrier'], ['railNoBarrier'], ['railX'], ['stop']],
    objective: 'Drive across two level crossings and park on the other side.',
    world: { limit: 90, town: false },
    warmup: 0,
    build(W) {
      const A = W.hroad(0, -300, 3900, { sidewalk: false });
      W.railway(1300, -2700, 2700, { guarded: true });
      W.railway(2700, -2700, 2700, { guarded: false });
      W.start(0, A.lane('E'), 'E');
      W.roadSign(A, 850, 'E', 'railBarrier'); W.roadSign(A, 1750, 'W', 'railBarrier');
      W.roadSign(A, 2250, 'E', 'railNoBarrier'); W.roadSign(A, 3150, 'W', 'railNoBarrier');
      W.roadSign(A, 2700 - 129 - 14, 'E', 'stop');
      W.roadSign(A, 2700 - 50, 'E', 'railX');
      W.roadSign(A, 2700 + 129 + 14, 'W', 'stop');
      W.roadSign(A, 2700 + 50, 'W', 'railX');
      W.lineAcross(A, 2700 - 9 - 120, 'E', { requireStop: true, why: 'stopRail' });
      W.lineAcross(A, 2700 + 9 + 120, 'W', { requireStop: true, why: 'stopRail' });
      W.speedZone(rect(950, -200, 1450, 200), 50);
      W.roadSign(A, 950, 'E', 'speed', 50);
      W.roadSign(A, 1450, 'E', 'speedEnd', 50);
      W.setRoute([P(0, A.lane('E')), P(3800, A.lane('E'))]);
      W.goalAt(P(3550, A.lane('E')), 'E');
      W.trigger(rect(330, -50, 370, 50), g => {
        W.agent('train', [P(1300, -2700), P(1300, 2700)], { speed: 90 });
        g.setObjective('The crossing lights are flashing – <b>stop</b> at the stop line and wait for the train.');
      });
      W.trigger(rect(1500, -50, 1540, 50), g => {
        W.agent('train', [P(2700, 1500), P(2700, -2700)], { speed: 55 });
        g.setObjective('Unguarded crossing: <b>full stop</b> at the STOP line and look for trains.');
      });
    },
  },
  // ----------------------------------------------------------------- 11 --
  {
    title: 'Roundabout', lt: 'Žiedinė sankryža',
    intro: 'Drive around a roundabout <b>anti-clockwise</b>, keeping the island on your left. At the give-way line let vehicles <b>already in the roundabout</b> pass (they come from your left). Before you leave, switch on the <b>right indicator</b>.',
    learn: ['Give way to vehicles already circulating.', 'Drive anti-clockwise around the island.', 'Signal RIGHT (E) before your exit.'],
    signs: [['roundabout'], ['yield']],
    objective: 'Enter the roundabout and take the <b>3rd exit</b> (to the left / west).',
    warmup: 10,
    build(W) {
      const rb = W.roundabout(0, 0, { n: 1200, e: 1200, s: 1100, w: 1400 });
      setupRoundabout(W, rb, 's');
      W.start(LW / 2, 1000, 'N');
      W.route = W.rbPath(rb, 's', 'w', 1040, 1300);
      W.goalAt(P(-1050, -LW / 2), 'W');
      const arms = ['n', 'e', 'w'];
      for (const from of arms) {
        W.spawner({
          make: () => { const tos = ['n', 'e', 's', 'w'].filter(t => t !== from); return W.rbPath(rb, from, tos[Math.floor(Math.random() * tos.length)], 1150, 1300); },
          speed: [40, 48], interval: [3.5, 7], first: rnd(0, 3), gates: rb.gates[from],
        });
      }
      W.hint(rect(-80, -210, 80, -150), 'Your exit is next – switch on the <b>right indicator</b> (E) now.');
      W.hint(rect(-600, -60, -560, 0), 'Park in the <b>P</b> zone.');
    },
  },
  // ----------------------------------------------------------------- 12 --
  {
    title: 'Final exam', lt: 'Baigiamasis egzaminas',
    intro: 'A full route through town – just like the practical driving test (praktinis egzaminas). School zone, pedestrian crossing, traffic lights with a left turn, a STOP sign and a roundabout. One mistake and you fail!',
    learn: ['Everything you have learned so far.', 'Plan ahead: read the signs in the "Ahead" panel.', 'Smooth, calm and correct beats fast.'],
    signs: [['children'], ['speed', 30], ['crosswalk'], ['lights'], ['stop'], ['roundabout']],
    objective: 'Follow the route. School zone first – <b>30 km/h</b>.',
    warmup: 10,
    build(W) {
      const A = W.hroad(0, -300, 2400);
      const V = W.vroad(1500, -1400, 800);
      const rb = W.roundabout(2700, -1400, { n: 900, e: 1300, s: 900, w: 2900 });
      const M = rb.arms.w.road;
      const j1 = W.jn(1500, 0), jT = W.jn(1500, -1400);
      // school zone & zebra
      W.roadSign(A, 300, 'E', 'children'); W.roadSign(A, 380, 'E', 'speed', 30);
      W.roadSign(A, 1000, 'E', 'speedEnd', 30);
      W.speedZone(rect(380, -100, 1000, 100), 30);
      const z = W.zebra(A, 700); zebraSigns(W, z);
      W.trigger(rect(180, -50, 220, 50), () => pedCross(W, z, -1, { walkIn: 30 }));
      // lights at j1
      const c = W.cycle(twoPhase(16, 10, 2));
      const L = {};
      for (const arm of ['w', 'e']) L[arm] = W.light(j1, arm, c, 'A');
      for (const arm of ['n', 's']) L[arm] = W.light(j1, arm, c, 'B');
      W.junctionSign(j1, 'w', 'lights', null, 260);
      W.yieldRule({ conflict: rect(1440, -42, 1545, 0), watch: W.approachRect(j1, 'e', 400), key: 'yieldOncoming' });
      W.spawner({ pts: [A.pt('W', 2440), A.pt('W', -340)], speed: [40, 50], interval: [3, 6.5], gates: p => [lightGate(p, L.e, c, 'A')] });
      W.spawner({ pts: W.jpath(j1, 's', 'e', { inLen: 760, outLen: 900 }), speed: 40, interval: [3, 6], gates: p => [lightGate(p, L.s, c, 'B')] });
      // STOP at the T junction
      W.stopSign(jT, 's');
      W.roadSign(M, 1300, 'E', 'main'); W.roadSign(M, 1700, 'W', 'main');
      W.yieldRule({ conflict: rect(1458, -1400, 1650, -1358), watch: W.approachRect(jT, 'w', 520), key: 'yieldMain' });
      // roundabout
      setupRoundabout(W, rb, 'w');
      W.spawner({ make: () => W.rbPath(rb, 'w', ['n', 's', 'e'][Math.floor(Math.random() * 3)], 2900, 900), speed: [45, 50], interval: [5, 10], gates: rb.gates.w });
      for (const from of ['n', 'e', 's']) {
        W.spawner({
          make: () => { const tos = ['n', 'e', 's', 'w'].filter(t => t !== from); return W.rbPath(rb, from, tos[Math.floor(Math.random() * tos.length)], from === 'e' ? 1250 : 880, 2900); },
          speed: [40, 48], interval: [6, 11], first: rnd(0, 3), gates: rb.gates[from],
        });
      }
      // player
      W.start(0, A.lane('E'), 'E');
      W.route = smoothPolyline([P(0, A.lane('E')), P(V.lane('N'), A.lane('E')), P(V.lane('N'), M.lane('E')), P(2300, M.lane('E'))], 80, 14)
        .concat(W.rbPath(rb, 'w', 'e', 400, 1250).slice(1));
      W.goalAt(P(3750, -1400 + LW / 2), 'E');
      W.hint(rect(1000, -50, 1040, 50), 'Traffic lights: turn <b>LEFT</b> – signal Q and give way to oncoming cars.');
      W.hint(rect(1500, -500, 1560, -460), 'STOP sign ahead: full stop, then turn <b>RIGHT</b>.');
      W.hint(rect(2000, -1400, 2040, -1340), 'Roundabout: give way, take the <b>2nd exit</b> (straight on), signal right before leaving.');
      W.hint(rect(3150, -1400, 3190, -1340), 'Almost there – park in the <b>P</b> zone.');
    },
  },
];
