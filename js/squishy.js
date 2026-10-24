// Squishy: a soft foam friend. Pressing makes a dent and squashes it, pulling
// the edge stretches it, and dents rise back slowly like slow-rise foam.
(window.Toys = window.Toys || {}).squishy = (() => {
  'use strict';

  const COLOURS = ['#ffb38a', '#8fe3c0', '#c3a6ff', '#ffe27a', '#ff9ec7', '#8fd3ff'];
  const N = 72;
  const FACE = '#3a2a4a';
  const { shade, hexToRgb } = window.Paint;

  let app, ctx;
  const state = {
    colour: 0,
    cx: 0, cy: 0, R: 100,
    r: new Float32Array(N), v: new Float32Array(N),
    dents: new Map(),  // touch id -> dent while held
    fading: [],        // released dents rising back
    jiggle: 0, jiggleV: 0,
    squeezes: 0,
    time: 0,
    nextBlink: 2.5, blinkUntil: 0,
  };

  function layout(W, H) {
    const R = Math.min(W * 0.36, H * 0.3);
    state.cx = W / 2;
    state.cy = H * 0.5;
    state.R = R;
    state.r.fill(R);
    state.v.fill(0);
  }

  function allDents() { return [...state.dents.values(), ...state.fading]; }

  function squashAmount() {
    let s = 0;
    for (const d of allDents()) if (d.inside) s += d.d;
    return Math.min(1.4, s);
  }

  // Squash happens around the floor point under the squishy.
  function scales() {
    const s = squashAmount() + state.jiggle;
    return [1 + 0.08 * s, 1 - 0.07 * s];
  }
  function toLocal(x, y) {
    const [sx, sy] = scales();
    const fy = state.cy + state.R;
    return [state.cx + (x - state.cx) / sx, fy + (y - fy) / sy];
  }

  function down(id, x, y) {
    const [lx, ly] = toLocal(x, y);
    const dist = Math.hypot(lx - state.cx, ly - state.cy);
    if (dist > state.R * 1.1) return;
    state.dents.set(id, { x: lx, y: ly, d: 0, inside: true });
    state.squeezes++;
    state.jiggleV += 3;
    Feel.tick(2);
    Feel.squish(1);
    app.refreshStatus();
  }

  function move(id, x, y) {
    const dent = state.dents.get(id);
    if (!dent) return;
    const [lx, ly] = toLocal(x, y);
    dent.x = lx; dent.y = ly;
    const dist = Math.hypot(lx - state.cx, ly - state.cy);
    const wasInside = dent.inside;
    dent.inside = dist < state.R;
    if (wasInside && !dent.inside) Feel.squish(0.5); // starting to stretch it
  }

  function up(id) {
    const dent = state.dents.get(id);
    if (!dent) return;
    state.dents.delete(id);
    if (dent.inside) state.fading.push(dent);
    state.jiggleV -= 4;
    Feel.tick(1);
    Feel.puff();
  }

  function step(dt) {
    const { R, r, v } = state;

    for (const d of state.dents.values()) d.d += (1 - d.d) * Math.min(1, dt * 9);
    // slow rise: quick at first, then lazily back to round
    for (const d of state.fading) d.d -= dt * (0.25 + 0.9 * d.d);
    state.fading = state.fading.filter((d) => d.d > 0.01);

    const dents = allDents();
    const squash = squashAmount();
    const breathe = 1 + 0.008 * Math.sin(state.time * 2.2);

    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      let target = R * breathe * (1 + 0.04 * squash);
      for (const d of dents) {
        const dx = d.x - state.cx, dy = d.y - state.cy;
        const rho = Math.hypot(dx, dy) / R;
        let da = Math.abs(a - Math.atan2(dy, dx));
        if (da > Math.PI) da = Math.PI * 2 - da;
        const fall = Math.exp(-(da * da) / (2 * 0.32 * 0.32));
        if (d.inside) target += R * 0.13 * d.d * Math.min(1, rho) * fall; // pressing near the edge bulges it
        else {
          const reach = R * Math.min(rho, 1.75);
          target += (reach - target) * fall * 0.92; // the edge follows the finger
        }
      }
      const lap = r[(i + 1) % N] + r[(i + N - 1) % N] - 2 * r[i];
      v[i] += (80 * (target - r[i]) + 260 * lap - 7 * v[i]) * dt;
    }
    for (let i = 0; i < N; i++) r[i] += v[i] * dt;

    state.jiggleV += (-160 * state.jiggle - 9 * state.jiggleV) * dt;
    state.jiggle += state.jiggleV * dt * 0.1;
  }

  function bodyPath() {
    const { r, cx, cy } = state;
    const pt = (i) => {
      const a = (i / N) * Math.PI * 2;
      return [cx + Math.cos(a) * r[i % N], cy + Math.sin(a) * r[i % N]];
    };
    ctx.beginPath();
    let [px, py] = pt(0), [qx, qy] = pt(1);
    ctx.moveTo((px + qx) / 2, (py + qy) / 2);
    for (let i = 1; i <= N; i++) {
      [px, py] = pt(i);
      [qx, qy] = pt(i + 1);
      ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    }
    ctx.closePath();
  }

  function drawDent(d, colour) {
    const R = state.R;
    const rr = R * 0.3 * (0.7 + 0.3 * d.d);
    const [r, g, b] = hexToRgb(colour).map((x) => x * 0.45 | 0);
    const sh = ctx.createRadialGradient(d.x - rr * 0.2, d.y - rr * 0.2, 0, d.x, d.y, rr);
    sh.addColorStop(0, `rgba(${r},${g},${b},${0.34 * d.d})`);
    sh.addColorStop(0.55, `rgba(${r},${g},${b},${0.16 * d.d})`);
    sh.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(d.x, d.y, rr, 0, Math.PI * 2);
    ctx.fill();
    // the lip of the dent catches the light on the far side
    ctx.beginPath();
    ctx.arc(d.x, d.y, rr * 0.72, Math.PI * 0.05, Math.PI * 0.7);
    ctx.lineWidth = rr * 0.16;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * d.d})`;
    ctx.stroke();
  }

  function drawFace(squash) {
    const { cx, cy, R } = state;
    const fy = cy + R * 0.02;
    ctx.save();
    ctx.strokeStyle = FACE;
    ctx.fillStyle = FACE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = R * 0.045;

    // cheeks
    ctx.fillStyle = 'rgba(255,92,138,0.32)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * R * 0.43, fy + R * 0.14, R * 0.11, R * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = FACE;

    const ex = R * 0.27, ey = fy - R * 0.04;
    if (squash > 0.25) {
      // squeezed: > <
      for (const s of [-1, 1]) {
        const x = cx + s * ex;
        ctx.beginPath();
        ctx.moveTo(x - s * R * 0.07, ey - R * 0.06);
        ctx.lineTo(x + s * R * 0.04, ey);
        ctx.lineTo(x - s * R * 0.07, ey + R * 0.06);
        ctx.stroke();
      }
    } else if (state.time < state.blinkUntil) {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * ex - R * 0.06, ey);
        ctx.lineTo(cx + s * ex + R * 0.06, ey);
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(cx + s * ex, ey, R * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx + s * ex - R * 0.022, ey - R * 0.025, R * 0.022, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = FACE;
      }
    }

    const my = fy + R * 0.13;
    if (squash > 0.25) {
      ctx.beginPath();
      ctx.ellipse(cx, my + R * 0.01, R * 0.07, R * 0.06 + R * 0.03 * Math.min(1, squash), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, my + R * 0.045, R * 0.04, R * 0.022, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ff7a9c';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, my - R * 0.03, R * 0.075, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(dt) {
    state.time += dt;
    if (state.time > state.nextBlink) {
      state.blinkUntil = state.time + 0.13;
      state.nextBlink = state.time + 2.5 + Math.random() * 3;
    }
    for (let i = 0; i < 3; i++) step(dt / 3);

    const { cx, cy, R } = state;
    const colour = COLOURS[state.colour];
    const squash = squashAmount();
    const [sx, sy] = scales();
    const floorY = cy + R;

    // soft floor shadow
    const sw = R * 1.05 * sx;
    const shadow = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, sw);
    shadow.addColorStop(0, 'rgba(45,35,80,0.26)');
    shadow.addColorStop(1, 'rgba(45,35,80,0)');
    ctx.save();
    ctx.translate(cx, floorY);
    ctx.scale(1, 0.16);
    ctx.translate(-cx, -floorY);
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(cx, floorY, sw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, floorY);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -floorY);

    bodyPath();
    const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.05, cx, cy, R * 1.15);
    body.addColorStop(0, shade(colour, 0.5));
    body.addColorStop(0.5, colour);
    body.addColorStop(1, shade(colour, -0.2));
    ctx.fillStyle = body;
    ctx.fill();

    ctx.save();
    bodyPath();
    ctx.clip();
    for (const d of allDents()) if (d.inside && d.d > 0.01) drawDent(d, colour);
    // matte foam sheen
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.38, cy - R * 0.5, R * 0.26, R * 0.13, -0.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.5 - 0.2 * Math.min(1, squash)})`;
    ctx.fill();
    ctx.restore();

    drawFace(squash);
    ctx.restore();
  }

  return {
    name: 'Squishy',
    icon: '🍡',
    hint: 'Press, squeeze and pull the squishy',
    init(a, c) { app = a; ctx = c; },
    layout, frame, down, move, up,
    nextColour() { state.colour = (state.colour + 1) % COLOURS.length; state.jiggleV += 3; Feel.squish(0.6); },
    status: () => `${state.squeezes} <small>squeezes</small>`,
  };
})();
