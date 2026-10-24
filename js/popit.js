// Pop it: a silicone board of bubbles in a few shapes. Press sinks a bubble,
// lifting pops it, sliding pops every bubble you cross, and the board flips
// when all are popped.
(window.Toys = window.Toys || {}).popit = (() => {
  'use strict';

  const PALETTES = [
    ['#ff5470', '#ff8a3d', '#ffc93c', '#7bd389', '#3ec6e0', '#4f8cff', '#8a6cff', '#e36bd8'],
    ['#00b8a9', '#2ec4b6', '#3fa7ff', '#4f7cff', '#6a6cff', '#3fa7ff', '#2ec4b6', '#00b8a9'],
    ['#ff7eb6', '#ff9ec7', '#ffb3d1', '#c9a7ff', '#a68bff', '#ffb3d1', '#ff9ec7', '#ff7eb6'],
    ['#ff6b4a', '#ff8f3f', '#ffb238', '#ffd23f', '#ffb238', '#ff8f3f', '#ff6b4a', '#f2545b'],
  ];
  const { shade } = window.Paint;

  // Outlines are drawn into a box that holds a cols x rows grid of bubbles;
  // a bubble is kept only if it fits inside the outline.
  const SHAPES = [
    { name: 'Classic', cols: 6, rows: 8, outline: roundedBox },
    { name: 'Heart', cols: 8, rows: 8, outline: heart },
    { name: 'Star', cols: 8, rows: 8, outline: star },
    { name: 'Round', cols: 7, rows: 7, outline: round },
  ];

  function roundedBox(p, x, y, w, h, cell) { p.roundRect(x, y, w, h, cell * 0.55); }

  function round(p, x, y, w, h) { p.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); }

  function heart(p, x, y, w, h) {
    const X = (u) => x + u * w, Y = (v) => y + v * h;
    p.moveTo(X(0.5), Y(0.97));
    p.bezierCurveTo(X(0.14), Y(0.72), X(-0.03), Y(0.47), X(0.03), Y(0.27));
    p.bezierCurveTo(X(0.1), Y(0.04), X(0.4), Y(-0.02), X(0.5), Y(0.2));
    p.bezierCurveTo(X(0.6), Y(-0.02), X(0.9), Y(0.04), X(0.97), Y(0.27));
    p.bezierCurveTo(X(1.03), Y(0.47), X(0.86), Y(0.72), X(0.5), Y(0.97));
    p.closePath();
  }

  function star(p, x, y, w, h, cell) {
    const cx = x + w / 2, cy = y + h * 0.54, R = Math.min(w, h) * 0.53, inner = R * 0.52;
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? inner : R;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    p.moveTo(...mid(pts[9], pts[0]));
    for (let i = 0; i < 10; i++) {
      const [mx, my] = mid(pts[i], pts[(i + 1) % 10]);
      p.arcTo(pts[i][0], pts[i][1], mx, my, i % 2 ? cell * 0.3 : cell * 0.6);
    }
    p.closePath();
  }

  const testCtx = document.createElement('canvas').getContext('2d'); // for hit-testing outlines

  let app, ctx;
  const state = {
    palette: 0,
    shape: 0,
    bubbles: [],
    grid: [],            // row-major cells: bubble or null
    ripples: [],
    geo: null,
    flip: null,          // { start, swapped }
    press: 0, pressV: 0, // whole-board squish
    popped: 0,
    touches: new Map(),  // id -> { start, last, moved }
    autoFlipTimer: 0,
  };

  function layout(W, H) {
    const s = SHAPES[state.shape];
    const pad = 10;
    const cell = Math.min((W - pad * 2) / (s.cols + 0.6), (H - pad * 2) / (s.rows + 0.6));
    const bw = cell * (s.cols + 0.6), bh = cell * (s.rows + 0.6);
    const g = { W, H, cell, bw, bh, bx: (W - bw) / 2, by: (H - bh) / 2, rad: cell * 0.36, inset: cell * 0.3 };
    g.path = new Path2D();
    s.outline(g.path, g.bx, g.by, bw, bh, cell);
    state.geo = g;

    // Keep each bubble's state across a resize; a new shape starts fresh.
    const old = state.grid.length === s.cols * s.rows ? state.grid : [];
    state.grid = [];
    state.bubbles = [];
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const b = old[r * s.cols + c] || { r, c, up: true, held: false, t: 1, v: 0, squash: 0, sv: 0 };
        const [x, y] = bubbleCenter(b);
        let fits = testCtx.isPointInPath(g.path, x, y);
        for (let k = 0; fits && k < 8; k++) {
          const a = (k * Math.PI) / 4;
          fits = testCtx.isPointInPath(g.path, x + Math.cos(a) * g.rad * 1.2, y + Math.sin(a) * g.rad * 1.2);
        }
        state.grid.push(fits ? b : null);
        if (fits) state.bubbles.push(b);
      }
    }
    state.popped = state.bubbles.filter((b) => !b.up).length;
  }

  function total() { return state.bubbles.length; }

  function bubbleCenter(b) {
    const g = state.geo;
    return [g.bx + g.inset + b.c * g.cell + g.cell / 2, g.by + g.inset + b.r * g.cell + g.cell / 2];
  }

  function bubbleAt(x, y) {
    const g = state.geo;
    const s = SHAPES[state.shape];
    const c = Math.floor((x - g.bx - g.inset) / g.cell);
    const r = Math.floor((y - g.by - g.inset) / g.cell);
    if (c < 0 || c >= s.cols || r < 0 || r >= s.rows) return null;
    const b = state.grid[r * s.cols + c];
    if (!b) return null;
    const [cx, cy] = bubbleCenter(b);
    // generous target: anywhere in the bubble's cell counts, for small fingers
    return Math.hypot(x - cx, y - cy) <= g.cell * 0.62 ? b : null;
  }

  // --- interaction ---
  function popBubble(b) {
    if (!b.up || state.flip) return false;
    b.up = false;
    b.held = false;
    b.v -= 6;           // kick the spring so it overshoots like silicone
    b.sv += 14;
    state.pressV += 2.5;
    state.popped++;
    Feel.tick(2);
    Feel.pop(380 + (SHAPES[state.shape].rows - b.r) * 32 + b.c * 6);
    const [x, y] = bubbleCenter(b);
    if (!app.reduceMotion) state.ripples.push({ x, y, age: 0 });
    app.refreshStatus();
    if (state.popped === total()) {
      app.setHint('All popped! Flipping…');
      clearTimeout(state.autoFlipTimer);
      state.autoFlipTimer = setTimeout(() => flip(true), 650);
    }
    return true;
  }

  function flip(celebrate) {
    if (state.flip) return;
    clearTimeout(state.autoFlipTimer);
    state.flip = { start: performance.now(), swapped: false };
    Feel.whoosh();
    if (celebrate) { Feel.cheer(); Feel.pattern(3, 90, 24); }
    else Feel.pattern(2, 110, 20);
  }

  function finishFlipSwap() {
    // Turning a pop-it over makes every pressed bubble a dome again, and the
    // domes become dents.
    let popped = 0;
    for (const b of state.bubbles) {
      b.up = !b.up;
      b.t = -b.t;
      if (!b.up) popped++;
    }
    state.popped = popped;
    app.refreshStatus();
    app.setHint(toy.hint);
  }

  function down(id, x, y) {
    const b = bubbleAt(x, y);
    state.touches.set(id, { start: b, last: b, moved: false });
    if (!b || state.flip) return;
    if (b.up) { b.held = true; b.sv += 8; Feel.tick(1); }
    else b.sv += 6; // a dent just squishes a little
  }

  function move(id, x, y) {
    const p = state.touches.get(id);
    if (!p) return;
    const b = bubbleAt(x, y);
    if (b === p.last) return;
    if (!p.moved && p.start && p.start.held) popBubble(p.start);
    p.moved = true;
    if (b) popBubble(b);
    p.last = b;
  }

  function up(id, x, y, cancelled) {
    const p = state.touches.get(id);
    state.touches.delete(id);
    if (!p || !p.start || !p.start.held) return;
    if (!cancelled) popBubble(p.start);
    p.start.held = false;
  }

  // --- drawing ---
  function drawBoard() {
    const g = state.geo, pal = PALETTES[state.palette];
    const rows = SHAPES[state.shape].rows;

    // drop shadow under the silicone slab
    ctx.save();
    ctx.shadowColor = 'rgba(45,35,80,0.28)';
    ctx.shadowBlur = g.cell * 0.5;
    ctx.shadowOffsetY = g.cell * 0.18;
    ctx.fillStyle = pal[0];
    ctx.fill(g.path);
    ctx.restore();

    // colour bands, one per row
    ctx.save();
    ctx.clip(g.path);
    for (let i = 0; i < rows; i++) {
      const y0 = i === 0 ? g.by - g.cell : g.by + g.inset + i * g.cell;
      const y1 = i === rows - 1 ? g.by + g.bh + g.cell : g.by + g.inset + (i + 1) * g.cell;
      ctx.fillStyle = pal[i % pal.length];
      ctx.fillRect(g.bx, y0, g.bw, y1 - y0 + 0.5);
    }
    // soft rubbery sheen across the slab
    const sheen = ctx.createLinearGradient(g.bx, g.by, g.bx + g.bw, g.by + g.bh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.04)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sheen;
    ctx.fillRect(g.bx, g.by, g.bw, g.bh);
    ctx.restore();

    // raised rim
    ctx.save();
    ctx.clip(g.path);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke(g.path);
    ctx.restore();
  }

  function drawBubble(b) {
    const g = state.geo, pal = PALETTES[state.palette];
    const color = pal[b.r % pal.length];
    const [x, y] = bubbleCenter(b);
    const t = Math.max(-1.2, Math.min(1.2, b.t));
    const sq = b.squash;
    const rad = g.rad * (1 + 0.05 * t) * (1 + 0.06 * sq);

    // groove around the bubble where it meets the slab
    ctx.beginPath();
    ctx.arc(x, y, g.rad * 1.12, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, -0.22);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + 0.04 * sq, 1 - 0.04 * sq);

    // body: light comes from the top-left. A dome is bright up there; a dent
    // is shadowed up there and catches light bottom-right.
    const off = -0.38 * rad * t;
    const grad = ctx.createRadialGradient(off, off, rad * 0.05, 0, 0, rad * 1.05);
    if (t >= 0) {
      grad.addColorStop(0, shade(color, 0.55 * t));
      grad.addColorStop(0.55, shade(color, 0.08 * t));
      grad.addColorStop(1, shade(color, -0.28 * t));
    } else {
      const k = -t;
      grad.addColorStop(0, shade(color, 0.22 * k));
      grad.addColorStop(0.6, shade(color, -0.1 * k));
      grad.addColorStop(1, shade(color, -0.32 * k));
    }
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    if (t > 0) {
      // glossy highlight on a dome
      ctx.beginPath();
      ctx.ellipse(-rad * 0.36, -rad * 0.42, rad * 0.3, rad * 0.18, -0.7, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.min(1, t)})`;
      ctx.fill();
    } else {
      // inner shadow crescent on a dent
      const k = Math.min(1, -t);
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.92, Math.PI * 0.95, Math.PI * 1.85);
      ctx.lineWidth = rad * 0.22;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(30,20,60,${0.22 * k})`;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, rad * 0.86, Math.PI * 0.05, Math.PI * 0.75);
      ctx.lineWidth = rad * 0.12;
      ctx.strokeStyle = `rgba(255,255,255,${0.3 * k})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRipples(dt) {
    const g = state.geo;
    state.ripples = state.ripples.filter((rp) => (rp.age += dt) < 0.45);
    for (const rp of state.ripples) {
      const p = rp.age / 0.45;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, g.rad * (1.1 + p * 0.9), 0, Math.PI * 2);
      ctx.lineWidth = 4 * (1 - p);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
      ctx.stroke();
    }
  }

  // --- simulation ---
  function step(dt) {
    for (const b of state.bubbles) {
      const target = b.up ? (b.held ? 0.3 : 1) : -1;
      // stiff, slightly under-damped spring: snappy with one wobble
      b.v += (520 * (target - b.t) - 18 * b.v) * dt;
      b.t += b.v * dt;
      b.sv += (-700 * b.squash - 16 * b.sv) * dt;
      b.squash += b.sv * dt;
    }
    state.pressV += (-300 * state.press - 14 * state.pressV) * dt;
    state.press += state.pressV * dt;
  }

  function frame(dt, now) {
    for (let i = 0; i < 3; i++) step(dt / 3); // sub-step the springs for stability

    const g = state.geo;
    ctx.save();
    const cx = g.W / 2, cy = g.H / 2;
    ctx.translate(cx, cy);

    let sx = 1;
    if (state.flip) {
      const dur = app.reduceMotion ? 260 : 520;
      const p = Math.min(1, (now - state.flip.start) / dur);
      sx = Math.cos(p * Math.PI);
      if (p >= 0.5 && !state.flip.swapped) { state.flip.swapped = true; finishFlipSwap(); }
      if (p >= 1) state.flip = null;
      sx = Math.max(0.02, Math.abs(sx));
    }
    const squish = 1 - Math.max(-0.02, Math.min(0.03, state.press * 0.01));
    ctx.scale(sx * squish, squish * (1 + (1 - sx) * 0.06));
    ctx.translate(-cx, -cy);

    drawBoard();
    for (const b of state.bubbles) drawBubble(b);
    drawRipples(dt);
    ctx.restore();
  }

  const toy = {
    name: 'Pop it',
    icon: '🫧',
    hint: 'Tap or swipe the bubbles',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    flip: () => flip(false),
    nextColour() { state.palette = (state.palette + 1) % PALETTES.length; Feel.pop(700); },
    styleIcon: '⭐',
    styleLabel: 'Change shape',
    nextStyle() {
      if (state.flip) return;
      clearTimeout(state.autoFlipTimer);
      state.shape = (state.shape + 1) % SHAPES.length;
      state.grid = [];
      layout(state.geo.W, state.geo.H);
      Feel.whoosh();
      app.refreshStatus();
      app.setHint(`${SHAPES[state.shape].name} pop it`);
    },
    status: () => `${state.popped} <small>/ ${total()}</small>`,
  };
  return toy;
})();
