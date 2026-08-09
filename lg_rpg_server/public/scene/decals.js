// Static map branding (LG / GSoC logos), drawn as DOM images layered over the canvas so they rasterise at the display's real resolution instead of the 360px-wide render target. Placement is still authored in Tiled exactly as before: the decal's `name` is the object layer, its first rectangle is the box, and the image is contained (never stretched) and centred inside.
import { GAME_VIEW } from '../shared_constants.js';
import { createOverlay } from './dom_overlay.js';

// Keep map branding smaller than its Tiled box; GSoC gets a slight boost to match LG's visual footprint.
const DECAL_SCALE_FACTOR = 0.8;
const GSOC_SCALE_FACTOR = 0.88;

// The overlay sits above the canvas, so the lobby's waiting screen can't cover the logos the way it did when they were map-depth images; they have to be hidden outright, as the leaderboard text is.
const shouldShow = (scene) => !scene.waitingObjects?.length;

export function createDecals(scene, map, mapConfig) {
  const overlay = createOverlay(scene);
  const decals = [];
  scene.decals = null;

  (mapConfig.decals || []).forEach(def => {
    const box = map.getObjectLayer(def.name)?.objects?.[0];
    if (!box) { console.warn(`Decal box not found: ${def.name}`); return; }
    const x = box.x - scene.cameraOffset;
    // Claimed by the screen holding the box's centre, matching the leaderboard's rule, so a straddling box never draws a clipped copy on both screens.
    const centreX = x + box.width / 2;
    if (centreX < 0 || centreX >= GAME_VIEW.screenWidth) return;

    const img = new Image();
    // The canvas upscale is nearest (pixelArt: true), but branding wants the browser's smooth filter.
    Object.assign(img.style, { position: 'absolute', imageRendering: 'auto', visibility: 'hidden' });
    const entry = { img, box, x, factor: def.name === 'gsoc' ? GSOC_SCALE_FACTOR : DECAL_SCALE_FACTOR, ready: false };
    // Natural size is only known once the image lands, so the first layout waits for it.
    img.onload = () => { entry.ready = true; overlay.refresh(); };
    img.onerror = () => console.warn(`Decal image failed to load: ${def.path}`);
    img.src = `assets/${def.path}`;
    decals.push(entry);
    overlay.add(img);
  });

  if (!decals.length) return;
  // `visible` only memoises the last applied state so update doesn't touch the DOM every frame; the layout pass reads shouldShow directly, since it can run before the lobby overlay exists.
  scene.decals = { entries: decals, visible: shouldShow(scene) };

  overlay.onLayout(({ sx, sy, left, top }) => {
    for (const d of decals) {
      if (!d.ready) continue;
      const scale = Math.min(d.box.width / d.img.naturalWidth, d.box.height / d.img.naturalHeight) * d.factor;
      const w = d.img.naturalWidth * scale, h = d.img.naturalHeight * scale;
      Object.assign(d.img.style, {
        left: `${left + (d.x + (d.box.width - w) / 2) * sx}px`,
        top: `${top + (d.box.y + (d.box.height - h) / 2) * sy}px`,
        width: `${w * sx}px`,
        height: `${h * sy}px`,
        visibility: shouldShow(scene) ? 'visible' : 'hidden',
      });
    }
  });
}

export function updateDecals(scene) {
  const decals = scene.decals;
  if (!decals) return;
  const wantVisible = shouldShow(scene);
  if (wantVisible === decals.visible) return;
  decals.visible = wantVisible;
  for (const d of decals.entries) {
    if (d.ready) d.img.style.visibility = wantVisible ? 'visible' : 'hidden';
  }
}
