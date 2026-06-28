// Game-wide constants, configuration settings, and environment variables.
import 'dotenv/config';

export { SOCKET_EVENTS, GAME_VIEW, GAME_PHASES } from './public/shared_constants.js';

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

export const GAME_MODES = Object.freeze({
  PVP: 'pvp',
  ZOMBIE: 'zombie',
});

export const GAME_MODE_LABELS = Object.freeze({
  [GAME_MODES.PVP]: 'PvP Mode',
  [GAME_MODES.ZOMBIE]: 'Zombie Mode',
});

export const DEFAULT_GAME_MODE = GAME_MODES.PVP;

export const VALID_GAME_MODES = Object.freeze(new Set(Object.values(GAME_MODES)));

// Server and network settings.
export const SERVER_CONFIG = Object.freeze({
  port: readPositiveIntegerEnv('PORT', 3000),
  totalScreens: readPositiveIntegerEnv('TOTAL_SCREENS', 3),
  maxPlayers: readPositiveIntegerEnv('MAX_PLAYERS', 4),
  corsOrigin: process.env.CORS_ORIGIN || '*',
});

export const PLAYER_SIZE = Object.freeze({
  halfWidth: readPositiveIntegerEnv('PLAYER_HALF_WIDTH', 19),
  height: readPositiveIntegerEnv('PLAYER_HEIGHT', 48),
});

export const PLAYER_DEFAULTS = Object.freeze({
  speed: 1.3,
  maxHealth: 100,
  attackRange: 170, attackDamage: 12,
  attackCooldownMs: 350,
  actionSignalMs: 150,
});

export const GAME_LOOP = Object.freeze({
  tickRateMs: 1000 / 60,
});

export const MATCH = Object.freeze({
  emptyGraceMs: 10000,
  winDurationMs: 180000,
});

// Zone Capture (PvP) timings. A round = lockMs (confined in spawn) + roundDurationMs.
export const PVP = Object.freeze({
  // Two teams need at least one player each, so a PvP match can't start solo.
  minPlayers: 2,
  lockMs: 4000,
  graceMs: 3000,
  roundDurationMs: 120000,
  respawnDelayMs: 4000,
  invulnMs: 2000,
});

export const PVP_TEAMS = Object.freeze(['teamA', 'teamB']);

export const SPAWN = Object.freeze({
  edgePadding: 28, minPlayerSpacing: 35, minEnemySpacing: 35, maxAttempts: 16,
  enemyDistanceFalloff: 300,
});

export const ENEMY_SPAWN = Object.freeze({
  maxOnMap: 25, capRampStep: 11, capCeiling: 70, intervalMs: 700, minIntervalMs: 400, rampStepMs: 150, warmupMs: 30000,
});

export const HEART = Object.freeze({
  maxOnMap: 3, healAmount: 30, spawnIntervalMs: 8000,
});

export const CHEERLEADER = Object.freeze({
  tickMs: 12000, introDelayMs: 1500, maxTranscript: 8,
});

export const ENEMY_MOVEMENT = Object.freeze({
  speed: 1,
  aggroRange: 1050,
  leashMultiplier: 1.5,
  commitForLife: false,
  separationRadius: 28,
  separationStrength: 0.5,
  pathCellSize: 16,
  agentRadius: 14,
  stuckEpsilon: 0.4,
  stuckTicks: 8,
});

export const ENEMY_COMBAT = Object.freeze({
  health: 30, hitboxHalfWidth: 16, hitboxHeight: 32, hitboxOriginY: 1, attackRange: 38, attackDamage: 8, attackCooldownMs: 1000, deathLingerMs: 700,
});

// Stats for different zombie enemy types.
export const ZOMBIE_ENEMY_TYPES = Object.freeze([
  { type: 'skeleton' },
  { type: 'goblin' },
  { type: 'mushroom' },
  {
    type: 'rat',
    speed: 2.8,
    health: 15,
    hitboxHalfWidth: 9,
    hitboxHeight: 16,
  },
  {
    type: 'slime',
    speed: 1.6,
    health: 50,
    hitboxHalfWidth: 18,
    hitboxHeight: 24,
  },
  {
    type: 'bat',
    speed: 2.8,
    health: 15,
    attackDamage: 5,
    hitboxHalfWidth: 14,
    hitboxHeight: 24,
    hitboxOriginY: 0.5,
  },
  {
    type: 'flying_eye',
    speed: 2.6,
    health: 20,
    hitboxHalfWidth: 16,
    hitboxHeight: 26,
    hitboxOriginY: 0.5,
  },
  {
    type: 'mimic',
    aggroRange: 135,
    speed: 3.0,
    commitForLife: true,
    health: 80,
    attackDamage: 20,
    hitboxHalfWidth: 18,
    hitboxHeight: 28,
    maxOnMap: 3,
  },
]);

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
