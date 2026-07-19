// Player-fired projectiles: straight/homing, piercing, splash. Each mode supplies targets + onHit.

import { PLAYER_RANGED } from '../../game_constants.js';

// Extra reach around a target's hitbox so a fast shot can't skim past a thin edge.
const HIT_PAD = 6;

const ASSIST_COS = Math.cos((PLAYER_RANGED.aimAssist.maxAngleDeg * Math.PI) / 180);

export class PlayerProjectiles {
  constructor(bounds) {
    this.bounds = bounds;
    this.shots = new Map();
    this.nextId = 1;
  }

  clear() {
    this.shots.clear();
  }

  // Launches a shot from the owner's bow height along a unit direction vector.

  spawn(owner, cfg, dirX, dirY, targets = null) {
    const id = `s${this.nextId++}`;
    if (targets) ({ dirX, dirY } = this.assistAim(owner, cfg, dirX, dirY, targets));
    this.shots.set(id, {
      id,
      ownerId: owner.playerId,
      ownerTeam: owner.team ?? null,
      sprite: cfg.sprite,
      scale: cfg.scale,
      x: owner.x + dirX * 16,
      y: owner.y - 24 + dirY * 16,
      vx: dirX * cfg.speed,
      vy: dirY * cfg.speed,
      angle: Math.atan2(dirY, dirX),
      speed: cfg.speed,
      damage: cfg.damage,
      splashRadius: cfg.splashRadius || 0,
      pierce: cfg.pierce === true,
      homing: cfg.homing || null,
      dot: cfg.dot || null,
      lingerMs: cfg.explosionLingerMs ?? 300,
      remainingRange: cfg.maxRange,
      hitIds: new Set(), // each target is damaged at most once per shot
      exploded: false,
      removeAt: 0,
    });
  }

  // Advances all shots one tick. Owner and teammates are never hit; onHit applies the damage.
  tick(now, targets, onHit) {
    for (const [id, shot] of this.shots) {
      if (shot.exploded) {
        if (now >= shot.removeAt) this.shots.delete(id);
        continue;
      }

      if (shot.homing) this.steer(shot, targets);
      shot.x += shot.vx;
      shot.y += shot.vy;
      shot.remainingRange -= shot.speed;

      let struck = false;
      for (const target of targets) {
        if (!this.canHit(shot, target)) continue;
        const hb = target.hitbox;
        if (shot.x < hb.left - HIT_PAD || shot.x > hb.right + HIT_PAD) continue;
        if (shot.y < hb.top - HIT_PAD || shot.y > hb.bottom + HIT_PAD) continue;
        shot.hitIds.add(target.id);
        onHit(target, shot);
        struck = true;
        if (!shot.pierce) break;
      }

      const outOfBounds = shot.x < 0 || shot.y < 0
        || shot.x > this.bounds.width || shot.y > this.bounds.height;
      // Piercing shots fly through victims and only stop when their range is spent.
      if ((struck && !shot.pierce) || shot.remainingRange <= 0 || outOfBounds) {
        this.detonate(shot, targets, onHit, now);
      }
    }
  }


  assistAim(owner, cfg, dirX, dirY, targets) {
    const originX = owner.x + dirX * 16;
    const originY = owner.y - 24 + dirY * 16;
    const rangeSq = cfg.maxRange * cfg.maxRange;
    let bestCos = ASSIST_COS;
    let best = null;
    for (const target of targets) {
      // Reuse the flight-time filter so assist never locks onto the shooter or a teammate.
      if (!this.canHit({ hitIds: new Set(), ownerId: owner.playerId, ownerTeam: owner.team ?? null }, target)) continue;
      const hb = target.hitbox;
      const dx = (hb.left + hb.right) / 2 - originX;
      const dy = (hb.top + hb.bottom) / 2 - originY;
      const distSq = dx * dx + dy * dy;
      if (distSq > rangeSq || distSq === 0) continue;
      // dot product of the two unit vectors == cos(angle between them); bigger == closer to the aim.
      const cos = (dx * dirX + dy * dirY) / Math.sqrt(distSq);
      if (cos > bestCos) {
        bestCos = cos;
        best = { dirX: dx / Math.sqrt(distSq), dirY: dy / Math.sqrt(distSq) };
      }
    }
    return best || { dirX, dirY };
  }

  canHit(shot, target) {
    if (shot.hitIds.has(target.id)) return false;
    if (target.id === shot.ownerId) return false;
    if (shot.ownerTeam && target.team && target.team === shot.ownerTeam) return false;
    return true;
  }

  // Ends the flight: boom anim plays, splash hits the radius (hitIds prevents double damage).
  detonate(shot, targets, onHit, now) {
    shot.exploded = true;
    shot.removeAt = now + shot.lingerMs;
    if (shot.splashRadius <= 0) return;
    const radiusSq = shot.splashRadius * shot.splashRadius;
    for (const target of targets) {
      if (!this.canHit(shot, target)) continue;
      const hb = target.hitbox;
      const dx = (hb.left + hb.right) / 2 - shot.x;
      const dy = (hb.top + hb.bottom) / 2 - shot.y;
      if (dx * dx + dy * dy > radiusSq) continue;
      shot.hitIds.add(target.id);
      onHit(target, shot);
    }
  }

  // Curves a homing shot toward the nearest target it can still hit.
  steer(shot, targets) {
    let bestSq = shot.homing.acquireRange * shot.homing.acquireRange;
    let best = null;
    for (const target of targets) {
      if (!this.canHit(shot, target)) continue;
      const hb = target.hitbox;
      const cx = (hb.left + hb.right) / 2;
      const cy = (hb.top + hb.bottom) / 2;
      const dSq = (cx - shot.x) ** 2 + (cy - shot.y) ** 2;
      if (dSq < bestSq) {
        bestSq = dSq;
        best = { x: cx, y: cy };
      }
    }
    if (!best) return;
    const desired = Math.atan2(best.y - shot.y, best.x - shot.x);
    let diff = desired - shot.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    shot.angle += Math.max(-shot.homing.turnRate, Math.min(shot.homing.turnRate, diff));
    shot.vx = Math.cos(shot.angle) * shot.speed;
    shot.vy = Math.sin(shot.angle) * shot.speed;
  }

  // Client-facing entries, merged into the game state's projectiles array.
  list() {
    return Array.from(this.shots.values()).map((s) => ({
      id: s.id,
      sprite: s.sprite,
      x: Math.round(s.x),
      y: Math.round(s.y),
      exploded: s.exploded,
      scale: s.scale,
      angle: s.angle,
    }));
  }
}
