// Feel layer: haptics + sound, shared by every toy.
window.Feel = (() => {
  'use strict';

  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const canVibrate = typeof navigator.vibrate === 'function' && !isIOS;

  // iPhone Safari has no Vibration API. Since iOS 18, toggling an
  // <input type="checkbox" switch> plays the system "tick" haptic. Safari
  // only allows it while handling a finger lift or a click (touchstart and
  // touchmove don't count), so ticks are queued and played by flush() from
  // those handlers. Toggling several switches at once stacks the ticks into
  // a stronger buzz. The switches must stay rendered, so they're moved off
  // screen rather than hidden.
  const iosLabels = [];
  if (isIOS) {
    for (let i = 0; i < 3; i++) {
      const label = document.createElement('label');
      label.className = 'haptic-switch';
      label.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
      iosLabels.push(label);
    }
  }

  // Strength: 1 = light, 2 = firm, 3 = heavy.
  const ANDROID_MS = [0, 14, 30, 45];
  let lastTick = 0, pending = 0;
  function tick(strength = 1) {
    if (iosLabels.length) { pending = Math.max(pending, strength); return; }
    const now = performance.now();
    if (now - lastTick < 30) return; // the motor can't keep up faster than this
    lastTick = now;
    try { if (canVibrate) navigator.vibrate(ANDROID_MS[strength] || 14); } catch (_) { /* haptics are a bonus */ }
  }

  // Call at the end of touchend and click handlers.
  function flush() {
    if (!pending) return;
    const n = pending;
    pending = 0;
    try { for (let i = 0; i < n; i++) iosLabels[i].click(); } catch (_) {}
  }

  function pattern(times, gap, ms = 20) {
    if (canVibrate) {
      const p = [];
      for (let i = 0; i < times; i++) { p.push(ms); if (i < times - 1) p.push(gap); }
      try { navigator.vibrate(p); } catch (_) {}
      return;
    }
    tick(3); // iPhone plays one heavy tick on the next finger lift
  }

  // --- sound ---
  let ac = null, master = null, noise = null, soundOn = true;
  function ensureAudio() {
    if (!ac) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ac = new Ctx();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ac.destination);
      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state !== 'running') ac.resume().catch(() => {});
    return ac;
  }

  function ready() { return soundOn && ensureAudio(); }

  function env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function tone(type, f0, f1, t, peak, attack, decay) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = ac.createGain();
    env(g, t, peak, attack, decay);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + attack + decay + 0.02);
  }

  function hiss(filterType, f0, f1, q, t, peak, attack, decay) {
    const n = ac.createBufferSource();
    n.buffer = noise; n.loop = true;
    const f = ac.createBiquadFilter();
    f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
    const g = ac.createGain();
    env(g, t, peak, attack, decay);
    n.connect(f).connect(g).connect(master);
    n.start(t, Math.random() * 0.4); n.stop(t + attack + decay + 0.02);
  }

  const vary = (f) => f * (0.94 + Math.random() * 0.12);

  // A pop is a fast downward "blip" plus a tiny bright click of air.
  function pop(pitch = 480) {
    if (!ready()) return;
    const t = ac.currentTime + 0.002, f = vary(pitch);
    tone('sine', f * 1.9, f * 0.55, t, 0.55, 0.003, 0.09);
    hiss('bandpass', f * 5, f * 5, 1.4, t, 0.4, 0.001, 0.025);
  }

  // A flip is a soft whoosh of rubbery air.
  function whoosh() {
    if (!ready()) return;
    const t = ac.currentTime + 0.005;
    const n = ac.createBufferSource();
    n.buffer = noise; n.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.16);
    lp.frequency.exponentialRampToValueAtTime(300, t + 0.38);
    const g = ac.createGain();
    env(g, t, 0.35, 0.12, 0.28);
    n.connect(lp).connect(g).connect(master);
    n.start(t); n.stop(t + 0.45);
  }

  function cheer() {
    if (!ready()) return;
    [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, ac.currentTime + 0.01 + i * 0.07, 0.22, 0.005, 0.18));
  }

  // Squishy foam being pressed: a muffled, sinking squelch.
  function squish(amount = 1) {
    if (!ready()) return;
    const t = ac.currentTime + 0.002;
    hiss('lowpass', vary(900), 220, 2, t, 0.45 * amount, 0.02, 0.16);
    tone('sine', vary(150), 80, t, 0.35 * amount, 0.01, 0.14);
  }

  // Foam puffing back up.
  function puff() {
    if (!ready()) return;
    const t = ac.currentTime + 0.002;
    hiss('lowpass', 250, vary(700), 1.5, t, 0.18, 0.12, 0.2);
    tone('sine', 85, vary(140), t, 0.12, 0.06, 0.18);
  }

  // Slime: wet, bubbly gloops.
  function gloop(amount = 1) {
    if (!ready()) return;
    const t = ac.currentTime + 0.002, f = vary(320);
    hiss('bandpass', f, f * 2.6, 9, t, 0.5 * amount, 0.01, 0.12);
    tone('sine', f * 0.7, f * 1.5, t, 0.18 * amount, 0.005, 0.08);
  }

  function plop() {
    if (!ready()) return;
    const t = ac.currentTime + 0.002, f = vary(300);
    tone('sine', f, f * 0.4, t, 0.5, 0.004, 0.13);
    hiss('bandpass', f * 3, f * 1.5, 4, t, 0.3, 0.002, 0.05);
  }

  // Crunchy foam beads: a quick scatter of tiny crackles.
  function crunch(amount = 1) {
    if (!ready()) return;
    const n = 3 + Math.round(amount * 4);
    for (let i = 0; i < n; i++) {
      const t = ac.currentTime + 0.003 + Math.random() * 0.09 * amount;
      hiss('bandpass', 1400 + Math.random() * 2600, 1200, 3, t, 0.35 * amount, 0.001, 0.018);
    }
    tone('sine', vary(220), 120, ac.currentTime + 0.002, 0.12 * amount, 0.01, 0.08);
  }

  return {
    isIOS, canVibrate, tick, flush, pattern, ensureAudio,
    pop, whoosh, cheer, squish, puff, gloop, plop, crunch,
    get soundOn() { return soundOn; },
    set soundOn(v) { soundOn = v; },
  };
})();
