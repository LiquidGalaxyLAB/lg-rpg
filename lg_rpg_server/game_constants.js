// Game-wide constants, configuration settings, and environment variables.
import 'dotenv/config';

export { SOCKET_EVENTS, GAME_VIEW, GAME_PHASES, MAP_TILE_SIZE, mapTilesForScreens } from './public/shared_constants.js';
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

// Speeds/ranges are world px already retuned ÷3 for the 360px-per-screen world — do not divide again. Hitboxes and splash stay sprite-anchored and were never scaled.
export const PLAYER_DEFAULTS = Object.freeze({
  speed: 1.3,
  maxHealth: 100,
  attackRange: 45, attackDamage: 15,
  attackCooldownMs: 350,
  actionSignalMs: 150,

  // A velocity like `speed`; game-loop's fade halves the travel, so 3.0 over 150ms reads as a ~13px shove.
  knockbackSpeed: 3.0, knockbackMs: 150, knockbackCooldownMs: 400,
});

// Ranged attacks keyed by the `kind` sent with PLAYER_ATTACK; sprites live under huntress.
export const PLAYER_RANGED = Object.freeze({
  // Input-to-release delay, timed to the huntress attack_1 draw frames (6 frames @ 12fps).
  windupMs: 330,

  // Wide enough that pointing roughly at a target connects; the shot still goes where you aim.
  aimAssist: Object.freeze({ maxAngleDeg: 50 }),
  attacks: Object.freeze({
    // Tuned against the melee swing (15 dmg, 45px, 350ms); scales are sized against the ~27px huntress body — basics smaller, specials up to ~2x, all below the boss.
    arrow: {
      // Two-shots a basic 30hp zombie; scale 1.1 reads as an arrow, not a spear.
      sprite: 'player:huntress:proj:arrow',
      speed: 3, damage: 18, maxRange: 130, scale: 1.1, cooldownMs: 500, explosionLingerMs: 220,
    },
    fire: {
      // Detonates on the first enemy hit with splash — one-shots basic zombies.
      sprite: 'player:huntress:proj:fire',
      speed: 2.4, damage: 60, maxRange: 155, scale: 1.4, cooldownMs: 4000,
      splashRadius: 55, explosionLingerMs: 500,
    },
    poison: {
      // Modest on impact, burns the target down over time (44 total).
      sprite: 'player:huntress:proj:poison',
      speed: 2.4, damage: 8, maxRange: 155, scale: 1.0, cooldownMs: 4000, explosionLingerMs: 420,
      dot: { ticks: 6, intervalMs: 800, damage: 6 },
    },
    magic: {
      // Pierces, damaging everything along its line once.
      sprite: 'player:huntress:proj:magic',
      speed: 3.4, damage: 40, maxRange: 155, scale: 1.2, cooldownMs: 3500,
      pierce: true, explosionLingerMs: 320,
    },
    ghost: {
      // Slow, curves toward the nearest target, small splash on impact.
      sprite: 'player:huntress:proj:ghost',
      speed: 1.4, damage: 45, maxRange: 200, scale: 1.1, cooldownMs: 5000,
      splashRadius: 40, explosionLingerMs: 380,
      homing: { turnRate: 0.09, acquireRange: 90 },
    },
  }),
});

// Melee specials keyed by `kind` in PLAYER_ATTACK, run through the mode's playerAttack radial; slow/weaken need a mode hook. They add burst, reach, crowd control and sustain, not raw damage.
export const PLAYER_SPECIALS = Object.freeze({
  // Reach for specials that leave the swing radius: 2x the 55px swing, under the huntress's 130px arrow.
  range: 110,
  attacks: Object.freeze({
    tide: {
      // Burst inside the normal swing radius: 90 over 540ms, where three swings would need 1050ms for 60.
      mode: 'pulse', pulses: 3, pulseIntervalMs: 180, damage: 30, radius: 55,
      cooldownMs: 4000,
    },
    riptide: {
      // Gap-closer against throwers that outrange her. The dash rides the knockback channel, whose fade divides by knockbackMs (150) not dashMs, so 5.5 over 220ms travels ~53px — retune against that measured distance.
      mode: 'dash', damage: 25, radius: 45, dashSpeed: 5.5, dashMs: 220, hits: 2,
      cooldownMs: 4000,
    },
    frost: {
      // Less total damage than Tide Slam for nearly double the reach; the slow, not the damage, is the point.
      mode: 'pulse', pulses: 3, pulseIntervalMs: 120, damage: 15, radius: 110,
      slow: Object.freeze({ multiplier: 0.5, durationMs: 3000 }),
      cooldownMs: 5000,
    },
    blessing: {
      // Heals only the caster (5hp/s, above the Greater Potion's 3.3); the weaken rides on the *enemy*, so it hits every player for less.
      mode: 'blessing', heal: 30, radius: 110,
      weaken: Object.freeze({ multiplier: 0.5, durationMs: 6000 }),
      cooldownMs: 6000,
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

// Characters without an override use PLAYER_DEFAULTS.
export const CHARACTER_MELEE = Object.freeze(Object.fromEntries(
  CHARACTER_CATALOG.filter((c) => c.melee).map((c) => [c.id, c.melee]),
));

export const VALID_CHARACTERS = Object.freeze(new Set(CHARACTER_CATALOG.map((c) => c.id)));

// What everyone starts on until they pick in the lobby.
export const DEFAULT_CHARACTER = 'huntress';

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
  minPlayers: 2,
  roundDurationMs: 120000,
  respawnDelayMs: 4000,
  invulnMs: 2000,
  // Seconds of holding the circle alone that earn one point.
  secondsPerPoint: 6,
  // How long a team stays empty before the other side wins by forfeit; covers a brief drop.
  forfeitGraceMs: 8000,
});

export const PVP_TEAMS = Object.freeze(['teamA', 'teamB']);

// edgePadding must stay under half the smallest spawn box or randomPointInRect collapses to the box centre and spacing can never be met.
export const SPAWN = Object.freeze({
  edgePadding: 10, minPlayerSpacing: 35, minEnemySpacing: 35, maxAttempts: 16,
  enemyDistanceFalloff: 100,
});

// Caps are per unit of walkable area, which shrank ~9x with the world while hitboxes stayed sprite-sized; the old 25/70 would pack enemies shoulder to shoulder.
export const ENEMY_SPAWN = Object.freeze({
  maxOnMap: 9, capRampStep: 4, capCeiling: 24, intervalMs: 700, minIntervalMs: 400, rampStepMs: 150, warmupMs: 30000,
});

export const HEART = Object.freeze({
  maxOnMap: 3, healAmount: 30, spawnIntervalMs: 8000,
});

export const CHEERLEADER = Object.freeze({
  tickMs: 12000, introDelayMs: 1500, maxTranscript: 8,
});

export const ENEMY_MOVEMENT = Object.freeze({
  speed: 1,
  // Fraction of the loaded map's diagonal; lower it to leave far corners safe.
  aggroRangeFactor: 1,
  leashMultiplier: 1.5,
  commitForLife: false,
  separationRadius: 28,
  separationStrength: 0.5,
  pathCellSize: 16,
  agentRadius: 14,
  stuckEpsilon: 0.15,
  stuckTicks: 8,
});

export const ENEMY_COMBAT = Object.freeze({
  // attackRange is the GAP between hitboxes, not center distance — 26 keeps swings looking like contact.
  health: 30, hitboxHalfWidth: 16, hitboxHeight: 32, hitboxOriginY: 1, attackRange: 26, attackDamage: 8, attackCooldownMs: 1000, deathLingerMs: 700, actionSignalMs: 150,
  knockbackSpeed: 2.1, knockbackMs: 150, knockbackImmunityMs: 500,
  // Short enough that a swing started in range still connects on a walking player.
  attackWindupMs: 250,
});

export const ZOMBIE_ENEMY_TYPES = Object.freeze([
  { type: 'skeleton' },
  {
    type: 'goblin',
    // Projectile-capable: ~rangedRatio of spawns become bomb throwers that keep distance; the rest melee.
    throwRange: 90,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:goblin:proj:bomb',
      speed: 1.8,
      damage: 12,
      // 48 keeps the blast escapable at walk speed during the bomb's flight; 64 was a near-guaranteed hit.
      splashRadius: 48,
      scale: 0.55,
      explosionLingerMs: 450,
      cooldownMs: 5000,
    },
  },
  {
    type: 'mushroom',
    throwRange: 80,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:mushroom:proj:spore',
      speed: 1.4,
      damage: 10,
      splashRadius: 44,
      explosionLingerMs: 340,
      cooldownMs: 5000,
    },
  },
  {
    // Fast fragile swarmer: dies to one swing, pressures a kiting player with numbers.
    type: 'rat',
    speed: 1.1,
    health: 22,
    attackDamage: 6,
    hitboxHalfWidth: 9,
    hitboxHeight: 16,
  },
  {
    // Slow tank: soaks hits and punishes anyone who lets it corner them.
    type: 'slime',
    speed: 0.55,
    health: 60,
    attackDamage: 10,
    hitboxHalfWidth: 18,
    hitboxHeight: 24,
  },
  {
    // The chaser: faster than the base walk-away pace so kiting isn't free.
    type: 'bat',
    speed: 1.15,
    health: 25,
    attackDamage: 5,
    hitboxHalfWidth: 14,
    hitboxHeight: 24,
    hitboxOriginY: 0.5,
  },
  {
    type: 'flying_eye',
    speed: 0.9,
    health: 30,
    flies: true,
    hitboxHalfWidth: 16,
    hitboxHeight: 26,
    hitboxOriginY: 0.5,
    throwRange: 95,
    rangedRatio: 0.4,
    projectile: {
      sprite: 'enemy:flying_eye:proj:orb',
      speed: 2,
      damage: 10,
      splashRadius: 40,
      explosionLingerMs: 320,
      cooldownMs: 5000,
    },
  },
  {
    type: 'mimic',
    aggroRange: 50,
    speed: 1.0,
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
    speed: 0.65,
    // Solo baseline; zombie mode adds healthPerExtraPlayer per extra player at summon.
    health: 1600,
    healthPerExtraPlayer: 600,
    attackDamage: 15,

    knockbackResist: true,
    flies: true,
    commitForLife: true,
    // Hunts from anywhere and always swaps to the closest player, so it never idles at spawn or chases one runner while others shoot it.
    aggroRange: Infinity,
    retargetNearest: true,
    // Wide enough that shots at the larger boss sprite actually connect.
    hitboxHalfWidth: 30,
    hitboxHeight: 44,
    hitboxOriginY: 0.6,
    maxOnMap: 1,
    throwRange: 120,
    rangedRatio: 1,
    projectile: {
      // Flies to the target's spot, then explodes with splash damage.
      sprite: 'enemy:dragon:proj:fire',
      scale: 1.8,
      speed: 2,
      damage: 24,
      splashRadius: 60,
      explosionLingerMs: 640,
      cooldownMs: 2000,
    },
  },
]);

export const ASSET_MANIFESTS = Object.freeze({
  root: 'assets/manifest.json',
  maps: 'assets/maps/maps.json',
  players: 'assets/players/players.json',
});

// Fails fast when the maps manifest and the server constants disagree on modes.
export function assertGameModesMatchManifest(mapsManifest) {
  const manifestModes = new Set(Object.keys(mapsManifest?.modes ?? {}));
  const constantModes = Object.values(GAME_MODES);

  for (const mode of constantModes) {
    if (!manifestModes.has(mode)) {
      throw new Error(`Game mode "${mode}" is missing from maps manifest.`);
    }
  }
  for (const mode of manifestModes) {
    if (!VALID_GAME_MODES.has(mode)) {
      throw new Error(`Maps manifest contains unknown game mode "${mode}".`);
    }
  }
  if (mapsManifest.defaultMode !== DEFAULT_GAME_MODE) {
    throw new Error(
      `Maps manifest defaultMode must be "${DEFAULT_GAME_MODE}", got "${mapsManifest.defaultMode}".`,
    );
  }
}
