import 'dotenv/config';

export { SOCKET_EVENTS, GAME_VIEW } from './public/shared_constants.js';

// Parses the environment variable whether it's a finite number or returns the fallback value.
function readNumberEnv(name, fallback) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === '') {
    return fallback;
  }

  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return value;
}

// Reads an environment variable and ensures the resulting value is a positive integer.
function readPositiveIntegerEnv(name, fallback) {
  const value = readNumberEnv(name, fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return value;
}

// The game modes.
export const GAME_MODES = Object.freeze({
  PVP: 'pvp',
  ZOMBIE: 'zombie',
});

// Maps game mode IDs to human-readable labels.
export const GAME_MODE_LABELS = Object.freeze({
  [GAME_MODES.PVP]: 'PvP Mode',
  [GAME_MODES.ZOMBIE]: 'Zombie Mode',
});

// The default game mode to use when no game mode is selected.
export const DEFAULT_GAME_MODE = GAME_MODES.PVP;

// The set of all valid game modes.
export const VALID_GAME_MODES = Object.freeze(new Set(Object.values(GAME_MODES)));

// The server configuration.
export const SERVER_CONFIG = Object.freeze({
  port: readPositiveIntegerEnv('PORT', 3000),
  totalScreens: readPositiveIntegerEnv('TOTAL_SCREENS', 3),
  maxPlayers: readPositiveIntegerEnv('MAX_PLAYERS', 4),
  corsOrigin: process.env.CORS_ORIGIN || '*',
});

// How wide and tall the player is.
export const PLAYER_SIZE = Object.freeze({
  halfWidth: readPositiveIntegerEnv('PLAYER_HALF_WIDTH', 60),
  height: readPositiveIntegerEnv('PLAYER_HEIGHT', 152),
});

export const PLAYER_DEFAULTS = Object.freeze({
  startX: 500,
  startY: 500,
  speed: 5,
});

// The rate at which the game loop runs.
export const GAME_LOOP = Object.freeze({
  tickRateMs: 1000 / 60,
});

// The paths to the asset manifests.
export const ASSET_MANIFESTS = Object.freeze({
  root: 'assets/manifest.json',
  maps: 'assets/maps/maps.json',
  players: 'assets/players/players.json',
});

// Validates that the game modes in the maps manifest match the server constants.
export function assertGameModesMatchManifest(mapsManifest) {
  const manifestModes = new Set(Object.keys(mapsManifest?.modes ?? {}));
  const constantModes = Object.values(GAME_MODES);

  // Check that every game mode defined in the server code exists in the manifest
  for (const mode of constantModes) {
    if (!manifestModes.has(mode)) {
      throw new Error(`Game mode "${mode}" is missing from maps manifest.`);
    }
  }
  // Check that the manifest doesn't contain any unknown game modes
  for (const mode of manifestModes) {
    if (!VALID_GAME_MODES.has(mode)) {
      throw new Error(`Maps manifest contains unknown game mode "${mode}".`);
    }
  }
  // Ensure both the manifest and the server agree on the default game mode
  if (mapsManifest.defaultMode !== DEFAULT_GAME_MODE) {
    throw new Error(
      `Maps manifest defaultMode must be "${DEFAULT_GAME_MODE}", got "${mapsManifest.defaultMode}".`,
    );
  }
}
