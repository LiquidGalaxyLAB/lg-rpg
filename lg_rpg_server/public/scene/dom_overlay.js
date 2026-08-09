// Shared host and coordinate mapping for DOM elements layered over the game canvas. The canvas renders at GAME_VIEW size and is nearest-upscaled to the wall, so anything drawn inside it is capped at that resolution — a logo gets ~95px across, panel text ~12px. Elements placed here rasterise at the display's real resolution instead, which is what keeps branding and text sharp; callers still author position in map space, only the rasteriser moves.
import { GAME_VIEW } from '../shared_constants.js';

// Lives on <body> rather than #game-container, whose innerHTML showScreenNotice replaces wholesale.
function overlayHost() {
  const existing = document.getElementById('dom-overlay');
  if (existing) return existing;
  const host = document.createElement('div');
  host.id = 'dom-overlay';
  Object.assign(host.style, {
    position: 'fixed', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '10',
  });
  document.body.appendChild(host);
  return host;
}

// One overlay per scene, shared by every caller, so the canvas is measured once per resize.
export function createOverlay(scene) {
  if (scene.domOverlay) return scene.domOverlay;

  const canvas = scene.game.canvas;
  const host = overlayHost();
  const elements = [];
  const listeners = [];

  // Scale.FIT letterboxes the canvas inside the window, so screen space maps to page pixels through the canvas's measured rect, not the window's. getBoundingClientRect is used in preference to the ScaleManager's own bounds because it behaves the same across Phaser versions.
  function layout() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const view = {
      sx: rect.width / GAME_VIEW.screenWidth,
      sy: rect.height / GAME_VIEW.screenHeight,
      left: rect.left,
      top: rect.top,
    };
    for (const fn of listeners) fn(view);
  }

  const overlay = {
    add(el) { host.appendChild(el); elements.push(el); return el; },
    // Callbacks receive the current canvas rect and take coordinates already in screen space (map x minus the scene's camera offset).
    onLayout(fn) { listeners.push(fn); layout(); },
    refresh: layout,
  };

  // Scale.FIT settles a frame after create(), so the rect measured right now is the wrong size.
  requestAnimationFrame(layout);
  window.addEventListener('resize', layout);
  scene.events.once('shutdown', () => {
    window.removeEventListener('resize', layout);
    elements.forEach(el => el.remove());
    elements.length = 0;
    listeners.length = 0;
    scene.domOverlay = null;
  });

  scene.domOverlay = overlay;
  return overlay;
}
