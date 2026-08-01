// Zombie mode: enemy spawning, movement and combat.

import {
  ENEMY_COMBAT,
  ENEMY_MOVEMENT,
  ENEMY_SPAWN,
  SPAWN,
  ZOMBIE_ENEMY_TYPES,
} from '../../game_constants.js';
import { findSpawnPoint } from '../lib/spawn.js';
import { canStandAt, moveWithCollision } from '../lib/collision.js';
import { createPathfinder, distance, distanceSq } from '../lib/pathfinding.js';
import { hitboxesWithinRange } from '../lib/hitbox.js';
import { PlayerProjectiles } from '../lib/player-projectiles.js';
import { state } from '../state.js';
import { emitGameEvent } from '../cheerleader-bridge.js';

function resolveStats(pick, defaultAggroRange) {
  return {
    speed: pick.speed ?? ENEMY_MOVEMENT.speed,
    aggroRange: pick.aggroRange ?? defaultAggroRange,
    leashMultiplier: pick.leashMultiplier ?? ENEMY_MOVEMENT.leashMultiplier,
    commitForLife: pick.commitForLife ?? ENEMY_MOVEMENT.commitForLife,
    // Re-picks the closest player every tick (boss behavior) instead of locking one target.
    retargetNearest: pick.retargetNearest ?? false,
    // Fliers skip the pathfinder/collision and drift straight through the world toward their target.
    flies: pick.flies ?? false,
    knockbackResist: pick.knockbackResist ?? false,
    health: pick.health ?? ENEMY_COMBAT.health,
    hitboxHalfWidth: pick.hitboxHalfWidth ?? ENEMY_COMBAT.hitboxHalfWidth,
    hitboxHeight: pick.hitboxHeight ?? ENEMY_COMBAT.hitboxHeight,
    hitboxOriginY: pick.hitboxOriginY ?? ENEMY_COMBAT.hitboxOriginY,
    attackRange: pick.attackRange ?? ENEMY_COMBAT.attackRange,
    attackDamage: pick.attackDamage ?? ENEMY_COMBAT.attackDamage,
    attackCooldownMs: pick.attackCooldownMs ?? ENEMY_COMBAT.attackCooldownMs,
    // Projectile fields for throw-capable types; rangedRatio is the fraction of spawns that become throwers.
    projectile: pick.projectile ?? null,
    throwRange: pick.throwRange ?? ENEMY_COMBAT.attackRange,
    rangedRatio: pick.rangedRatio ?? 0.4,
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

function enemyCollisionBodyFromStats(stats) {
  return {
    halfWidth: Math.max(6, Math.min(14, stats.hitboxHalfWidth)),
    height: 8,
  };
}

// Effective move speed, cut while a Frost Nova slow is running.
function enemySpeed(enemy, now) {
  return (enemy.slowUntil || 0) > now ? enemy.stats.speed * enemy.slowMultiplier : enemy.stats.speed;
}

// Effective outgoing damage, cut while a Blessing weaken is running.
function enemyDamage(enemy, base, now) {
  return (enemy.weakenUntil || 0) > now ? Math.round(base * enemy.weakenMultiplier) : base;
}

function damageEnemy(enemy, damage) {
  enemy.health -= damage;
  if (enemy.health > 0) {
    // Kept until expiry so the broadcast picks the hit animation up.
    enemy.action = 'take_hit';
    enemy.actionExpiresAt = Date.now() + ENEMY_COMBAT.actionSignalMs;
    return false;
  }

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
    this.collision = map.collision;
    this.zones = map.zones.enemySpawn || [];
    // Boss-only types use their own drawn zone so the dragon always makes its entrance where the map intends.
    this.bossZones = map.zones.bossSpawn || [];
    this.enemies = new Map();
    this.projectiles = new Map();
    this.playerShots = new PlayerProjectiles(map.bounds);
    this.nextId = 1;
    this.nextProjectileId = 1;
    // The dragon is summoned once at the survive mark; killing it wins the match.
    this.bossSpawned = false;
    this.bossAnnounced = false;
    this.bossId = null;
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.spawnStartedAt = 0;
    // Latest player snapshot, refreshed each tick, so spawning can bias toward nearby players.
    this.activePlayers = [];
    // Corner-to-corner reach, so the widest map still leaves no spot where an enemy ignores a player.
    this.defaultAggroRange =
      Math.hypot(this.bounds.width, this.bounds.height) * ENEMY_MOVEMENT.aggroRangeFactor;
    this.pathfinder = createPathfinder({
      bounds: this.bounds,
      collision: this.collision,
      cellSize: ENEMY_MOVEMENT.pathCellSize,
      agentRadius: ENEMY_MOVEMENT.agentRadius,
    });
  }

  // Shortens over time, floored at minIntervalMs.
  spawnInterval() {
    const elapsedMs = Date.now() - this.spawnStartedAt;
    return Math.max(
      ENEMY_SPAWN.minIntervalMs,
      ENEMY_SPAWN.intervalMs - ENEMY_SPAWN.rampStepMs * Math.floor(elapsedMs / 60000),
    );
  }

  // Max enemies on the map, ramping up over time to capCeiling.
  currentCap() {
    const elapsedMs = Date.now() - this.spawnStartedAt;
    return Math.min(
      ENEMY_SPAWN.capCeiling,
      ENEMY_SPAWN.maxOnMap + ENEMY_SPAWN.capRampStep * Math.floor(elapsedMs / 60000),
    );
  }

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

  stop() {
    clearTimeout(this.warmupTimer);
    clearTimeout(this.spawnTimer);
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.enemies.clear();
    this.projectiles.clear();
    this.playerShots.clear();
  }

  // Spawns a random enemy, or a forced type; forced spawns (the scripted boss) ignore the wave cap.
  spawn(forcedType = null) {
    if (this.zones.length === 0 && this.bossZones.length === 0) return null;
    if (!forcedType && this.enemies.size >= this.currentCap()) return null;

    const occupied = Array.from(this.enemies.values());
    const available = ZOMBIE_ENEMY_TYPES.filter((t) => {
      if (forcedType && t.type !== forcedType) return false;
      if (!forcedType && t.bossOnly) return false;
      if (t.maxOnMap == null) return true;
      return occupied.filter((e) => e.type === t.type && !e.dying).length < t.maxOnMap;
    });
    if (available.length === 0) return;

    const pick = forcedType ? available[0] : available[Math.floor(Math.random() * available.length)];
    const stats = resolveStats(pick, this.defaultAggroRange);
    // Boss types get the map's dedicated boss_spawn rectangle; everything else uses the enemy zones.
    const isBoss = pick.bossOnly === true && this.bossZones.length > 0;
    const zones = isBoss ? this.bossZones : this.zones;
    if (zones.length === 0) return null;
    const point = findSpawnPoint(zones, occupied, {
      edgePadding: SPAWN.edgePadding,
      minSpacing: SPAWN.minEnemySpacing,
      maxAttempts: SPAWN.maxAttempts * 4,
      targets: this.activePlayers.map((p) => ({ x: p.x, y: p.y })),
      distanceFalloff: SPAWN.enemyDistanceFalloff,
      isValidPoint: (candidate) => {
        // The boss zone is placed deliberately and the dragon flies over terrain, so it is trusted as drawn.
        if (isBoss) return true;
        if (!canStandAt(this.collision, candidate.x, candidate.y, enemyCollisionBodyFromStats(stats))) {
          return false;
        }
        // Reject pockets sealed off by walls/water, where no player could ever be chased from.
        if (this.activePlayers.length === 0) return true;
        return this.activePlayers.some((p) => this.pathfinder.reachable(candidate, p));
      },
    });
    if (!point) return;

    const id = `e${this.nextId++}`;
    this.enemies.set(id, {
      id,
      x: point.x,
      y: point.y,
      type: pick.type,
      stats,
      // Per-instance role rolled at spawn, so a batch is a mix of throwers and melee.
      isThrower: stats.projectile != null && Math.random() < stats.rangedRatio,
      targetId: null,
      health: stats.health,
      lastAttackAt: 0,
      action: null,
      knockbackUntil: 0,
      windupHitAt: 0,
      windupKind: 'melee',
      dying: false,
      diedAt: 0,
    });
    return id;
  }

  // Summons the dragon once at the survive mark; returns a match-end result once it's slain, else null.
  updateBoss() {
    if (!this.bossSpawned) {
      const id = this.spawn('dragon');
      if (id) {
        // Grow the boss per extra player so the fight length holds steady in co-op.
        const boss = this.enemies.get(id);
        const cfg = ZOMBIE_ENEMY_TYPES.find((t) => t.type === 'dragon');
        const bonus = (cfg?.healthPerExtraPlayer || 0) * Math.max(0, this.activePlayers.length - 1);
        boss.health += bonus;
        boss.stats.health += bonus;
        this.bossId = id;
        this.bossSpawned = true;
      }
      return null; // just summoned (or the map was momentarily full) — fight is on
    }
    const boss = this.enemies.get(this.bossId);
    if (!boss || boss.dying) return { reason: 'boss-defeated' };
    return null;
  }

  // Frost Nova: slows every enemy in radius, refreshing rather than stacking so repeat casts can't freeze.
  applySlow(hitbox, radius, slow) {
    if (!slow) return;
    const until = Date.now() + slow.durationMs;
    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;
      if (!hitboxesWithinRange(hitbox, enemyHitbox(enemy), radius)) continue;
      enemy.slowUntil = until;
      enemy.slowMultiplier = slow.multiplier;
    }
  }

  // Blessing: the debuff sits on the enemy, not the caster, so a weakened zombie hits every player for less.
  applyWeaken(hitbox, radius, weaken) {
    if (!weaken) return;
    const until = Date.now() + weaken.durationMs;
    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;
      if (!hitboxesWithinRange(hitbox, enemyHitbox(enemy), radius)) continue;
      enemy.weakenUntil = until;
      enemy.weakenMultiplier = weaken.multiplier;
    }
  }

  moveEnemy(enemy, deltaX, deltaY) {
    const body = enemyCollisionBodyFromStats(enemy.stats);
    const moved = moveWithCollision(
      this.collision,
      enemy,
      deltaX,
      deltaY,
      {
        minX: body.halfWidth,
        maxX: this.bounds.width - body.halfWidth,
        minY: body.height,
        maxY: this.bounds.height,
      },
      body,
    );
    enemy.x = moved.x;
    enemy.y = moved.y;
  }

  // Straight-line move for fliers: ignores collision, only clamps to the world bounds.
  moveFlying(enemy, deltaX, deltaY) {
    enemy.x = Math.max(0, Math.min(this.bounds.width, enemy.x + deltaX));
    enemy.y = Math.max(0, Math.min(this.bounds.height, enemy.y + deltaY));
  }

  // Nudges a wedged enemy sideways to slip free of wall corners or crowd pileups.
  unstick(enemy, dir, beforeX, beforeY) {
    const wanted = dir.x !== 0 || dir.y !== 0;
    const moved = Math.hypot(enemy.x - beforeX, enemy.y - beforeY);
    enemy.stuckTicks = wanted && moved < ENEMY_MOVEMENT.stuckEpsilon ? (enemy.stuckTicks || 0) + 1 : 0;
    if (enemy.stuckTicks < ENEMY_MOVEMENT.stuckTicks) return;

    enemy.stuckTicks = 0;
    const sign = enemy.stuckSign || 1;
    const nudge = enemy.stats.speed;
    // Perpendicular to the blocked direction = along the wall.
    const px = -dir.y * nudge;
    const py = dir.x * nudge;
    const sx = enemy.x;
    const sy = enemy.y;
    this.moveEnemy(enemy, px * sign, py * sign);
    if (Math.hypot(enemy.x - sx, enemy.y - sy) < ENEMY_MOVEMENT.stuckEpsilon) {
      // That side was blocked too; try the other side next time.
      enemy.stuckSign = -sign;
      this.moveEnemy(enemy, px * -sign, py * -sign);
    }
  }

  // Advances enemy AI, movement and attacks by one tick.
  tick(players) {
    const now = Date.now();
    const playerDamage = [];
    this.activePlayers = players;

    // Drop dead enemies once their death animation has played.
    for (const [id, enemy] of this.enemies) {
      if (enemy.dying && now - enemy.diedAt >= ENEMY_COMBAT.deathLingerMs) {
        this.enemies.delete(id);
      }
    }

    // Bombs and arrows already in the air keep flying even if every enemy dies.
    if (this.enemies.size === 0) {
      this.updateProjectiles(players, playerDamage, now);
      this.updatePlayerShots(now);
      return { playerDamage };
    }

    this.pathfinder.prepare(players);

    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;

      // Reeling enemies can't chase or start attacks; an in-flight wind-up resolves after the reel.
      if (enemy.knockbackUntil && now < enemy.knockbackUntil) {
        enemy.action = 'take_hit';
        this.moveEnemy(enemy, enemy.knockbackVx, enemy.knockbackVy);
        continue;
      }

      // Preserve an active take_hit signal; clear anything else.
      if (enemy.action !== 'take_hit' || now >= enemy.actionExpiresAt) {
        enemy.action = null;
      }

      // Mid wind-up: hold position, then resolve — a swing lands only if the target is still in reach, a throw releases the bomb.
      if (enemy.windupHitAt) {
        const isThrow = enemy.windupKind === 'throw';
        if (now < enemy.windupHitAt) {
          enemy.action = isThrow ? 'throw' : 'attack';
          continue;
        }
        enemy.windupHitAt = 0;
        const target = players.find((p) => p.id === enemy.targetId);
        if (target) enemy.face = target.x >= enemy.x ? 1 : -1;
        if (isThrow) {
          // The projectile lands on the target's spot at this instant, regardless of where they move next.
          if (target) this.throwProjectile(enemy, target);
        } else if (target && hitboxesWithinRange(enemyHitbox(enemy), target.hitbox, enemy.stats.attackRange)) {
          playerDamage.push({
            playerId: target.id,
            amount: enemyDamage(enemy, enemy.stats.attackDamage, now),
            sourceX: enemy.x,
            sourceY: enemy.y,
            enemyId: enemy.id,
          });
        }
        continue;
      }
      this.updateTarget(enemy, players);
      if (enemy.targetId === null) continue;

      const target = players.find((p) => p.id === enemy.targetId);
      if (!target) {
        enemy.targetId = null;
        continue;
      }

      // Always square up to the target so attacks never play facing away from the player.
      enemy.face = target.x >= enemy.x ? 1 : -1;

      // A cornered thrower melees; at distance it throws. Melee instances only ever have the short reach.
      const inMelee = hitboxesWithinRange(enemyHitbox(enemy), target.hitbox, enemy.stats.attackRange);
      const canThrow = enemy.isThrower
        && hitboxesWithinRange(enemyHitbox(enemy), target.hitbox, enemy.stats.throwRange);
      if (inMelee || canThrow) {
        // Throws use their own (slower) cooldown; melee swings use the base one.
        const throwing = !inMelee && canThrow;
        const cooldown = throwing ? enemy.stats.projectile.cooldownMs : enemy.stats.attackCooldownMs;
        if (now - enemy.lastAttackAt >= cooldown) {
          enemy.lastAttackAt = now;
          enemy.windupKind = throwing ? 'throw' : 'melee';
          enemy.action = throwing ? 'throw' : 'attack';
          enemy.windupHitAt = now + ENEMY_COMBAT.attackWindupMs;
        }
      } else if (enemy.stats.flies) {
        // Straight vector to the target, through anything in the way.
        const dx = target.x - enemy.x;
        const dy = target.y - enemy.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = enemySpeed(enemy, now);
        this.moveFlying(enemy, (dx / len) * speed, (dy / len) * speed);
      } else {
        const dir = this.pathfinder.direction(enemy, target);
        const beforeX = enemy.x;
        const beforeY = enemy.y;
        const speed = enemySpeed(enemy, now);
        this.moveEnemy(enemy, dir.x * speed, dir.y * speed);
        this.unstick(enemy, dir, beforeX, beforeY);
      }
    }

    this.separate();

    for (const enemy of this.enemies.values()) {
      if (enemy.stats.flies) continue; // fliers ignore collision entirely
      this.moveEnemy(enemy, 0, 0);
    }

    this.updateProjectiles(players, playerDamage, now);
    this.updateDots(now);
    this.updatePlayerShots(now);

    return { playerDamage };
  }

  // Living enemies as projectile targets; used to resolve flight and to assist aim.
  shotTargets() {
    const targets = [];
    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;
      targets.push({ id: enemy.id, hitbox: enemyHitbox(enemy), enemy });
    }
    return targets;
  }

  // Spawns a player-fired projectile; this mode's tick resolves its flight against enemies.
  firePlayerProjectile(player, cfg, dirX, dirY) {
    this.playerShots.spawn(player, cfg, dirX, dirY, this.shotTargets());
  }

  // Advances player arrows/specials against living enemies, crediting kills to the shooter.
  updatePlayerShots(now) {
    const targets = this.shotTargets();
    this.playerShots.tick(now, targets, (target, shot) => {
      const enemy = target.enemy;
      if (shot.dot) {
        // Fresh hits refresh the poison rather than stacking timers.
        enemy.dot = {
          ticksLeft: shot.dot.ticks,
          intervalMs: shot.dot.intervalMs,
          nextAt: now + shot.dot.intervalMs,
          damage: shot.dot.damage,
          ownerId: shot.ownerId,
        };
      }
      if (damageEnemy(enemy, shot.damage)) this.creditKill(shot.ownerId);
    });
  }

  updateDots(now) {
    for (const enemy of this.enemies.values()) {
      if (enemy.dying || !enemy.dot || now < enemy.dot.nextAt) continue;
      enemy.dot.nextAt = now + enemy.dot.intervalMs;
      enemy.dot.ticksLeft -= 1;
      if (damageEnemy(enemy, enemy.dot.damage)) this.creditKill(enemy.dot.ownerId);
      if (enemy.dot.ticksLeft <= 0) enemy.dot = null;
    }
  }

  // Projectile and poison kills resolve after the attack event, so credit them here.
  creditKill(ownerId) {
    const owner = state.players.get(ownerId);
    if (!owner) return;
    owner.kills = (owner.kills || 0) + 1;
    emitGameEvent('kill', { playerId: owner.playerId, name: owner.name, kills: owner.kills });
  }

  // The landing spot is fixed at release, so moving away dodges it.
  throwProjectile(enemy, target) {
    const cfg = enemy.stats.projectile;
    const startX = enemy.x;
    const startY = enemy.y - 20; // hand height
    // Aim from the release point so the trajectory passes exactly through the target.
    const dx = target.x - startX;
    const dy = target.y - startY;
    const len = Math.hypot(dx, dy) || 1;
    const id = `p${this.nextProjectileId++}`;
    this.projectiles.set(id, {
      id,
      sprite: cfg.sprite,
      scale: cfg.scale,
      x: startX,
      y: startY,
      targetX: target.x,
      targetY: target.y,
      vx: (dx / len) * cfg.speed,
      vy: (dy / len) * cfg.speed,
      angle: Math.atan2(dy, dx), // flight heading, so the client can point the sprite
      // Read at release, so a bomb thrown by a weakened enemy lands soft even if the debuff lapses mid-flight.
      damage: enemyDamage(enemy, cfg.damage, Date.now()),
      splashRadius: cfg.splashRadius,
      explosionLingerMs: cfg.explosionLingerMs,
      exploded: false,
      removeAt: 0,
      ownerId: enemy.id,
    });
  }

  // On arrival projectiles explode, splash players in radius, then linger for the client's explosion anim.
  updateProjectiles(players, playerDamage, now) {
    for (const [id, proj] of this.projectiles) {
      if (proj.exploded) {
        if (now >= proj.removeAt) this.projectiles.delete(id);
        continue;
      }

      const step = Math.hypot(proj.vx, proj.vy) || 1;
      const reached = Math.hypot(proj.targetX - proj.x, proj.targetY - proj.y) <= step;
      // Safety net: detonate at the map edge so nothing flies off forever.
      const outOfBounds = proj.x < 0 || proj.y < 0
        || proj.x > this.bounds.width || proj.y > this.bounds.height;

      if (!reached && !outOfBounds) {
        proj.x += proj.vx;
        proj.y += proj.vy;
        continue;
      }

      // Detonate at the landing spot (the aimed target, or wherever it stopped).
      const blastX = reached ? proj.targetX : proj.x;
      const blastY = reached ? proj.targetY : proj.y;
      proj.x = blastX;
      proj.y = blastY;
      proj.exploded = true;
      proj.removeAt = now + proj.explosionLingerMs;
      const radiusSq = proj.splashRadius * proj.splashRadius;
      for (const p of players) {
        const pdx = p.x - blastX;
        const pdy = p.y - blastY;
        if (pdx * pdx + pdy * pdy <= radiusSq) {
          playerDamage.push({
            playerId: p.id,
            amount: proj.damage,
            sourceX: blastX,
            sourceY: blastY,
            enemyId: proj.ownerId,
          });
        }
      }
    }
  }

  // Radial damage from a player's swing. `attacker` is unused, but keeps the signature uniform across modes.
  playerAttack(attacker, hitbox, range, damage) {
    const attackerHitbox = hitbox;
    let hits = 0;
    let kills = 0;

    for (const enemy of this.enemies.values()) {
      if (enemy.dying) continue;

      if (!hitboxesWithinRange(attackerHitbox, enemyHitbox(enemy), range)) continue;

      hits++;
      const now = Date.now();
      if (damageEnemy(enemy, damage)) {
        kills++;
      } else if (!enemy.stats.knockbackResist && now >= (enemy.knockbackImmuneUntil || 0)) {
        // Brief immunity after the shove so rapid attacks can't stun-lock it.
        const cx = (attackerHitbox.left + attackerHitbox.right) / 2;
        const cy = (attackerHitbox.top + attackerHitbox.bottom) / 2;
        const dx = enemy.x - cx;
        const dy = enemy.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        enemy.knockbackVx = (dx / len) * ENEMY_COMBAT.knockbackSpeed;
        enemy.knockbackVy = (dy / len) * ENEMY_COMBAT.knockbackSpeed;
        enemy.knockbackUntil = now + ENEMY_COMBAT.knockbackMs;
        enemy.knockbackImmuneUntil = now + ENEMY_COMBAT.knockbackMs + ENEMY_COMBAT.knockbackImmunityMs;
      }
    }

    return { hit: hits > 0, killed: kills > 0, hits, kills };
  }

  // Used by reflect to bounce an attack back at its source; returns true if it killed the enemy.
  damageEnemyById(id, amount) {
    const enemy = this.enemies.get(id);
    if (!enemy || enemy.dying) return false;
    return damageEnemy(enemy, amount);
  }

  updateTarget(enemy, players) {
    const { aggroRange, leashMultiplier, commitForLife, retargetNearest } = enemy.stats;

    // Keep the current target unless they escape or die (retargeters always re-scan below).
    if (!retargetNearest && enemy.targetId !== null) {
      const current = players.find((p) => p.id === enemy.targetId);
      if (!current) {
        enemy.targetId = null;
      } else if (!commitForLife && distance(enemy, current) > aggroRange * leashMultiplier) {
        enemy.targetId = null;
      } else {
        return;
      }
    }

    // Target the closest player within range.
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

  // Pushes overlapping enemies apart so they don't stack.
  separate() {
    const list = Array.from(this.enemies.values()).filter((e) => !e.stats.flies);
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
        this.moveEnemy(a, -ux * push, -uy * push);
        this.moveEnemy(b, ux * push, uy * push);
      }
    }
  }

  getStatePatch() {
    return {
      enemies: Array.from(this.enemies.values()).map((e) => ({
        id: e.id,
        x: Math.round(e.x),
        y: Math.round(e.y),
        type: e.type,
        action: e.action || null,
        // Faces the current target; the client falls back to movement flip when null.
        face: e.face || null,
        hp: e.health,
        maxHp: e.stats.health,
      })),
      // Enemy bombs and player shots share the client's pipeline; ids never collide (p* vs s*).
      projectiles: [
        ...Array.from(this.projectiles.values()).map((p) => ({
          id: p.id,
          sprite: p.sprite,
          x: Math.round(p.x),
          y: Math.round(p.y),
          exploded: p.exploded,
          scale: p.scale,
          angle: p.angle,
        })),
        ...this.playerShots.list(),
      ],
    };
  }
}
