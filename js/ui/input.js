// Touch and mouse handling for the map: drag to pan, pinch or wheel to zoom, tap to act.
import { camera, clampCamera, requestDraw, screenToTile, setZoom } from './render.js';

export function initInput(canvas, onTap) {
  const pts = new Map();
  let tap = null;     // candidate tap, cancelled once the finger moves
  let pinch = null;

  const startPinch = () => {
    const [a, b] = [...pts.values()];
    const r = canvas.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    pinch = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: camera.z,
      wx: mx / camera.z + camera.x, wy: my / camera.z + camera.y,
    };
  };

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) tap = { x: e.clientX, y: e.clientY, moved: false };
    else { tap = null; if (pts.size === 2) startPinch(); }
  });

  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 1 && !pinch) {
      if (tap && !tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 9) return;
      if (tap) tap.moved = true;
      camera.x -= dx / camera.z;
      camera.y -= dy / camera.z;
      clampCamera();
      requestDraw();
    } else if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()];
      const r = canvas.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const z = Math.min(2.5, Math.max(0.4, pinch.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
      camera.z = z;
      camera.x = pinch.wx - mx / z;
      camera.y = pinch.wy - my / z;
      clampCamera();
      requestDraw();
    }
  });

  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      if (tap && !tap.moved && e.type === 'pointerup') onTap(...screenToTile(e.clientX, e.clientY));
      tap = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    setZoom(camera.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // iOS Safari fires its own gesture events for pinches; stop it from zooming the page.
  document.addEventListener('gesturestart', e => e.preventDefault());
}
