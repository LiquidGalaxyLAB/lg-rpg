// Handles the Zombie game mode logic, including spawning, movement, and combat for enemies.

import {
  ENEMY_COMBAT,
  ENEMY_MOVEMENT,
  ENEMY_SPAWN,
  SPAWN,
  ZOMBIE_ENEMY_TYPES,
} from '../../game_constants.js';
import { findSpawnPoint } from '../lib/spawn.js';
import { clamp, createPathfinder, distance, distanceSq } from '../lib/pathfinding.js';

// Combines default enemy stats with any type-specific overrides.
function resolveStats(pick) {
  return {
    speed: pick.speed ?? ENEMY_MOVEMENT.speed,
    aggroRange: pick.aggroRange ?? ENEMY_MOVEMENT.aggroRange,
    leashMultiplier: pick.leashMultiplier ?? ENEMY_MOVEMENT.leashMultiplier,
    commitForLife: pick.commitForLife ?? ENEMY_MOVEMENT.commitForLife,
    health: pick.health ?? ENEMY_COMBAT.health,
    hitboxHalfWidth: pick.hitboxHalfWidth ?? ENEMY_COMBAT.hitboxHalfWidth,
    hitboxHeight: pick.hitboxHeight ?? ENEMY_COMBAT.hitboxHeight,
    hitboxOriginY: pick.hitboxOriginY ?? ENEMY_COMBAT.hitboxOriginY,
    attackRange: pick.attackRange ?? ENEMY_COMBAT.attackRange,
    attackDamage: pick.attackDamage ?? ENEMY_COMBAT.attackDamage,
    attackCooldownMs: pick.attackCooldownMs ?? ENEMY_COMBAT.attackCooldownMs,
  };
}

function bodyHitbox(entity, halfWidth, height, originY = 1) {
  const top = entity.y - height * originY;
  return {
    left: entity.x - halfWidth,
    top,
    right: entity.x + halfWidth,
    bottom: top + height,
  };
}

function enemyHitbox(enemy) {
  return bodyHitbox(
    enemy,
    enemy.stats.hitboxHalfWidth,
    enemy.stats.hitboxHeight,
    enemy.stats.hitboxOriginY,
  );
}

function distanceSqBetweenHitboxes(a, b) {
  const dx = a.left > b.right ? a.left - b.right : b.left > a.right ? b.left - a.right : 0;
  const dy = a.top > b.bottom ? a.top - b.bottom : b.top > a.bottom ? b.top - a.bottom : 0;
  return dx * dx + dy * dy;
}

function hitboxesWithinRange(a, b, range) {
  return distanceSqBetweenHitboxes(a, b) <= range * range;
}

function damageEnemy(enemy, damage) {
  enemy.health -= damage;
  if (enemy.health > 0) return false;

  enemy.health = 0;
  enemy.dying = true;
  enemy.diedAt = Date.now();
  enemy.action = 'death';
  enemy.targetId = null;
  return true;
}

export class ZombieMode {
  constructor(map) {
    this.bounds = map.bounds;
    this.zones = map.zones.enemySpawn || [];
    this.enemies = new Map();
    this.nextId = 1;
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.spawnStartedAt = 0;
    // Pathfinder instance for navigation.
    this.pathfinder = createPathfinder({ bounds: this.bounds });
  }

  // Calculates the spawn interval, decreasing over time.
  spawnInterval() {
    const elapsedMs = Date.now() - this.spawnStartedAt;
    return Math.max(
      ENEMY_SPAWN.minIntervalMs,
      ENEMY_SPAWN.intervalMs - ENEMY_SPAWN.rampStepMs * Math.floor(elapsedMs / 60000),
    );
  }

  // Calculates the maximum number of enemies allowed on the map.
  currentCap() {
    const elapsedMs = Date.now() - this.spawnStartedAt;
    return Math.min(
      ENEMY_SPAWN.capCeiling,
      ENEMY_SPAWN.maxOnMap + ENEMY_SPAWN.capRampStep * Math.floor(elapsedMs / 60000),
    );
  }

  // Starts the game mode timers and enemy spawning.
  start() {
    this.warmupTimer = setTimeout(() => {
      this.spawnStartedAt = Date.now();
      const tick = () => {
        this.spawn();
        this.spawnTimer = setTimeout(tick, this.spawnInterval());
      };
      this.spawnTimer = setTimeout(tick, this.spawnInterval());
    }, ENEMY_SPAWN.warmupMs);
  }

  // Stops all timers and clears active enemies.
  stop() {
    clearTimeout(this.warmupTimer);
    clearTimeout(this.spawnTimer);
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.enemies.clear();
  }

  // Spawns a random type of enemy at a clear map position.
  spawn() {
    if (this.zones.length === 0 || this.enemies.size >= this.currentCap()) return;

    const occupied = Array.from(this.enemies.values());
    const point = findSpawnPoint(this.zones, occupied, {
      edgePadding: SPAWN.edgePadding,
      minSpacing: SPAWN.minEnemySpacing,
      maxAttempts: SPAWN.maxAttempts,
    });
    if (!point) return;

    const available = ZOMBIE_ENEMY_TYPES.filter((t) => {
      if (t.maxOnMap == null) return true;
      return occupied.filter((e) => e.type === t.type && !e.dying).length < t.maxOnMap;
    });
    if (available.length === 0) return;

    const pick = available[Math.floor(Math.random() * available.length)];
    const stats = resolveStats(pick);
    const id = `e${this.nextId++}`;
    this.enemies.set(id, {
      id,
      x: point.x,
      y: point.y,
      type: pick.type,
      stats,
      targetId: null,
      health: stats.health,
      lastAttackAt: 0,
      action: null,
      dying: false,
      diedAt: 0,
    });
  }

  // Advances the simulation by one tick, updating enemy AI, movements, and attacks.
  tick(players) {
    const now = Date.now();
    const playerDamage = [];

    // Remove dead enemies after their death animation plays.
    for (const [id, enemy] of this.enemies) {
      if (enemy.dying && now - enemy.diedAt >= ENEMY_COMBAT.deathLingerMs) {
        this.enemies.delete(id);
      }
    }

    if (this.enemies.size === 0) return { playerDamage };

    // Prepare pathfinding for targets.
    this.pathfinder.prepare(players);

    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;

      enemy.action = null;
      this.updateTarget(enemy, players);
      if (enemy.targetId === null) continue;

      const target = players.find((p) => p.id === enemy.targetId);
      if (!target) {
        enemy.targetId = null;
        continue;
      }

      if (
        hitboxesWithinRange(
          enemyHitbox(enemy),
          target.hitbox,
          enemy.stats.attackRange,
        )
      ) {
        // Attack target player if the cooldown has elapsed.
        if (now - enemy.lastAttackAt >= enemy.stats.attackCooldownMs) {
          enemy.lastAttackAt = now;
          enemy.action = 'attack';
          playerDamage.push({ playerId: target.id, amount: enemy.stats.attackDamage });
        }
      } else {
        const dir = this.pathfinder.direction(enemy, target);
        enemy.x += dir.x * enemy.stats.speed;
        enemy.y += dir.y * enemy.stats.speed;
      }
    }

    this.separate();

    for (const enemy of this.enemies.values()) {
      enemy.x = clamp(enemy.x, 0, this.bounds.width);
      enemy.y = clamp(enemy.y, 0, this.bounds.height);
    }

    return { playerDamage };
  }

  // Processes damage dealt by a player's attack to nearby enemies.
  playerAttack(hitbox, range, damage) {
    const attackerHitbox = hitbox;
    let hits = 0;
    let kills = 0;

    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;

      if (!hitboxesWithinRange(attackerHitbox, enemyHitbox(enemy), range)) continue;

      hits++;
      if (damageEnemy(enemy, damage)) kills++;
    }

    return { hit: hits > 0, killed: kills > 0, hits, kills };
  }

  // Updates the player target that the enemy is currently chasing.
  updateTarget(enemy, players) {
    const { aggroRange, leashMultiplier, commitForLife } = enemy.stats;

    // Keep the current target unless they escape or die.
    if (enemy.targetId !== null) {
      const current = players.find((p) => p.id === enemy.targetId);
      if (!current) {
        enemy.targetId = null;
      } else if (!commitForLife && distance(enemy, current) > aggroRange * leashMultiplier) {
        enemy.targetId = null;
      } else {
        return;
      }
    }

    // Find and target the closest player within range.
    let nearestId = null;
    let nearestSq = aggroRange * aggroRange;
    for (const p of players) {
      const dSq = distanceSq(enemy, p);
      if (dSq <= nearestSq) {
        nearestSq = dSq;
        nearestId = p.id;
      }
    }
    enemy.targetId = nearestId;
  }

  // Pushes overlapping enemies apart so they do not stack.
  separate() {
    const list = Array.from(this.enemies.values());
    const radius = ENEMY_MOVEMENT.separationRadius;
    const strength = ENEMY_MOVEMENT.separationStrength;
    const radiusSq = radius * radius;

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dSq = dx * dx + dy * dy;
        if (dSq === 0 || dSq >= radiusSq) continue;

        const d = Math.sqrt(dSq);
        const push = ((radius - d) / 2) * strength;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }

  // Returns the client-facing enemy state patch.
  getStatePatch() {
    return {
      enemies: Array.from(this.enemies.values()).map((e) => ({
        id: e.id,
        x: Math.round(e.x),
        y: Math.round(e.y),
        type: e.type,
        action: e.action || null,
        hp: e.health,
        maxHp: e.stats.health,
      })),
    };
  }
}
