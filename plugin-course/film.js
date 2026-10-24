// คอร์สการใช้ปลั๊กอิน: pure function of time. window.seek(t) paints frame t (see lib/motion.js).
// Timing is in beats (u) on the measured grid; docs/shotlist.md is the plan this file follows.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, springU, springKeys, SPRING, wobble, font, fill, rrect, shake, mix } = M;

// Graphite + warm paper, one accent (amber).
const C = { ink: '#15171C', ink2: '#232631', paper: '#F3EFE6', accent: '#FFB020', mute: '#8A8F9C' };
const DISPLAY = 'Display', UI = 'UI';
const P = FORMAT.portrait;

const HITS = [
  [0, 'hook 2x slams', 'impact'],
  [1, 'เร็วขึ้น', 'pop', { pitch: 'E5' }],
  [3.5, '2x collapses', 'whoosh', { len: 0.4 }],
  [4, 'plug appears', 'pop', { pitch: 'A5' }],
  [6, 'plug clicks in', 'thud'],
  [6.5, 'ช่วยคุณได้', 'blip', { pitch: 'E6' }],
  [7.75, 'push-through', 'whoosh', { len: 0.5, from: 500, to: 3000 }],
  [8, 'line 1', 'click'],
  [9.5, 'check', 'bell', { pitch: 'A5' }],
  [10, 'line 2', 'click'],
  [12, 'glitch', 'thud', { pitch: 60, to: 30 }],
  [13.5, 'pieces fall', 'whoosh', { len: 0.4, from: 2400, to: 400 }],
  [15.5, 'pieces land', 'tick'],
  [16, 'drop: 3 steps', 'impact'],
  [17, 'step 1 chip', 'pop', { pitch: 'A5' }],
  [18, 'step 2 chip', 'pop', { pitch: 'C6' }],
  [19, 'step 3 chip', 'pop', { pitch: 'E6' }],
  [20, 'whip to step 1', 'whoosh', { len: 0.4 }],
  [22, 'progress', 'tick'], [24, 'progress', 'tick'], [26, 'progress', 'tick'],
  [27, 'installed', 'bell', { pitch: 'E6' }],
  [28, 'whip to step 2', 'whoosh', { len: 0.4, pan: 0.3 }],
  [30, 'toggle 1', 'tick'], [32, 'toggle 2', 'tick'], [34, 'toggle 3', 'tick'],
  [36, 'whip to step 3', 'whoosh', { len: 0.4, pan: -0.3 }],
  [38, 'block 1', 'pop', { pitch: 'A4' }], [39.5, 'block 2', 'pop', { pitch: 'C5' }],
  [41, 'block 3', 'pop', { pitch: 'E5' }], [42.5, 'block 4', 'pop', { pitch: 'A5' }],
  [48, 'end card', 'impact'],
  [50, 'CTA', 'bell', { pitch: 'A5' }],
];

// ---------------------------------------------------------------- Thai-safe type
// Thai stacks vowels and tone marks on their consonant, so type animates per word
// (Intl.Segmenter), never per code point: splitting a cluster breaks the shaping.
const SEG = new Intl.Segmenter('th', { granularity: 'word' });
const wcache = new Map();
function words(ctx, str, f) {
  const key = f + '|' + str;
  if (wcache.has(key)) return wcache.get(key);
  ctx.font = f;
  const segs = [...SEG.segment(str)].map((s) => s.segment);
  let acc = '';
  const out = segs.map((s) => { const x = ctx.measureText(acc).width; acc += s; return { s, x, w: ctx.measureText(s).width }; });
  const L = { segs: out, width: ctx.measureText(str).width };
  wcache.set(key, L);
  return L;
}
// Words rise in on a spring, one after another, clipped below the baseline line so they slide up
// out of a slot rather than fading in.
function typeIn(ctx, str, x, y, size, weight, family, color, u, u0, o = {}) {
  const { stagger = 0.18, align = 'left', cfg = SPRING.snappy, out = 1e9, outLen = 0.5 } = o;
  const f = font(size, weight, family);
  const L = words(ctx, str, f);
  const x0 = align === 'center' ? x - L.width / 2 : x;
  ctx.save();
  ctx.beginPath(); ctx.rect(-4 * W, y - size * 1.5, 9 * W, size * 1.95); ctx.clip();
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = 'left';
  L.segs.forEach((g, i) => {
    const k = springU(u, u0 + i * stagger, cfg);
    if (k <= 0) return;
    const ex = E.inBack(prog(u, out + i * 0.06, out + outLen + i * 0.06), 1.6);
    ctx.fillText(g.s, x0 + g.x, y + (1 - k) * size * 1.3 - ex * size * 1.6);
  });
  ctx.restore();
  return L.width;
}

// ---------------------------------------------------------------- the plug motif
// A jigsaw piece: rounded square, knob on the right, notch on the left. Plugs into a socket.
function piecePath(ctx, x, y, s) {
  const r = s * 0.16, k = s * 0.17;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + s - r, y); ctx.arcTo(x + s, y, x + s, y + r, r);
  ctx.lineTo(x + s, y + s / 2 - k);
  ctx.arc(x + s + k * 0.55, y + s / 2, k, Math.PI * 1.25, Math.PI * 0.75, false);
  ctx.lineTo(x + s, y + s - r); ctx.arcTo(x + s, y + s, x + s - r, y + s, r);
  ctx.lineTo(x + r, y + s); ctx.arcTo(x, y + s, x, y + s - r, r);
  ctx.lineTo(x, y + s / 2 + k);
  ctx.arc(x + k * 0.55, y + s / 2, k, Math.PI * 0.75, Math.PI * 1.25, true);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
function piece(ctx, cx, cy, s, color, { rot = 0, sx = 1, sy = 1, label = null, labelColor = C.ink } = {}) {
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sx, sy);
  piecePath(ctx, -s / 2, -s / 2, s);
  ctx.fillStyle = color; ctx.fill();
  if (label) {
    ctx.font = font(s * 0.5, 800, DISPLAY); ctx.fillStyle = labelColor; ctx.textAlign = 'center';
    ctx.fillText(label, 0, s * 0.18);
  }
  ctx.restore();
}
function check(ctx, cx, cy, s, color, p) {
  if (p <= 0) return;
  const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.32]];
  const l1 = Math.hypot(0.3, 0.3), l2 = Math.hypot(0.57, 0.64), d = p * (l1 + l2);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.lineWidth = 0.16; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  if (d <= l1) ctx.lineTo(lerp(pts[0][0], pts[1][0], d / l1), lerp(pts[0][1], pts[1][1], d / l1));
  else { ctx.lineTo(...pts[1]); const q = (d - l1) / l2; ctx.lineTo(lerp(pts[1][0], pts[2][0], q), lerp(pts[1][1], pts[2][1], q)); }
  ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------- S1 hook   (u 0..4)
function sceneHook(ctx, u) {
  fill(ctx, C.ink);
  const s = FORMAT.safe;
  ctx.save();
  shake(ctx, u, 0, 26, 3, 0.25);
  const size = P ? 620 : 640;
  const cx = P ? W / 2 : s.x + s.w * 0.36, cy = P ? s.y + s.h * 0.3 : H * 0.6;
  // slams down from above with a squash on landing; already moving on frame 0
  const k = springU(u, -0.35, SPRING.bouncy);
  const q = 0.12 * wobble(u - 0.05, 2.0, 4);
  // 3.5..4: collapses (log scale) toward where the plug will appear
  const c = prog(u, 3.4, 4.0);
  const sc = 1 * (0.02 / 1) ** E.inCubic(c);
  const px = P ? W * 0.3 : W * 0.24, py = P ? H * 0.5 : H * 0.5;
  const x = lerp(cx, px, E.inCubic(c)), y = lerp(cy - (1 - k) * 700, py, E.inCubic(c));
  ctx.translate(x, y); ctx.scale(sc * (1 + q), sc * (1 - q));
  ctx.font = font(size, 800, DISPLAY); ctx.fillStyle = C.accent; ctx.textAlign = 'center';
  ctx.fillText('2×', 0, size * 0.32);
  ctx.restore();
  const ts = P ? 150 : 170;
  const tx = P ? W / 2 : s.x + s.w * 0.68, ty = P ? s.y + s.h * 0.78 : H * 0.62;
  typeIn(ctx, 'เร็วขึ้น', tx, ty, ts, 800, DISPLAY, C.paper, u, 1, { align: P ? 'center' : 'left', out: 3.3 });
  typeIn(ctx, 'ทำงานได้', tx, ty - ts * 1.35, ts * 0.42, 600, UI, C.mute, u, 0.6, { align: P ? 'center' : 'left', out: 3.2 });
}

// ---------------------------------------------------------------- S2 plug in   (u 4..8)
function scenePlug(ctx, u) {
  fill(ctx, C.ink);
  const s = FORMAT.safe;
  const ps = P ? 300 : 300;
  // socket: a slot in a long bar, labelled
  const sx = P ? W / 2 : W * 0.62, sy = P ? s.y + s.h * 0.36 : H * 0.44;
  // push-through: 7.6..8 the slot scales up (log) until its paper interior fills the frame
  const pt = prog(u, 7.55, 8.0);
  const z = 1 * (14 / 1) ** E.inCubic(pt);
  ctx.save();
  M.zoomAbout(ctx, z, sx, sy);
  // socket outline (inner) — the plug's own silhouette, scaled up a touch
  ctx.save(); ctx.translate(sx, sy); ctx.scale(1.12, 1.12);
  piecePath(ctx, -ps / 2, -ps / 2, ps); ctx.fillStyle = C.ink2; ctx.fill();
  ctx.lineWidth = 6; ctx.setLineDash([18, 14]); ctx.strokeStyle = mix(C.mute, C.ink, 0.3); ctx.stroke();
  ctx.restore();
  // plug flies in from the left, lands at 6 with a wobble
  const k = springU(u, 4, SPRING.gentle);
  const land = springU(u, 5.6, SPRING.snappy);
  const fromX = P ? W * 0.3 : W * 0.24;
  const x = lerp(fromX, lerp(fromX, sx, 0.82), k);
  const px = lerp(x, sx, land), py = sy;
  const pop = springU(u, 4, SPRING.bouncy);
  const w = 0.1 * wobble(u - 6, 2.4, 5);
  piece(ctx, px, py, ps, C.accent, { sx: pop * (1 - w), sy: pop * (1 + w), rot: (1 - land) * -0.25 });
  // interior turns paper as we push through, so the next shot's background is already here
  if (pt > 0) { ctx.save(); ctx.globalAlpha = E.inQuad(pt); ctx.translate(sx, sy); piecePath(ctx, -ps / 2, -ps / 2, ps); ctx.fillStyle = C.paper; ctx.fill(); ctx.restore(); }
  ctx.restore();
  if (pt > 0.6) fill(ctx, C.paper);
  if (pt > 0.05) return;
  const ts = P ? 120 : 130;
  const lx = P ? W / 2 : s.x, ly = P ? s.y + s.h * 0.72 : H * 0.36;
  const al = P ? 'center' : 'left';
  typeIn(ctx, 'ปลั๊กอินที่ดี', lx, ly, ts, 800, DISPLAY, C.paper, u, 4.4, { align: al });
  typeIn(ctx, 'ช่วยคุณได้', lx, ly + ts * 1.15, ts, 800, DISPLAY, C.accent, u, 6.5, { align: al });
}

// ---------------------------------------------------------------- S3 problem   (u 8..16)
function sceneProblem(ctx, u) {
  fill(ctx, C.paper);
  const s = FORMAT.safe;
  const ts = P ? 130 : 150;
  const lx = P ? s.x + 10 : s.x + 40;
  const y1 = P ? s.y + s.h * 0.3 : H * 0.4, y2 = y1 + ts * 1.35;
  const w1 = typeIn(ctx, 'ติดตั้งแล้ว', lx, y1, ts, 800, DISPLAY, C.ink, u, 8, { out: 14.2 });
  // check mark draws on at 9.5
  const ck = E.outCubic(prog(u, 9.5, 10.2)) * (1 - prog(u, 14.2, 14.6));
  check(ctx, lx + w1 + ts * 0.6, y1 - ts * 0.33, ts * 0.8, mix(C.accent, C.ink, 0.15), ck);
  // line 2 glitches at 12: horizontal slice offsets, decaying
  ctx.save();
  const g = u >= 12 && u < 14 ? Math.exp(-(u - 12) * 1.2) : 0;
  shake(ctx, u, 12, 18, 7, 0.3);
  const vis = u < 13.5;
  if (vis) typeIn(ctx, 'แต่ใช้ไม่เป็น', lx, y2, ts, 800, DISPLAY, C.ink, u, 10);
  ctx.restore();
  if (g > 0.02 && vis) {
    // slice glitch: copy bands of the line sideways (deterministic offsets)
    const bands = 6, top = y2 - ts, bh = (ts * 1.3) / bands;
    for (let b = 0; b < bands; b++) {
      const off = g * 60 * M.noise1(u * 20 + b * 3.1, 11);
      ctx.drawImage(ctx.canvas, 0, top + b * bh, W, bh, off, top + b * bh, W, bh);
    }
  }
  // 13.5: the broken line becomes three pieces that fall and land in a row at 15.5
  if (u >= 13.5) {
    const L = words(ctx, 'แต่ใช้ไม่เป็น', font(ts, 800, DISPLAY));
    const ps = P ? 200 : 190;
    const rowY = P ? s.y + s.h * 0.78 : H * 0.8;
    for (let i = 0; i < 3; i++) {
      const sx0 = lx + (L.width * (i + 0.5)) / 3, sy0 = y2 - ts * 0.35;
      const tx = W / 2 + (i - 1) * ps * 1.35, ty = rowY;
      const f = E.outBounce(prog(u, 13.5 + i * 0.25, 15.5));
      const xx = lerp(sx0, tx, E.outCubic(prog(u, 13.5 + i * 0.25, 15.3)));
      const yy = lerp(sy0, ty, f);
      const sc = lerp(0.4, 1, E.outCubic(prog(u, 13.5, 14.5)));
      piece(ctx, xx, yy, ps, C.ink, { sx: sc, sy: sc, rot: (1 - f) * (i - 1) * 0.6 });
    }
  }
}

// ---------------------------------------------------------------- S4 three steps   (u 16..20)
function stepsRow(ctx, u, base) {
  const s = FORMAT.safe;
  const ps = P ? 200 : 190;
  const rowY = P ? s.y + s.h * 0.78 : H * 0.8;
  for (let i = 0; i < 3; i++) {
    const k = springU(u, 17 + i, SPRING.bouncy);
    const tx = W / 2 + (i - 1) * ps * 1.35;
    const lift = (1 - prog(u, 19.6, 20)) ;
    const col = k > 0.02 ? C.accent : C.paper;
    const sc = 1 + 0.18 * wobble(u - 17 - i, 2.2, 4);
    piece(ctx, tx, rowY - k * 30 * lift, ps, col, { sx: sc, sy: sc, label: k > 0.02 ? String(i + 1) : null, labelColor: C.ink });
  }
}
function sceneSteps(ctx, u) {
  fill(ctx, C.ink);
  const s = FORMAT.safe;
  ctx.save();
  shake(ctx, u, 16, 22, 5, 0.2);
  const ts = P ? 150 : 170;
  const al = P ? 'center' : 'left';
  const lx = P ? W / 2 : s.x + 40;
  const ly = P ? s.y + s.h * 0.3 : H * 0.36;
  typeIn(ctx, 'ในคอร์สนี้ สอนครบ', lx, ly, ts * 0.42, 600, UI, C.mute, u, 15.9, { align: al });
  typeIn(ctx, '3 ขั้น', lx, ly + ts * 1.55, ts * 1.25, 800, DISPLAY, C.paper, u, 16, { align: al, cfg: SPRING.bouncy });
  stepsRow(ctx, u);
  ctx.restore();
}

// ---------------------------------------------------------------- S5-S7 step panels   (u 20..48)
// Three panels side by side (stacked in 9x16); the camera whips between them so both shots share
// the frame during each move.
function panelHeader(ctx, u, i, title, u0, ox, oy) {
  const s = FORMAT.safe;
  const ps = P ? 150 : 140;
  const hx = ox + s.x + ps / 2 + 10, hy = oy + s.y + (P ? 120 : 110);
  piece(ctx, hx, hy, ps, C.accent, { label: String(i), labelColor: C.ink });
  // landscape: label + title beside the piece; portrait: stacked under it, title fit to the width
  const tx = P ? ox + s.x : hx + ps * 0.95;
  const ly = P ? hy + ps * 1.0 : hy - ps * 0.5;
  let size = P ? 104 : 110;
  if (P) size = Math.min(size, Math.floor((size * s.w) / words(ctx, title, font(size, 800, DISPLAY)).width));
  typeIn(ctx, `ขั้นที่ ${i}`, tx, ly, 46, 600, UI, C.mute, u, u0 - 0.3);
  typeIn(ctx, title, tx, P ? ly + size * 1.45 : hy + ps * 0.42, size, 800, DISPLAY, C.paper, u, u0);
}
function panelInstall(ctx, u, ox, oy) {
  const s = FORMAT.safe;
  panelHeader(ctx, u, 1, 'ติดตั้งให้ถูกวิธี', 20.3, -ox, -oy);
  // progress bar fills in steps on the beat, 21..27
  const bw = P ? s.w : s.w * 0.8, bh = P ? 56 : 60;
  const bx = -ox + s.x + (P ? 0 : 10), by = -oy + (P ? s.y + s.h * 0.62 : H * 0.66);
  rrect(ctx, bx, by, bw, bh, bh / 2); ctx.fillStyle = C.ink2; ctx.fill();
  const steps = [[21, 0.0], [22, 0.3], [24, 0.6], [26, 0.85], [27, 1]];
  const p = springKeys(u, steps, SPRING.snappy);
  if (p > 0.01) { rrect(ctx, bx, by, bw * clamp(p), bh, bh / 2); ctx.fillStyle = C.accent; ctx.fill(); }
  const pct = Math.round(clamp(p) * 100);
  ctx.font = font(P ? 110 : 120, 800, DISPLAY); ctx.fillStyle = pct >= 100 ? C.accent : C.paper; ctx.textAlign = 'right';
  const sc = 1 + 0.15 * wobble(u - 27, 2.2, 4);
  ctx.save(); ctx.translate(bx + bw, by - 40); ctx.scale(sc, sc); ctx.fillText(pct + '%', 0, 0); ctx.restore();
  check(ctx, bx + 60, by - 80, 90, C.accent, E.outCubic(prog(u, 27, 27.6)));
}
function toggle(ctx, x, y, w, on, label) {
  const h = w * 0.52;
  rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = mix(C.ink2, C.accent, on); ctx.fill();
  const r = h * 0.4, kx = lerp(x + h / 2, x + w - h / 2, on);
  ctx.beginPath(); ctx.arc(kx, y + h / 2, r, 0, M.TAU); ctx.fillStyle = mix(C.mute, C.ink, on); ctx.fill();
  ctx.font = font(P ? 58 : 54, 600, UI); ctx.fillStyle = C.paper; ctx.textAlign = 'left';
  ctx.fillText(label, x + w + 36, y + h * 0.68);
}
function panelSettings(ctx, u, ox, oy) {
  const s = FORMAT.safe;
  panelHeader(ctx, u, 2, 'ตั้งค่าให้เหมาะกับงาน', 28.3, -ox, -oy);
  const labels = ['เปิดใช้งาน', 'ปรับให้เข้ากับงานคุณ', 'บันทึกการตั้งค่า'];
  const tw = P ? 170 : 150, gap = P ? 150 : 120;
  const x = -ox + s.x + (P ? 0 : 20), y0 = -oy + (P ? s.y + s.h * 0.42 : H * 0.42);
  labels.forEach((l, i) => {
    const on = springU(u, 30 + i * 2, SPRING.snappy);
    const k = springU(u, 28.6 + i * 0.25, SPRING.snappy);
    ctx.save(); ctx.globalAlpha = clamp(k); ctx.translate((1 - k) * 120, 0);
    toggle(ctx, x, y0 + i * gap, tw, clamp(on), l);
    ctx.restore();
  });
}
function panelUse(ctx, u, ox, oy) {
  const s = FORMAT.safe;
  // camera dolly into the top block 44..48 (log zoom), handing off to the end card
  const dz = prog(u, 44, 48);
  const ps = P ? 150 : 140;
  const base = P ? s.y + s.h * 0.92 : H * 0.88;
  const x0 = P ? s.x + 100 : W * 0.3;
  const step = P ? 190 : 210;
  const tops = [];
  for (let i = 0; i < 5; i++) tops.push([-ox + x0 + i * step * (P ? 0.78 : 1), -oy + base - i * (P ? 200 : 150)]);
  const [fx, fy] = tops[4];
  const z = 1 * (3.2 / 1) ** E.inOutCubic(dz);
  ctx.save();
  M.zoomAbout(ctx, z, fx, fy);
  ctx.globalAlpha = 1 - E.inQuad(prog(u, 46.5, 48));
  panelHeader(ctx, u, 3, 'ใช้งานจริงตั้งแต่วันแรก', 36.3, -ox, -oy);
  ctx.globalAlpha = 1;
  // growth line under the blocks
  const lp = E.inOutCubic(prog(u, 37.5, 44.5));
  if (lp > 0) {
    ctx.save(); ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.strokeStyle = mix(C.accent, C.ink, 0.45);
    ctx.beginPath(); ctx.moveTo(tops[0][0], tops[0][1] + ps * 0.7);
    const n = lp * 4, i = Math.floor(n), f = n - i;
    for (let j = 1; j <= i; j++) ctx.lineTo(tops[j][0], tops[j][1] + ps * 0.7);
    if (i < 4) ctx.lineTo(lerp(tops[i][0], tops[i + 1][0], f), lerp(tops[i][1], tops[i + 1][1], f) + ps * 0.7);
    ctx.stroke(); ctx.restore();
  }
  const at = [38, 39.5, 41, 42.5, 44];
  tops.forEach(([x, y], i) => {
    const k = springU(u, at[i], SPRING.bouncy);
    if (k <= 0) return;
    piece(ctx, x, y - (1 - k) * 260, ps, i === 4 ? C.accent : C.paper, { sx: k, sy: k });
  });
  ctx.restore();
}
function scenePanels(ctx, u) {
  fill(ctx, C.ink);
  // camera position in panel units, whips at 20 (from steps scene), 28, 36
  const cam = springKeys(u, [[0, 0], [28, 1], [36, 2]], SPRING.snappy);
  const ox = P ? 0 : cam * W, oy = P ? cam * H : 0;
  // entry from the steps row: 20..20.6 the panel set slides in from the right/bottom
  const ent = 1 - springU(u, 19.8, SPRING.snappy);
  ctx.save();
  ctx.translate(P ? 0 : ent * W, P ? ent * H : 0);
  ctx.save(); ctx.translate(0, 0); panelInstall(ctx, u, ox, oy); ctx.restore();
  ctx.save(); ctx.translate(P ? 0 : W, P ? H : 0); panelSettings(ctx, u, ox, oy); ctx.restore();
  ctx.save(); ctx.translate(P ? 0 : 2 * W, P ? 2 * H : 0); panelUse(ctx, u, ox, oy); ctx.restore();
  ctx.restore();
  // steps scene slides out as the panels slide in (whip with both on screen)
  if (ent > 0.002) {
    ctx.save(); ctx.translate(P ? 0 : (ent - 1) * W, P ? (ent - 1) * H : 0);
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    sceneSteps(ctx, 19.99);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- S8 end card   (u 48..56)
function sceneEnd(ctx, u) {
  fill(ctx, C.ink);
  const s = FORMAT.safe;
  ctx.save();
  shake(ctx, u, 48, 16, 9, 0.2);
  const ts = P ? 140 : 190;
  const al = P ? 'center' : 'left';
  const ps = P ? 220 : 200;
  // the zoomed block from the dolly lands as the logo piece
  const k = springU(u, 47.7, SPRING.bouncy);
  const lx = P ? W / 2 : s.x + ps / 2 + 20, ly = P ? s.y + s.h * 0.2 : H * 0.42;
  const sc = lerp(3.2, 1, k);
  piece(ctx, lx, ly, ps, C.accent, { sx: sc, sy: sc });
  const tx = P ? W / 2 : s.x + ps + 90;
  const y1 = P ? s.y + s.h * 0.45 : H * 0.4;
  typeIn(ctx, 'คอร์ส', tx, y1, ts * 0.45, 600, UI, C.mute, u, 48.3, { align: al });
  typeIn(ctx, 'การใช้ปลั๊กอิน', tx, y1 + ts * 1.4, ts, 800, DISPLAY, C.paper, u, 48.5, { align: al, stagger: 0.25 });
  // CTA pill pops at 50
  const pk = springU(u, 50, SPRING.bouncy);
  if (pk > 0) {
    ctx.font = font(P ? 64 : 58, 700, UI);
    const label = 'สมัครได้แล้ววันนี้';
    const tw = ctx.measureText(label).width, ph = P ? 120 : 108, pw = tw + ph * 1.2;
    const px = P ? W / 2 - pw / 2 : tx, py = y1 + ts * 1.85;
    ctx.save(); ctx.translate(px + pw / 2, py + ph / 2); ctx.scale(pk, pk);
    rrect(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2); ctx.fillStyle = C.accent; ctx.fill();
    ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.fillText(label, 0, ph * 0.18);
    ctx.restore();
  }
  ctx.restore();
}

M.film({
  fonts: [font(100, 800, DISPLAY), font(40, 600, UI)],
  hits: HITS,
  draw(ctx, u) {
    if (u < 4) sceneHook(ctx, u);
    else if (u < 8) scenePlug(ctx, u);
    else if (u < 16) sceneProblem(ctx, u);
    else if (u < 20) sceneSteps(ctx, u);
    else if (u < 48) scenePanels(ctx, u);
    else sceneEnd(ctx, u);
  },
  // the one full flash of the film: the drop at beat 16
  post(ctx, u) {
    const f = u >= 16 ? Math.exp(-(u - 16) * 6) : 0;
    if (f > 0.01) { ctx.globalAlpha = f * 0.85; fill(ctx, C.paper); ctx.globalAlpha = 1; }
  },
});
