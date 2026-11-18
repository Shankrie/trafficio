'use strict';
// ---------------------------------------------------------------------------
// Lithuanian road signs (KET) – canvas drawings and descriptions.
// ---------------------------------------------------------------------------

const SIGN_INFO = {
  stop:       { lt: 'STOP – Sustoti ir duoti kelią', en: 'Stop and give way' },
  yield:      { lt: 'Duoti kelią', en: 'Give way' },
  main:       { lt: 'Pagrindinis kelias', en: 'Priority road' },
  speed:      { lt: 'Didžiausias leistinas greitis', en: 'Speed limit' },
  speedEnd:   { lt: 'Greičio ribojimo pabaiga', en: 'End of speed limit' },
  town:       { lt: 'Gyvenvietės pradžia', en: 'Built-up area – 50 km/h' },
  townEnd:    { lt: 'Gyvenvietės pabaiga', en: 'End of built-up area' },
  crosswalk:  { lt: 'Pėsčiųjų perėja', en: 'Pedestrian crossing' },
  roundabout: { lt: 'Žiedinė sankryža', en: 'Roundabout' },
  children:   { lt: 'Vaikai', en: 'Children' },
  equal:      { lt: 'Lygiareikšmių kelių sankryža', en: 'Junction of equal roads' },
  railBarrier:{ lt: 'Pervaža su užtvaru', en: 'Level crossing with barrier' },
  railNoBarrier:{ lt: 'Pervaža be užtvaro', en: 'Level crossing without barrier' },
  railX:      { lt: 'Vienkelė geležinkelio pervaža', en: 'Single-track level crossing' },
  lights:     { lt: 'Šviesoforinis reguliavimas', en: 'Traffic lights ahead' },
  noEntry:    { lt: 'Įvažiuoti draudžiama', en: 'No entry' },
};

function signLabel(s) {
  const i = SIGN_INFO[s.type] || { lt: s.type, en: '' };
  if (s.type === 'speed') return { lt: `${i.lt} ${s.value} km/h`, en: `${i.en} ${s.value} km/h` };
  if (s.type === 'town') return { lt: `${i.lt}: ${s.value}`, en: i.en };
  return i;
}

function triangle(ctx, r, up = true) {
  ctx.beginPath();
  if (up) { ctx.moveTo(0, -r); ctx.lineTo(r * 0.94, r * 0.66); ctx.lineTo(-r * 0.94, r * 0.66); }
  else { ctx.moveTo(0, r); ctx.lineTo(r * 0.94, -r * 0.66); ctx.lineTo(-r * 0.94, -r * 0.66); }
  ctx.closePath();
}

/** Draw sign centred at (x,y) with size = overall diameter in px. */
function drawSign(ctx, type, value, x, y, size) {
  const r = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  const RED = '#d32f2f', BLUE = '#1565c0';
  const warn = (inner) => {
    triangle(ctx, r); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = r * 0.17; ctx.strokeStyle = RED; ctx.stroke();
    ctx.save(); ctx.translate(0, r * 0.12); inner(); ctx.restore();
  };
  switch (type) {
    case 'stop': {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = RED; ctx.fill();
      ctx.lineWidth = r * 0.08; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${r * 0.62}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('STOP', 0, r * 0.04);
      break;
    }
    case 'yield': {
      triangle(ctx, r, false); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = r * 0.2; ctx.strokeStyle = RED; ctx.stroke();
      break;
    }
    case 'main': case 'mainEnd': {
      ctx.rotate(Math.PI / 4);
      const s = r * 1.32;
      ctx.fillStyle = '#fff'; ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = '#f9c800'; ctx.fillRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64);
      if (type === 'mainEnd') { ctx.rotate(-Math.PI / 4); ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.12; ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.7); ctx.lineTo(r * 0.7, -r * 0.7); ctx.stroke(); }
      break;
    }
    case 'speed': case 'speedEnd': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
      if (type === 'speed') { ctx.lineWidth = r * 0.2; ctx.strokeStyle = RED; ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, TAU); ctx.stroke(); }
      else { ctx.lineWidth = 1; ctx.strokeStyle = '#555'; ctx.stroke(); }
      ctx.fillStyle = type === 'speed' ? '#111' : '#777';
      ctx.font = `bold ${r * (String(value).length > 2 ? 0.72 : 0.9)}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, 0, r * 0.06);
      if (type === 'speedEnd') {
        ctx.strokeStyle = '#222'; ctx.lineWidth = r * 0.1;
        for (const o of [-0.2, 0, 0.2]) { ctx.beginPath(); ctx.moveTo(-r * 0.65 + o * r, r * 0.65 + o * r); ctx.lineTo(r * 0.65 + o * r, -r * 0.65 + o * r); ctx.stroke(); }
      }
      break;
    }
    case 'town': case 'townEnd': {
      const w = r * 2.4, h = r * 1.1;
      ctx.fillStyle = '#fff'; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.08; ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);
      ctx.fillStyle = '#111'; ctx.font = `bold ${r * 0.42}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value || '').toUpperCase(), 0, 1);
      if (type === 'townEnd') { ctx.strokeStyle = RED; ctx.lineWidth = r * 0.13; ctx.beginPath(); ctx.moveTo(-w / 2 + 4, h / 2 - 4); ctx.lineTo(w / 2 - 4, -h / 2 + 4); ctx.stroke(); }
      break;
    }
    case 'crosswalk': {
      ctx.fillStyle = BLUE; roundRect(ctx, -r, -r, 2 * r, 2 * r, r * 0.15); ctx.fill();
      ctx.fillStyle = '#fff'; triangle(ctx, r * 0.82); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(0, -r * 0.28, r * 0.1, 0, TAU); ctx.fill();
      ctx.lineWidth = r * 0.09; ctx.strokeStyle = '#111'; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -r * 0.15); ctx.lineTo(0, r * 0.15); ctx.moveTo(0, r * 0.15); ctx.lineTo(-r * 0.15, r * 0.42);
      ctx.moveTo(0, r * 0.15); ctx.lineTo(r * 0.17, r * 0.42); ctx.moveTo(-r * 0.17, -r * 0.02); ctx.lineTo(r * 0.17, -r * 0.08); ctx.stroke();
      ctx.fillRect(-r * 0.6, r * 0.48, r * 1.2, r * 0.06);
      break;
    }
    case 'roundabout': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = BLUE; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = r * 0.14;
      for (let i = 0; i < 3; i++) {
        const a0 = i * TAU / 3;
        // counter-clockwise arrows (right-hand traffic)
        ctx.beginPath(); ctx.arc(0, 0, r * 0.52, a0 - 0.15, a0 - 1.55, true); ctx.stroke();
        const ah = a0 - 1.75;
        const tx = Math.cos(ah) * r * 0.52, ty = Math.sin(ah) * r * 0.52;
        ctx.beginPath();
        ctx.moveTo(tx + Math.cos(ah - Math.PI / 2) * r * 0.22, ty + Math.sin(ah - Math.PI / 2) * r * 0.22);
        ctx.lineTo(tx + Math.cos(ah) * r * 0.2, ty + Math.sin(ah) * r * 0.2);
        ctx.lineTo(tx - Math.cos(ah) * r * 0.2, ty - Math.sin(ah) * r * 0.2);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'noEntry': {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = RED; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.68, -r * 0.16, r * 1.36, r * 0.32);
      break;
    }
    case 'children': warn(() => {
      ctx.fillStyle = '#111';
      for (const [dx, s] of [[-0.22, 1], [0.2, 0.8]]) {
        ctx.beginPath(); ctx.arc(dx * r, -r * 0.2 * s, r * 0.09 * s, 0, TAU); ctx.fill();
        ctx.fillRect(dx * r - r * 0.07 * s, -r * 0.1 * s, r * 0.14 * s, r * 0.3 * s);
        ctx.fillRect(dx * r - r * 0.08 * s, r * 0.2 * s, r * 0.06, r * 0.18 * s);
        ctx.fillRect(dx * r + r * 0.02 * s, r * 0.2 * s, r * 0.06, r * 0.18 * s);
      }
    }); break;
    case 'equal': warn(() => {
      ctx.strokeStyle = '#111'; ctx.lineWidth = r * 0.16; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-r * 0.3, -r * 0.3); ctx.lineTo(r * 0.3, r * 0.3); ctx.moveTo(r * 0.3, -r * 0.3); ctx.lineTo(-r * 0.3, r * 0.3); ctx.stroke();
    }); break;
    case 'lights': warn(() => {
      ctx.fillStyle = '#111'; roundRect(ctx, -r * 0.14, -r * 0.4, r * 0.28, r * 0.72, 3); ctx.fill();
      [['#e53935', -0.28], ['#fdd835', -0.04], ['#43a047', 0.2]].forEach(([c, y]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, y * r, r * 0.08, 0, TAU); ctx.fill(); });
    }); break;
    case 'railBarrier': warn(() => {
      ctx.fillStyle = '#111';
      ctx.fillRect(-r * 0.4, -r * 0.2, r * 0.8, r * 0.1); ctx.fillRect(-r * 0.4, r * 0.05, r * 0.8, r * 0.1);
      for (const x of [-0.3, 0, 0.3]) ctx.fillRect(x * r - r * 0.04, -r * 0.3, r * 0.08, r * 0.55);
    }); break;
    case 'railNoBarrier': warn(() => {
      ctx.fillStyle = '#111';
      ctx.fillRect(-r * 0.42, -r * 0.05, r * 0.7, r * 0.26); ctx.fillRect(-r * 0.05, -r * 0.3, r * 0.3, r * 0.28);
      ctx.fillRect(-r * 0.36, -r * 0.24, r * 0.1, r * 0.2);
      ctx.beginPath(); ctx.arc(-r * 0.25, r * 0.28, r * 0.08, 0, TAU); ctx.arc(r * 0.12, r * 0.28, r * 0.08, 0, TAU); ctx.fill();
    }); break;
    case 'railX': {
      ctx.rotate(Math.PI / 4);
      for (let i = 0; i < 2; i++) {
        ctx.rotate(Math.PI / 2 * i);
        ctx.fillStyle = '#fff'; ctx.fillRect(-r * 1.05, -r * 0.2, r * 2.1, r * 0.4);
        ctx.strokeStyle = RED; ctx.lineWidth = r * 0.1; ctx.strokeRect(-r * 1.05, -r * 0.2, r * 2.1, r * 0.4);
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(-r * 0.15, -r * 0.15, r * 0.3, r * 0.3);
      break;
    }
    default: {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#888'; ctx.fill();
    }
  }
  ctx.restore();
}

function drawWorldSign(ctx, s) {
  // little pole + shadow, sign drawn upright for readability
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(s.x + 4, s.y + 5, 15, 7, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#777'; ctx.fillRect(s.x - 1.5, s.y, 3, 10);
  drawSign(ctx, s.type, s.value, s.x, s.y, s.type === 'town' || s.type === 'townEnd' ? 34 : 30);
}

/** Vehicle traffic light head; state: green|yellow|red|redyellow */
function drawTrafficLight(ctx, x, y, state, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(ctx, -6, -14, 16, 34, 4); ctx.fill();
  ctx.fillStyle = '#1b1b1b'; roundRect(ctx, -8, -17, 16, 34, 4); ctx.fill();
  const lamp = (cy, col, on) => {
    ctx.fillStyle = on ? col : '#3a3a3a';
    ctx.beginPath(); ctx.arc(0, cy, 4.6, 0, TAU); ctx.fill();
    if (on) { ctx.fillStyle = col.replace('1)', '0.35)'); ctx.beginPath(); ctx.arc(0, cy, 8.5, 0, TAU); ctx.fill(); }
  };
  lamp(-10, 'rgba(255,48,48,1)', state === 'red' || state === 'redyellow');
  lamp(0, 'rgba(255,200,0,1)', state === 'yellow' || state === 'redyellow');
  lamp(10, 'rgba(40,220,90,1)', state === 'green');
  ctx.restore();
}
