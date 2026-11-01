// Ting Tang Ring - rendering, input, screens. Original art drawn in code; no external assets.
(function () {
  'use strict';
  const T = window.TTR, TAU = Math.PI * 2;
  const OUT = '#706082', BG = '#FFF6E6', TRAY = '#CDE8F8', INK = '#6A5A80', RW = 30;
  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;
  const store = (() => { try { return JSON.parse(localStorage.getItem('ttr.progress')) || { unlocked: 1, done: {} }; } catch (e) { return { unlocked: 1, done: {} }; } })();
  const save = () => { try { localStorage.setItem('ttr.progress', JSON.stringify(store)); } catch (e) {} };

  // ---------- sound (Web Audio, synthesized, original) ----------
  let ac = null;
  function tone(f, d, type = 'sine', v = 0.12, f2) {
    if (!ac) return; const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const sfx = {
    tick: () => tone(1400, 0.03, 'triangle', 0.04),
    click: () => { tone(900, 0.06, 'square', 0.05); setTimeout(() => tone(1300, 0.08, 'triangle', 0.07), 40); },
    free: () => { tone(660, 0.18, 'sine', 0.12, 1320); setTimeout(() => tone(990, 0.25, 'sine', 0.08), 90); },
    bump: () => tone(180, 0.08, 'sine', 0.06),
    win: () => [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => tone(f, 0.3, 'sine', 0.1), k * 120)),
    tap: () => tone(700, 0.05, 'triangle', 0.05),
  };

  // ---------- state ----------
  let ease = null, screen = 'map', level = 1, S = null, undo = [], anims = [], doorGlow = {}, hint = null, wobble = {}, won = 0, drag = null, now = 0;
  function start(n) { ease = null; level = n; S = T.getLevel(n); S.rings.forEach(R => { R.gripA = R.rot + R.gripOff; }); fitView(); placeDoors(); settleGrips(); S.rings.forEach(R => { if (R.gripT !== undefined) { R.gripA = R.gripT; R.gripT = undefined; } }); undo = []; anims = []; doorGlow = {}; hint = null; wobble = {}; won = 0; drag = null; screen = 'play'; }

  // ---------- layout ----------
  let L = {};
  function layout() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cw = r.width; ch = r.height; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    const land = cw > ch * 1.15, u = Math.min(cw, ch);
    const btn = Math.max(56, Math.min(92, u * 0.11));
    L = { land, btn };
    if (land) { // side rails
      L.area = { x: btn * 1.6, y: 10, w: cw - btn * 3.2, h: ch - 20 }; L.board = fit(btn * 1.6, 10, cw - btn * 3.2, ch - 20);
      L.home = { x: btn * 0.8, y: btn * 0.8 }; L.num = { x: btn * 0.8, y: btn * 2.2 };
      L.bt = [{ id: 'undo', x: cw - btn * 0.8, y: ch / 2 - btn * 1.3 }, { id: 'restart', x: cw - btn * 0.8, y: ch / 2 }, { id: 'hint', x: cw - btn * 0.8, y: ch / 2 + btn * 1.3 }];
    } else {
      L.area = { x: 8, y: btn * 1.5, w: cw - 16, h: ch - btn * 3.1 }; L.board = fit(10, btn * 1.5, cw - 20, ch - btn * 3.1);
      L.home = { x: btn * 0.8, y: btn * 0.75 }; L.num = { x: cw / 2, y: btn * 0.75 };
      L.bt = [{ id: 'undo', x: cw / 2 - btn * 1.3, y: ch - btn * 0.8 }, { id: 'restart', x: cw / 2, y: ch - btn * 0.8 }, { id: 'hint', x: cw / 2 + btn * 1.3, y: ch - btn * 0.8 }];
    }
  }
  function fitView() { // tray hugs the tangle (with slide room) and matches the screen's shape
    if (!S) return; const A = L.area; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const R of S.rings) { const m = R.r + 95; x0 = Math.min(x0, R.x - m); y0 = Math.min(y0, R.y - m); x1 = Math.max(x1, R.x + m); y1 = Math.max(y1, R.y + m); }
    let w = x1 - x0, h = y1 - y0; const asp = A.w / A.h, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (w / h < asp) w = h * asp; else h = w / asp;
    S.tray = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
    const k = Math.min(A.w / w, A.h / h); L.board = { k, ox: A.x + (A.w - w * k) / 2 - S.tray.x0 * k, oy: A.y + (A.h - h * k) / 2 - S.tray.y0 * k };
  }
  function fit(x, y, w, h) { const k = Math.min(w / T.W, h / T.H); return { k, ox: x + (w - T.W * k) / 2, oy: y + (h - T.H * k) / 2 }; }
  const toW = (px, py) => ({ x: (px - L.board.ox) / L.board.k, y: (py - L.board.oy) / L.board.k });

  // ---------- drawing helpers ----------
  function arcStroke(x, y, r, a0, a1, w, col) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.strokeStyle = OUT; ctx.lineWidth = w + 5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  function overPatch(R, c) { // redraw a short piece of ring R on top at angle c (no end caps -> no marks)
    const a0 = c - 0.22, a1 = c + 0.22; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(R.x, R.y, R.r, a0, a1); ctx.strokeStyle = R.color; ctx.lineWidth = RW + 6; ctx.stroke();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUT;
    ctx.beginPath(); ctx.arc(R.x, R.y, R.r + RW / 2 + 1.5, a0, a1); ctx.stroke();
    ctx.beginPath(); ctx.arc(R.x, R.y, Math.max(1, R.r - RW / 2 - 1.5), a0, a1); ctx.stroke();
  }
  const inGap = (R, c) => Math.abs(T.norm(c - R.rot)) < T.GAP / 2 + 0.25;
  function gripPos(R) { const a = R.gripA ?? (R.rot + R.gripOff), b = R.r + RW / 2; return { a, sx: R.x + Math.cos(a) * b, sy: R.y + Math.sin(a) * b, bx: R.x + Math.cos(a) * (b + 44), by: R.y + Math.sin(a) * (b + 44) }; }
  function gripScore(R, a) {
    if (Math.abs(T.norm(a - R.rot)) < T.GAP / 2 + 0.5 || R.tabs.some(t => Math.abs(T.norm(a - R.rot - t)) < 0.45)) return -1e9;
    const d = R.r + RW / 2 + 44, bx = R.x + Math.cos(a) * d, by = R.y + Math.sin(a) * d, TR = S.tray;
    let sc = Math.min(bx - TR.x0 - 30, TR.x1 - 30 - bx, by - TR.y0 - 30, TR.y1 - 30 - by);
    for (const Q of S.rings) if (Q !== R && Q.alive) {
      sc = Math.min(sc, Math.abs(Math.hypot(bx - Q.x, by - Q.y) - Q.r) - RW);
      const qa = Q.gripA, qd = Q.r + RW / 2 + 44; if (qa !== undefined) sc = Math.min(sc, Math.hypot(bx - Q.x - Math.cos(qa) * qd, by - Q.y - Math.sin(qa) * qd) - 70);
    }
    return sc;
  }
  function settleGrips(only) { // each grip glides to the clearest outward spot near where it is
    for (const R of S.rings) { if (!R.alive || (only !== undefined && R !== only) || (drag && S.rings[drag.i] === R)) continue;
      let best = R.gripA, bs = gripScore(R, R.gripA) + 25;
      for (let k = 1; k < 36; k++) { const a = R.gripA + k * TAU / 36, sc = gripScore(R, a) - Math.abs(T.norm(a - R.gripA)) * 4; if (sc > bs) { bs = sc; best = a; } }
      R.gripT = R.gripA + T.norm(best - R.gripA);
    }
  }
  function drawGrip(R, glow) {
    const g = gripPos(R), nx = -Math.sin(g.a), ny = Math.cos(g.a), L2 = 40;
    if (glow) { ctx.beginPath(); ctx.arc(g.bx, g.by, 62, 0, TAU); ctx.fillStyle = 'rgba(255,240,170,0.85)'; ctx.fill(); }
    for (const [c, w] of [[OUT, 5], [R.color, 0]]) {
      ctx.strokeStyle = c; ctx.lineCap = 'round';
      ctx.lineWidth = 20 + w; ctx.beginPath(); ctx.moveTo(g.sx, g.sy); ctx.lineTo(g.bx, g.by); ctx.stroke();
      ctx.lineWidth = 28 + w; ctx.beginPath(); ctx.moveTo(g.bx - nx * L2, g.by - ny * L2); ctx.lineTo(g.bx + nx * L2, g.by + ny * L2); ctx.stroke();
    }
  }
  function drawTabs(R) {
    for (const t of R.tabs) {
      const a = R.rot + t, d = R.r + RW / 2 + 8, x = R.x + Math.cos(a) * d, y = R.y + Math.sin(a) * d;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fillStyle = R.color; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    }
  }
  function ringArc(R) { const h = T.GAP / 2; arcStroke(R.x, R.y, R.r, R.rot + h, R.rot + TAU - h, RW, R.color); }
  function doorFor(i) {
    const R = S.rings[i]; let dx = R.x - 500, dy = R.y - 500; if (Math.hypot(dx, dy) < 1) { dx = 0; dy = 1; }
    const t = Math.min(470 / Math.abs(dx || 1e-9), 470 / Math.abs(dy || 1e-9));
    const x = 500 + dx * t, y = 500 + dy * t, vert = Math.abs(dx * t) >= 469;
    return { x, y, vert };
  }
  function placeDoors() { // matching doors spread round the tray edge, never touching, away from corners
    const TR = S.tray, X0 = TR.x0 + 10, Y0 = TR.y0 + 10, X1 = TR.x1 - 10, Y1 = TR.y1 - 10, c = 90;
    const segs = [[X0 + c, Y0, X1 - c, Y0, false], [X1, Y0 + c, X1, Y1 - c, true], [X1 - c, Y1, X0 + c, Y1, false], [X0, Y1 - c, X0, Y0 + c, true]];
    const lens = segs.map(s => Math.hypot(s[2] - s[0], s[3] - s[1])), P = lens.reduce((a, b) => a + b, 0);
    const fromU = u => { u = ((u % P) + P) % P; for (let k = 0; k < 4; k++) { if (u <= lens[k]) { const s = segs[k], t = u / lens[k]; return { x: s[0] + (s[2] - s[0]) * t, y: s[1] + (s[3] - s[1]) * t, vert: s[4] }; } u -= lens[k]; } return fromU(0); };
    const toU = (x, y) => { let best = 0, bd = 1e9, acc = 0; for (let k = 0; k < 4; k++) { const s = segs[k]; for (let t = 0; t <= 1; t += 0.02) { const px = s[0] + (s[2] - s[0]) * t, py = s[1] + (s[3] - s[1]) * t, d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = acc + t * lens[k]; } } acc += lens[k]; } return best; };
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const items = S.rings.map((R, i) => { const dx = R.x - cx, dy = R.y - cy, t = 4000 / (Math.hypot(dx, dy) || 1); return { i, u: toU(cx + dx * t, cy + dy * t) }; }).sort((a, b) => a.u - b.u);
    const gap = Math.min(190, P / items.length);
    for (let it = 0; it < 60; it++) for (let k = 0; k < items.length; k++) {
      const A = items[k], B = items[(k + 1) % items.length]; let d = B.u - A.u; if (k === items.length - 1) d += P;
      if (d < gap && items.length > 1) { const m = (gap - d) / 2; A.u -= m; B.u += m; }
    }
    for (const it of items) S.rings[it.i]._door = fromU(it.u);
  }
  function pill(x, y, w, h, fill) { const r = Math.min(w, h) / 2; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }

  // ---------- play screen ----------
  function drawBoard() {
    const B = L.board; ctx.save(); ctx.translate(B.ox, B.oy); ctx.scale(B.k, B.k);
    const TR = S.tray; ctx.beginPath(); ctx.roundRect(TR.x0 + 10, TR.y0 + 10, TR.x1 - TR.x0 - 20, TR.y1 - TR.y0 - 20, 60); ctx.fillStyle = TRAY; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    // doors
    S.rings.forEach((R, i) => {
      const D = R._door, g = doorGlow[i] ? Math.max(0, 1 - (now - doorGlow[i]) / 1200) : 0;
      if (g > 0) { ctx.beginPath(); ctx.arc(D.x, D.y, 70 + 20 * g, 0, TAU); ctx.fillStyle = `rgba(255,236,150,${0.8 * g})`; ctx.fill(); }
      if (R.alive || g > 0) pill(D.x, D.y, D.vert ? 44 : 110, D.vert ? 110 : 44, R.color);
    });
    if (ease) { const R = S.rings[ease.i]; // smooth glide onto the crossing / notch
      if (!R || !R.alive || Math.abs(ease.left) < 0.001) ease = null;
      else { const st = Math.sign(ease.left) * Math.min(0.06, Math.abs(ease.left)); const rr = T.rotateCollect(S, ease.i, st); R.gripA += rr.done; ease.left -= st; handle(rr.ev.filter(e => e.type !== 'bump'), ease.i); if (rr.done === 0) ease = null; if (!ease) settleGrips(); } }
    for (const R of S.rings) if (R.gripT !== undefined) { R.gripA += (R.gripT - R.gripA) * 0.2; if (Math.abs(R.gripT - R.gripA) < 0.002) { R.gripA = R.gripT; R.gripT = undefined; } }
    const alive = S.rings.map((R, i) => [R, i]).filter(([R]) => R.alive);
    for (const [R, i] of alive) {
      ctx.save(); const wb = wobble[i] ? Math.max(0, 1 - (now - wobble[i]) / 300) : 0;
      if (wb) ctx.translate(Math.sin(now / 25) * 6 * wb, 0);
      drawTabs(R); ringArc(R); ctx.restore();
    }
    // weave: each link, ring A over at one crossing, B over at the other
    for (const [a, b] of S.links) {
      const A = S.rings[a], Bq = S.rings[b], cr = T.crossings(A, Bq); if (!cr) continue;
      if (!inGap(A, cr[0])) overPatch(A, cr[0]);
      const px = A.x + Math.cos(cr[1]) * A.r, py = A.y + Math.sin(cr[1]) * A.r, cb = Math.atan2(py - Bq.y, px - Bq.x);
      if (!inGap(Bq, cb)) overPatch(Bq, cb);
    }
    for (const [R, i] of alive) drawGrip(R, (drag && drag.i === i) || (hint && hint.i === i && Math.sin(now / 160) > -0.3));
    // hint arrow: dotted arc showing which way to twist
    if (hint && S.rings[hint.i].alive) {
      const R = S.rings[hint.i], a0 = R.gripA, a1 = a0 + hint.delta;
      ctx.setLineDash([4, 22]); ctx.lineCap = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(230,160,40,0.9)';
      ctx.beginPath(); ctx.arc(R.x, R.y, R.r + 110, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke(); ctx.setLineDash([]);
      const ex = R.x + Math.cos(a1) * (R.r + 110), ey = R.y + Math.sin(a1) * (R.r + 110);
      ctx.beginPath(); ctx.arc(ex, ey, 18, 0, TAU); ctx.fillStyle = 'rgba(230,160,40,0.9)'; ctx.fill();
      if (now - hint.t0 > 4000) hint = null;
    }
    // vanish anims
    anims = anims.filter(A => {
      const t = (now - A.t0) / 700; if (t >= 1) return false;
      const R = A.R, e = t * t, x = R.x + (A.dx - R.x) * e, y = R.y + (A.dy - R.y) * e;
      ctx.globalAlpha = 1 - t; const h = T.GAP / 2;
      arcStroke(x, y, R.r * (1 - 0.6 * t), R.rot + h, R.rot + TAU - h, RW * (1 - 0.5 * t), R.color); ctx.globalAlpha = 1;
      for (let k = 0; k < 10; k++) { const a = k * TAU / 10 + t, d = R.r * (0.6 + t); ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 12 * (1 - t), 0, TAU); ctx.fillStyle = k % 2 ? '#FFDE7D' : '#FFFFFF'; ctx.fill(); }
      return true;
    });
    ctx.restore();
  }
  function icon(id, x, y, s, active = true) {
    ctx.beginPath(); ctx.arc(x, y, s / 2, 0, TAU); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.globalAlpha = active ? 1 : 0.35; ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const r = s * 0.22;
    if (id === 'undo') { ctx.beginPath(); ctx.arc(x, y + r * 0.2, r, Math.PI * 1.05, Math.PI * 0.35, false); ctx.stroke(); tri(x - r * 1.05, y + r * 0.05, Math.PI * 0.5, s * 0.11); }
    if (id === 'restart') { ctx.beginPath(); ctx.arc(x, y, r, -Math.PI * 0.35, Math.PI * 1.45); ctx.stroke(); tri(x + r * 0.55, y - r * 0.85, -Math.PI * 0.1, s * 0.11); }
    if (id === 'hint') { ctx.fillStyle = '#F4B63C'; ctx.beginPath(); ctx.arc(x, y - r * 0.2, r * 0.85, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(x - r * 0.35, y + r * 0.6, r * 0.7, r * 0.45, 4); ctx.fill(); }
    if (id === 'home') { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y); ctx.moveTo(x - r * 0.7, y - r * 0.1); ctx.lineTo(x - r * 0.7, y + r * 0.9); ctx.lineTo(x + r * 0.7, y + r * 0.9); ctx.lineTo(x + r * 0.7, y - r * 0.1); ctx.stroke(); }
    if (id === 'next') { tri(x + s * 0.04, y, 0, s * 0.22); }
    ctx.globalAlpha = 1;
  }
  function tri(x, y, a, s) { ctx.beginPath(); for (let k = 0; k < 3; k++) { const b = a + k * TAU / 3; ctx.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s); } ctx.closePath(); ctx.fill(); }
  function drawPlay() {
    drawBoard();
    icon('home', L.home.x, L.home.y, L.btn);
    ctx.fillStyle = INK; ctx.font = `bold ${L.btn * 0.9}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(level), L.num.x, L.num.y);
    for (const b of L.bt) icon(b.id, b.x, b.y, L.btn, b.id !== 'undo' || undo.length > 0);
    if (won) drawWin();
  }
  function drawWin() {
    const t = Math.min(1, (now - won) / 600);
    ctx.fillStyle = `rgba(255,246,230,${0.85 * t})`; ctx.fillRect(0, 0, cw, ch);
    const u = Math.min(cw, ch);
    for (let k = 0; k < 3; k++) star(cw / 2 + (k - 1) * u * 0.2, ch * 0.4 - (k === 1 ? u * 0.04 : 0), u * 0.08 * Math.min(1, t * 1.5 - k * 0.2 + 0.2));
    for (let k = 0; k < 24; k++) { const a = k * 2.4, d = u * 0.35 * t + (k % 3) * 20; ctx.beginPath(); ctx.arc(cw / 2 + Math.cos(a) * d, ch * 0.42 + Math.sin(a) * d + t * 40, 9, 0, TAU); ctx.fillStyle = T.COLORS[k % 6]; ctx.fill(); }
    icon('next', cw / 2, ch * 0.68, L.btn * 1.5);
    L.nextBtn = { x: cw / 2, y: ch * 0.68, r: L.btn * 0.75 };
  }
  function star(x, y, r) { if (r <= 0) return; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, d = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } ctx.closePath(); ctx.fillStyle = '#FFD45E'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke(); }

  // ---------- map ----------
  let mapNodes = [];
  function drawMap() {
    ctx.fillStyle = '#E4F5DC'; ctx.fillRect(0, 0, cw, ch);
    const N = T.SHIPPED, cols = L.land ? 5 : 3, rows = Math.ceil(N / cols);
    const top = L.btn * 1.6, mx = cw * 0.1, w = cw - 2 * mx, h = ch - top - L.btn * 0.9;
    mapNodes = [];
    for (let k = 0; k < N; k++) {
      const row = Math.floor(k / cols), c0 = k % cols, c = row % 2 ? cols - 1 - c0 : c0;
      mapNodes.push({ n: k + 1, x: mx + w * (c + 0.5) / cols, y: ch - L.btn * 0.9 - h * (row + 0.5) / rows });
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [col, lw] of [[OUT, L.btn * 0.55], ['#FFE9B8', L.btn * 0.5]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(mapNodes[0].x, mapNodes[0].y); for (let k = 1; k < mapNodes.length - 1; k++) { const p = mapNodes[k], q = mapNodes[k + 1]; ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); } const z = mapNodes[mapNodes.length - 1]; ctx.lineTo(z.x, z.y); ctx.stroke(); }
    // title rings
    const tr = Math.min(cw, ch) * 0.05;
    ['#F796A0', '#FFDE7D', '#8CD6AA', '#8CB8F0', '#C4A0E8'].forEach((c, k) => { const x = cw / 2 + (k - 2) * tr * 1.5, y = L.btn * 0.8; arcStroke(x, y, tr, -0.9 + k + 0.4, -0.9 + k - 0.4 + TAU, tr * 0.3, c); });
    const rr = Math.min(L.btn * 0.62, w / cols * 0.3, h / rows * 0.3);
    for (const p of mapNodes) {
      const done = store.done[p.n], cur = p.n === store.unlocked && !done, open = p.n <= store.unlocked;
      const r = cur ? rr * (1.15 + 0.05 * Math.sin(now / 300)) : rr;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fillStyle = open ? T.COLORS[(p.n - 1) % 6] : '#D9D6E0'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.fillStyle = open ? '#FFFFFF' : '#A9A3B5'; ctx.font = `bold ${r * 1.0}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = OUT; if (open) ctx.strokeText(String(p.n), p.x, p.y + 2); ctx.fillText(String(p.n), p.x, p.y + 2);
      if (done) for (let s = 0; s < 3; s++) star(p.x + (s - 1) * r * 0.62, p.y + r * 1.15, r * 0.26);
      p.r = r;
    }
  }

  // ---------- input ----------
  function pickRing(w) {
    let best = null;
    S.rings.forEach((R, i) => {
      if (!R.alive) return; const g = gripPos(R);
      const dg = Math.min(Math.hypot(w.x - g.bx, w.y - g.by), Math.hypot(w.x - (g.sx + g.bx) / 2, w.y - (g.sy + g.by) / 2));
      if (dg < 70 && (!best || best.kind !== 'grip' || dg < best.d)) best = { i, kind: 'grip', d: dg };
    });
    if (best) return best;
    S.rings.forEach((R, i) => {
      if (!R.alive) return; const d = Math.abs(Math.hypot(w.x - R.x, w.y - R.y) - R.r);
      if (d < RW / 2 + 26 && (!best || d < best.d)) best = { i, kind: 'ring', d };
    });
    return best;
  }
  function handle(ev, i) {
    for (const e of ev) {
      if (e.type === 'unlink') { sfx.click(); }
      if (e.type === 'free') {
        const R = S.rings[e.i], D = R._door || doorFor(e.i); doorGlow[e.i] = now; setTimeout(sfx.free, 60);
        anims.push({ R: Object.assign({}, R), t0: now, dx: D.x, dy: D.y }); if (drag && drag.i === e.i) drag = null;
        if (hint && hint.i === e.i) hint = null; setTimeout(() => settleGrips(), 250);
      }
      if (e.type === 'bump' && (!wobble[i] || now - wobble[i] > 350)) { wobble[i] = now; sfx.bump(); }
    }
    if (!won && S.rings.every(R => !R.alive)) {
      setTimeout(() => { won = performance.now(); sfx.win(); store.done[level] = 1; store.unlocked = Math.max(store.unlocked, level + 1); save(); }, 750);
      won = -1;
    }
  }
  let lastTick = 0;
  function down(px, py, id) {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } else if (ac.state === 'suspended') ac.resume();
    if (screen === 'map') {
      for (const p of mapNodes) if (Math.hypot(px - p.x, py - p.y) < p.r * 1.3 && p.n <= store.unlocked) { sfx.tap(); start(p.n); return; }
      return;
    }
    if (won > 0) { if (L.nextBtn && Math.hypot(px - L.nextBtn.x, py - L.nextBtn.y) < L.nextBtn.r * 1.4) { sfx.tap(); if (level < T.SHIPPED) start(level + 1); else screen = 'map'; } return; }
    if (won) return;
    if (drag) return;
    if (Math.hypot(px - L.home.x, py - L.home.y) < L.btn * 0.6) { sfx.tap(); screen = 'map'; return; }
    for (const b of L.bt) if (Math.hypot(px - b.x, py - b.y) < L.btn * 0.6) { button(b.id); return; }
    if (drag) return; // one ring at a time: extra fingers are ignored (mash-proof)
    const w = toW(px, py), hit = pickRing(w); if (!hit) return; ease = null;
    const R = S.rings[hit.i];
    drag = { id, i: hit.i, kind: 'grip', last: w, ang: Math.atan2(w.y - R.y, w.x - R.x), snap: JSON.stringify(T.clone(S)) };
  }
  function move(px, py, id) {
    if (!drag || drag.id !== id || screen !== 'play') return;
    const w = toW(px, py), R = S.rings[drag.i]; if (!R.alive) { drag = null; return; }
    if (drag.kind === 'grip') {
      const a = Math.atan2(w.y - R.y, w.x - R.x), want = T.norm(a - drag.ang);
      const before = Math.floor(R.rot / (Math.PI / 12));
      const r = T.rotateCollect(S, drag.i, want); drag.ang += r.done; R.gripA += r.done; R.gripT = undefined;
      if (Math.floor(R.rot / (Math.PI / 12)) !== before && now - lastTick > 40) { sfx.tick(); lastTick = now; }
      handle(r.ev, drag.i);
    }
  }
  function up(id) {
    if (!drag || drag.id !== id) return; const ds = drag.snap, di = drag.i, kind = drag.kind;
    const R = S.rings[di];
    if (R.alive && kind === 'grip') { // gentle snap to nearest 15deg notch
      const mg = T.magnet(S, di, 0.6), step = Math.PI / 12, d0 = mg !== null ? mg : Math.round(R.rot / step) * step - R.rot; if (Math.abs(d0) > 0.001) { ease = { i: di, left: d0 }; }
    }
    if (S.rings.some(Q => Q.alive) && !T.solve(S)) { // never leave Molly stuck: a move into a dead end gently springs back
      const tr = S.tray; S = JSON.parse(ds); S.tray = tr; placeDoors(); wobble[di] = now; sfx.bump(); drag = null; return;
    }
    drag = null; settleGrips();
    if (JSON.stringify(T.clone(S)) !== ds || ease) { undo.push(ds); if (undo.length > 200) undo.shift(); hint = null; }
  }
  function button(id) {
    sfx.tap(); ease = null;
    if (id === 'undo' && undo.length) { const tr = S.tray; S = JSON.parse(undo.pop()); S.tray = S.tray || tr; placeDoors(); anims = []; hint = null; }
    if (id === 'restart') { undo.push(JSON.stringify(T.clone(S))); const tr = S.tray; S = T.getLevel(level); S.rings.forEach(R => R.gripA = R.rot + R.gripOff); S.tray = tr; placeDoors(); anims = []; hint = null; }
    if (id === 'hint') { const sol = T.solve(S); if (sol && sol.length) hint = { i: sol[0].i, delta: sol[0].delta, t0: now }; }
  }
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture?.(e.pointerId); down(e.offsetX, e.offsetY, e.pointerId); });
  cv.addEventListener('pointermove', e => { e.preventDefault(); move(e.offsetX, e.offsetY, e.pointerId); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) cv.addEventListener(t, e => up(e.pointerId));
  window.addEventListener('resize', () => { const t = S && S.tray; layout(); if (S && screen === 'play') { fitView(); placeDoors(); } }); window.addEventListener('orientationchange', () => setTimeout(layout, 200));
  document.addEventListener('gesturestart', e => e.preventDefault());

  function frame(t) {
    now = t; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = BG; ctx.fillRect(0, 0, cw, ch);
    if (screen === 'map') drawMap(); else drawPlay();
    requestAnimationFrame(frame);
  }
  // test hooks (local only, harmless)
  window.__ttr = { start, get S() { return S; }, set S(v) { S = v; }, get screen() { return screen; }, get won() { return won; }, handle, store, toScreen: (x, y) => ({ x: L.board.ox + x * L.board.k, y: L.board.oy + y * L.board.k }), down, move, up };
  layout(); requestAnimationFrame(frame);
  // #autotest=N : plays levels 1..N through the real pointer handlers (finger drags on the T-grips)
  const pm = location.hash.match(/play=(\d+)/); if (pm) start(+pm[1]);
  const mm = location.hash.match(/mash=(\d+)/);
  if (mm) setTimeout(async () => {
    const out = []; const R = (a) => Math.random() * a; const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let n = 1; n <= +mm[1]; n++) {
      start(n); let bad = '';
      for (let k = 0; k < 2500; k++) {
        const id = 1 + Math.floor(R(4)), x = R(cw), y = R(ch), t = R(1);
        if (t < 0.25) down(x, y, id); else if (t < 0.85) move(x, y, id); else up(id);
        if (screen !== 'play') start(n);
        if (k % 50 === 0) await wait(1);
      }
      for (let id = 1; id <= 4; id++) up(id);
      const L0 = T.getLevel(level); S.rings.forEach((Q, k) => { if (Math.abs(Q.x - L0.rings[k].x) + Math.abs(Q.y - L0.rings[k].y) > 1e-6) bad = 'moved'; });
      for (const Q of S.rings) { if (!isFinite(Q.x + Q.y + Q.rot + Q.gripA)) bad = 'nan'; if (Q.alive && (Q.x - Q.r < S.tray.x0 || Q.x + Q.r > S.tray.x1 || Q.y - Q.r < S.tray.y0 || Q.y + Q.r > S.tray.y1)) bad = 'outside'; }
      const sol = S.rings.some(Q => Q.alive) ? T.solve(S) : [];
      out.push(n + ':' + (bad || (sol ? 'ok' : 'stuck')));
    }
    document.title = 'MASH ' + out.join(' ');
  }, 300);
  const m = location.hash.match(/autotest=(\d+)/);
  if (m) setTimeout(async () => {
    const res = []; const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let n = 1; n <= +m[1]; n++) {
      start(n); await wait(50); let guard = 0;
      while (S.rings.some(R => R.alive) && guard++ < 40) {
        const sol = T.solve(S); if (!sol) break; const mv = sol[0], R = S.rings[mv.i];
        const g = gripPos(R), p = window.__ttr.toScreen(g.bx, g.by); down(p.x, p.y, 99);
        const sh = location.hash.includes('nearmiss') && Math.abs(mv.delta) > 0.45 ? Math.sign(mv.delta) * 0.4 : 0; mv.delta -= sh; const steps = Math.max(1, Math.ceil(Math.abs(mv.delta) / 0.08));
        for (let k = 1; k <= steps; k++) { const a = R.rot + R.gripOff + Math.sign(mv.delta) * 0.08 * 0 + 0, ang = (g.a) + mv.delta * k / steps, d = R.r + RW / 2 + 44, q = window.__ttr.toScreen(R.x + Math.cos(ang) * d, R.y + Math.sin(ang) * d); move(q.x, q.y, 99); await wait(5); }
        up(99); await wait(sh ? 700 : 20);
      }
      await wait(900); res.push(n + ':' + (won > 0 ? 'WIN' : 'FAIL'));
    }
    document.title = 'AUTOTEST ' + res.join(' '); console.log(document.title);
  }, 300);
})();
