// Game-wide constants, configuration settings, and environment variables.
import 'dotenv/config';

export { SOCKET_EVENTS, GAME_VIEW, GAME_PHASES } from './public/shared_constants.js';
export {
  LOADOUT_SLOTS,
  POWERUP_BLINK_MS,
  POWERUP_CATALOG,
  HEALTH_CATALOG,
  CHARACTER_CATALOG,
} from './public/shared_constants.js';

import {
  POWERUP_CATALOG,
  HEALTH_CATALOG,
  CHARACTER_CATALOG,
} from './public/shared_constants.js';

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

export const DEFAULT_GAME_MODE = GAME_MODES.ZOMBIE;

export const VALID_GAME_MODES = Object.freeze(new Set(Object.values(GAME_MODES)));

// Server and network settings.
export const SERVER_CONFIG = Object.freeze({
  port: readPositiveIntegerEnv('PORT', 8111),
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
  attackRange: 80, attackDamage: 15,
  attackCooldownMs: 350,
  actionSignalMs: 150,

  knockbackSpeed: 2.0, knockbackMs: 100, knockbackCooldownMs: 400,
});

// Ranged attacks keyed by the `kind` sent with PLAYER_ATTACK; sprites live under huntress.
export const PLAYER_RANGED = Object.freeze({
  // Input-to-release delay, timed to the huntress attack_1 draw frames (6 frames @ 12fps).
  windupMs: 330,
  attacks: Object.freeze({
    // Tuned against the melee swing (15 dmg, 80px radius, 350ms); specials sit above it.
    arrow: {
      // Two-shots a basic 30hp zombie, same per-hit damage as the sword.
      sprite: 'player:huntress:proj:arrow',
      speed: 9, damage: 35, maxRange: 380, scale: 2, cooldownMs: 500, explosionLingerMs: 220,
    },
    fire: {
      // Fire charge: detonates on the first enemy hit with splash damage — one-shots basic zombies.
      sprite: 'player:huntress:proj:fire',
      speed: 7, damage: 70, maxRange: 460, scale: 2, cooldownMs: 4000,
      splashRadius: 60, explosionLingerMs: 500,
    },
    poison: {
      // Acid shot: modest on impact but burns the target down over time (28 total).
      sprite: 'player:huntress:proj:poison',
      speed: 7, damage: 8, maxRange: 460, scale: 1.6, cooldownMs: 4000, explosionLingerMs: 420,
      dot: { ticks: 5, intervalMs: 800, damage: 4 },
    },
    magic: {
      // Magic bolt: pierces, damaging everything along its line once.
      sprite: 'player:huntress:proj:magic',
      speed: 10, damage: 50, maxRange: 460, scale: 1.8, cooldownMs: 3500,
      pierce: true, explosionLingerMs: 320,
    },
    ghost: {
      // Ghost orb: slow, curves toward the nearest target, small splash on impact.
      sprite: 'player:huntress:proj:ghost',
      speed: 4, damage: 50, maxRange: 600, scale: 1.6, cooldownMs: 5000,
      splashRadius: 40, explosionLingerMs: 380,
      homing: { turnRate: 0.09, acquireRange: 260 },
    },
  }),
});

// Per-character basic + specials, derived from the shared catalog so UI and validation never drift.
export const CHARACTER_KITS = Object.freeze(Object.fromEntries(
  CHARACTER_CATALOG.map((c) => [c.id, Object.freeze({
    basic: c.basic.id,
    specials: Object.freeze(c.specials.map((s) => s.id)),
  })]),
));

// Set of valid character ids a player may pick from the controller.
export const VALID_CHARACTERS = Object.freeze(new Set(CHARACTER_CATALOG.map((c) => c.id)));

// The character everyone starts on until they pick one in the lobby.
export const DEFAULT_CHARACTER = 'huntress';

// Fast lookups for applying a loadout item's effect by id.
export const POWERUP_BY_ID = Object.freeze(Object.fromEntries(POWERUP_CATALOG.map((p) => [p.id, p])));
export const HEALTH_BY_ID = Object.freeze(Object.fromEntries(HEALTH_CATALOG.map((h) => [h.id, h])));

export const GAME_LOOP = Object.freeze({
  tickRateMs: 1000 / 60,
});

export const MATCH = Object.freeze({
  emptyGraceMs: 10000,
  winDurationMs: 180000,
});

// Zone Capture (PvP) timings. Teams spawn apart, so the round starts live immediately.
export const PVP = Object.freeze({
  // Two teams need at least one player each, so a PvP match can't start solo.
  minPlayers: 2,
  roundDurationMs: 120000,
  respawnDelayMs: 4000,
  invulnMs: 2000,
  // Holding the circle alone for this many seconds earns one point.
  secondsPerPoint: 6,
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
  health: 30, hitboxHalfWidth: 16, hitboxHeight: 32, hitboxOriginY: 1, attackRange: 38, attackDamage: 8, attackCooldownMs: 1000, deathLingerMs: 700, actionSignalMs: 150,
  knockbackSpeed: 2.1, knockbackMs: 150, knockbackImmunityMs: 500,
  attackWindupMs: 350,
});

// Stats for different zombie enemy types.
export const ZOMBIE_ENEMY_TYPES = Object.freeze([
  { type: 'skeleton' },
  {
    type: 'goblin',
    // Projectile-capable: ~rangedRatio of spawns become bomb throwers that keep distance; the rest melee.
    throwRange: 260,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:goblin:proj:bomb',
      speed: 5,
      damage: 14,
      splashRadius: 64,
      explosionLingerMs: 450,
      cooldownMs: 5000,
    },
  },
  {
    type: 'mushroom',
    throwRange: 230,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:mushroom:proj:spore',
      speed: 4,
      damage: 10,
      splashRadius: 44,
      explosionLingerMs: 340,
      cooldownMs: 5000,
    },
  },
  {
    type: 'rat',
    speed: 2.8,
    health: 46,
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
    health: 35,
    attackDamage: 5,
    hitboxHalfWidth: 14,
    hitboxHeight: 24,
    hitboxOriginY: 0.5,
  },
  {
    type: 'flying_eye',
    speed: 2.6,
    health: 36,
    hitboxHalfWidth: 16,
    hitboxHeight: 26,
    hitboxOriginY: 0.5,
    throwRange: 280,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:flying_eye:proj:orb',
      speed: 6,
      damage: 10,
      splashRadius: 40,
      explosionLingerMs: 320,
      cooldownMs: 5000,
    },
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
  {

    type: 'dragon',
    bossOnly: true,
    speed: 1.4,
    health: 1000,

    knockbackResist: true,
    flies: true,
    commitForLife: true,
    aggroRange: 1600,
    hitboxHalfWidth: 26,
    hitboxHeight: 34,
    hitboxOriginY: 0.6,
    maxOnMap: 1,
    throwRange: 350,
    rangedRatio: 1,
    projectile: {
      // Firebolt: flies to the target's spot, then explodes with splash damage.
      sprite: 'enemy:dragon:proj:fire',
      scale: 2.2,
      speed: 6,
      damage: 20,
      splashRadius: 70,
      explosionLingerMs: 640,
      cooldownMs: 2500,
    },
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
