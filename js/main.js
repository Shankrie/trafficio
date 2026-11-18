'use strict';
// ---------------------------------------------------------------------------
// Progress, menus and the main loop.
// ---------------------------------------------------------------------------

const Progress = {
  key: 'trafficio.ket.v1',
  data: { done: {}, best: {} },
  load() { try { const d = JSON.parse(localStorage.getItem(this.key)); if (d) this.data = { done: d.done || {}, best: d.best || {} }; } catch (e) { /* storage unavailable */ } },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  complete(i, t) {
    this.data.done[i] = true;
    if (!this.data.best[i] || t < this.data.best[i]) this.data.best[i] = t;
    this.save();
  },
  unlocked(i) { return i === 0 || !!this.data.done[i - 1] || UNLOCK_ALL; },
};
const UNLOCK_ALL = /[?&]all\b/.test(location.search);

const $ = id => document.getElementById(id);
const fmtTime = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function signCanvas(type, value, size = 64) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = type === 'town' || type === 'townEnd' ? size * 1.4 : size;
  c.width = w * dpr; c.height = size * dpr; c.style.width = w + 'px'; c.style.height = size + 'px';
  const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
  if (type === 'lights' && value === undefined) drawSign(ctx, type, value, w / 2, size / 2, size * 0.9);
  else drawSign(ctx, type, value, w / 2, size / 2, size * (type === 'town' || type === 'townEnd' ? 0.55 : 0.9));
  return c;
}

const UI = {
  show(id) {
    for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
    if (id) $(id).classList.remove('hidden');
    $('hud').classList.toggle('hidden', id !== null && id !== 'pause');
    document.body.classList.toggle('playing', id === null);
  },
  menu() {
    game.state = 'menu';
    const grid = $('levels');
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      const open = Progress.unlocked(i), done = !!Progress.data.done[i];
      b.className = 'lvl' + (done ? ' done' : '') + (open ? '' : ' locked');
      b.innerHTML = `<span class="num">${i + 1}</span><span class="t">${L.title}</span><span class="lt">${L.lt}</span>` +
        `<span class="st">${done ? '✓ ' + fmtTime(Progress.data.best[i]) : open ? 'Play' : '🔒'}</span>`;
      b.disabled = !open;
      b.onclick = () => UI.brief(i);
      grid.appendChild(b);
    });
    const n = Object.keys(Progress.data.done).length;
    $('progress').textContent = `${n} / ${LEVELS.length} levels passed`;
    UI.show('menu');
  },
  brief(i) {
    game.load(i);
    game.state = 'brief';
    const L = LEVELS[i];
    $('b-num').textContent = `Level ${i + 1} / ${LEVELS.length}`;
    $('b-title').textContent = L.title;
    $('b-lt').textContent = L.lt;
    $('b-intro').innerHTML = L.intro;
    $('b-learn').innerHTML = L.learn.map(x => `<li>${x}</li>`).join('');
    const sg = $('b-signs'); sg.innerHTML = '';
    for (const [type, value] of L.signs) {
      const d = document.createElement('div'); d.className = 'sign';
      d.appendChild(signCanvas(type, value));
      const lb = signLabel({ type, value });
      const t = document.createElement('div'); t.innerHTML = `<b>${lb.lt}</b><small>${lb.en}</small>`;
      d.appendChild(t); sg.appendChild(d);
    }
    $('b-signs-wrap').classList.toggle('hidden', !L.signs.length);
    UI.show('brief');
    $('b-start').focus();
  },
  start() { game.state = 'play'; UI.show(null); },
  showResult(ok) {
    const i = game.levelIndex;
    $('r-box').className = 'box ' + (ok ? 'ok' : 'bad');
    if (ok) {
      $('r-title').textContent = i === LEVELS.length - 1 ? 'Exam passed! 🎉' : 'Level complete!';
      $('r-sub').textContent = `${LEVELS[i].title} · ${fmtTime(game.time)}`;
      $('r-text').innerHTML = i === LEVELS.length - 1
        ? 'You drove the whole route without a single violation. Gerai padirbėta – well done!'
        : 'You followed all the rules. Ready for the next challenge?';
      $('r-ket').textContent = '';
      $('r-next').classList.toggle('hidden', i >= LEVELS.length - 1);
    } else {
      const f = game.failInfo;
      $('r-title').textContent = f.title;
      $('r-sub').textContent = 'Violation – level failed';
      $('r-text').innerHTML = (f.extra ? `<b>${f.extra}</b><br>` : '') + f.text;
      $('r-ket').textContent = f.ket;
      $('r-next').classList.add('hidden');
    }
    UI.show('result');
    (ok && i < LEVELS.length - 1 ? $('r-next') : $('r-retry')).focus();
  },
  pause() { if (game.state !== 'play') return; game.state = 'paused'; UI.show('pause'); },
  resume() { if (game.state !== 'paused') return; game.state = 'play'; UI.show(null); },
};

// ---------------------------------------------------------------- input ----
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
window.addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (k) game.input.touch = false;
  if (k) { game.input[k] = true; if (game.state === 'play') e.preventDefault(); }
  if (e.repeat) return;
  if (game.state === 'play') {
    if (e.code === 'KeyQ') game.car.toggleSignal('left');
    if (e.code === 'KeyE') game.car.toggleSignal('right');
    if (e.code === 'KeyR') { UI.brief(game.levelIndex); UI.start(); }
    if (e.code === 'Escape' || e.code === 'KeyP') UI.pause();
  } else if (game.state === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) UI.resume();
  else if (game.state === 'brief' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); UI.start(); }
  else if ((game.state === 'fail' || game.state === 'win') && e.code === 'KeyR') { UI.brief(game.levelIndex); UI.start(); }
});
window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) game.input[k] = false; });
window.addEventListener('blur', () => { for (const k of Object.values(KEYMAP)) game.input[k] = false; });

function bindHold(id, key) {
  const el = $(id);
  const on = e => { e.preventDefault(); game.input[key] = true; game.input.touch = true; el.classList.add('on'); };
  const off = e => { e.preventDefault(); game.input[key] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
  el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
}

// ----------------------------------------------------------------- boot ----
let game;
window.addEventListener('load', () => {
  Progress.load();
  game = new Game($('c'));
  window.game = game;
  $('b-start').onclick = () => UI.start();
  $('b-back').onclick = () => UI.menu();
  $('r-retry').onclick = () => { UI.brief(game.levelIndex); UI.start(); };
  $('r-next').onclick = () => UI.brief(game.levelIndex + 1);
  $('r-menu').onclick = () => UI.menu();
  $('p-resume').onclick = () => UI.resume();
  $('p-restart').onclick = () => { UI.brief(game.levelIndex); UI.start(); };
  $('p-menu').onclick = () => UI.menu();
  $('btn-pause').onclick = () => UI.pause();
  $('reset').onclick = () => {
    const el = $('reset');
    if (el.dataset.armed) { Progress.data = { done: {}, best: {} }; Progress.save(); delete el.dataset.armed; el.textContent = 'Reset progress'; UI.menu(); return; }
    el.dataset.armed = '1'; el.textContent = 'Click again to reset all progress';
    setTimeout(() => { delete el.dataset.armed; el.textContent = 'Reset progress'; }, 4000);
  };
  bindHold('t-left', 'left'); bindHold('t-right', 'right'); bindHold('t-gas', 'up'); bindHold('t-brake', 'down');
  $('t-sl').addEventListener('pointerdown', e => { e.preventDefault(); if (game.state === 'play') game.car.toggleSignal('left'); });
  $('t-sr').addEventListener('pointerdown', e => { e.preventDefault(); if (game.state === 'play') game.car.toggleSignal('right'); });
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');

  const m = location.search.match(/[?&]level=(\d+)/);
  if (m) { UI.brief(clamp(+m[1] - 1, 0, LEVELS.length - 1)); } else UI.menu();
  // background scene for the menu
  if (!game.W) game.load(0);

  let last = performance.now(), acc = 0;
  const STEP = 1 / 120;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += dt;
    while (acc >= STEP) { game.update(STEP); acc -= STEP; }
    if (game.state === 'menu' || game.state === 'brief') game.simWorld(dt, true);
    game.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
