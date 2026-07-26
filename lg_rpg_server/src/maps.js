import fs from 'fs';
import path from 'path';
import {
  assertGameModesMatchManifest,
  ASSET_MANIFESTS,
  GAME_MODES,
  GAME_VIEW,
  MAP_TILE_SIZE,
  mapTilesForScreens,
  SERVER_CONFIG,
} from '../game_constants.js';
import { publicDir } from './paths.js';
import { state } from './state.js';

const mapsManifestPath = path.join(publicDir, ASSET_MANIFESTS.maps);
export const mapsManifest = JSON.parse(fs.readFileSync(mapsManifestPath, 'utf8'));

// Warns when the leaderboard rectangle leaves the displayed area — the map's last tile column is rounding spare and never rendered, so checking against the full tile width let a box silently clip.
function checkLeaderboardBox(label, tmj, displayedWidth) {
  const layer = tmj.layers.find((l) => l.type === 'objectgroup' && l.name === 'leaderboard');
  const box = layer?.objects?.find((o) => o.width > 0 && o.height > 0);
  if (!box) return;
  if (box.x >= 0 && box.y >= 0 && box.x + box.width <= displayedWidth && box.y + box.height <= GAME_VIEW.screenHeight) return;
  console.warn(`[map] ${label}: leaderboard box (${box.x},${box.y} to ${box.x + box.width},${box.y + box.height}) leaves the displayed ${displayedWidth}x${GAME_VIEW.screenHeight}px area and will be clipped.`);
}

// Counts the drawn rectangles behind a manifest zone name, so a layer that exists but is empty still reads as missing.
function zoneRectCounter(tmj, mapConfig) {
  const objectLayers = mapConfig.objectLayers || {};
  return (logicalName) => {
    const tiledName = objectLayers[logicalName];
    if (!tiledName) return 0;
    const layer = tmj.layers.find((l) => l.type === 'objectgroup' && l.name === tiledName);
    return (layer?.objects || []).filter((o) => o.width > 0 && o.height > 0).length;
  };
}

// Fails fast when a map is missing zones its mode cannot run without.
function checkRequiredZones(label, tmj, mapConfig, required, why) {
  const rectCount = zoneRectCounter(tmj, mapConfig);
  const missing = required.filter((zone) => rectCount(zone) === 0);
  if (missing.length) {
    throw new Error(
      `${label}: map has no ${missing.join(', ')} rectangle(s). `
      + `Draw them in the matching Tiled object layer — ${why}`,
    );
  }
}

// Every screen renders exactly GAME_VIEW.screenWidth world pixels, so a map has to span all of them.
function validateMapDimensions(mode, screens, mapConfig) {
  const tmjPath = path.join(publicDir, 'assets', mapConfig.path);
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));
  const label = `${mode} ${screens}-screen map (${mapConfig.path})`;

  if (tmj.tilewidth !== MAP_TILE_SIZE || tmj.tileheight !== MAP_TILE_SIZE) {
    throw new Error(
      `${label}: tiles are ${tmj.tilewidth}x${tmj.tileheight}px; the game expects ${MAP_TILE_SIZE}x${MAP_TILE_SIZE}px.`,
    );
  }

  const expectedTiles = mapTilesForScreens(screens);
  if (tmj.width !== expectedTiles) {
    throw new Error(
      `${label}: map is ${tmj.width} tiles wide; ${screens} screens need ${expectedTiles} tiles (${GAME_VIEW.screenWidth * screens}px).`,
    );
  }

  const height = tmj.height * tmj.tileheight;
  if (height !== GAME_VIEW.screenHeight) {
    throw new Error(`${label}: map is ${height}px tall; every screen is ${GAME_VIEW.screenHeight}px.`);
  }

  checkLeaderboardBox(label, tmj, GAME_VIEW.screenWidth * screens);
  if (mode === GAME_MODES.PVP) {
    checkRequiredZones(label, tmj, mapConfig, ['captureZone', 'teamASpawn', 'teamBSpawn'],
      'a PvP round cannot be scored without them.');
  }
  if (mode === GAME_MODES.ZOMBIE) {
    checkRequiredZones(label, tmj, mapConfig, ['playerSpawn', 'enemySpawn', 'bossSpawn'],
      'players, the horde and the dragon each spawn from their own zone.');
  }
}

export function validateMapsManifest() {
  assertGameModesMatchManifest(mapsManifest);

  for (const mode of Object.values(GAME_MODES)) {
    if (!mapsManifest.modes[mode]?.maps?.[String(SERVER_CONFIG.totalScreens)]) {
      throw new Error(
        `Maps manifest does not define a ${SERVER_CONFIG.totalScreens}-screen map for "${mode}".`,
      );
    }
  }

  // Every declared map, not just the active one, so a bad layout is caught before the rig switches to it.
  for (const [mode, modeConfig] of Object.entries(mapsManifest.modes)) {
    for (const [screens, mapConfig] of Object.entries(modeConfig.maps || {})) {
      validateMapDimensions(mode, Number(screens), mapConfig);
    }
  }
}

export function getSelectedMapConfig() {
  const screenCount = String(SERVER_CONFIG.totalScreens);
  const modeConfig = mapsManifest.modes[state.selectedMode];
  const mapConfig = modeConfig?.maps?.[screenCount];

  if (!mapConfig) {
    throw new Error(
      `Map config not found for mode "${state.selectedMode}" and ${screenCount} screens.`,
    );
  }

  return {
    mode: { label: modeConfig.label },
    map: mapConfig,
  };
}
