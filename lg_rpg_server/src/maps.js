import fs from 'fs';
import path from 'path';
import {
  assertGameModesMatchManifest,
  ASSET_MANIFESTS,
  GAME_MODES,
  SERVER_CONFIG,
} from '../game_constants.js';
import { publicDir } from './paths.js';
import { state } from './state.js';

const mapsManifestPath = path.join(publicDir, ASSET_MANIFESTS.maps);
export const mapsManifest = JSON.parse(fs.readFileSync(mapsManifestPath, 'utf8'));

// Validate the maps manifest against the configured game modes and screen count.
export function validateMapsManifest() {
  assertGameModesMatchManifest(mapsManifest);

  // Verify that every game mode has a map defined for the current number of screens.
  for (const mode of Object.values(GAME_MODES)) {
    if (!mapsManifest.modes[mode]?.maps?.[String(SERVER_CONFIG.totalScreens)]) {
      throw new Error(
        `Maps manifest does not define a ${SERVER_CONFIG.totalScreens}-screen map for "${mode}".`,
      );
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
