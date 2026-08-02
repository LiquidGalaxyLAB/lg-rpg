import { PVP, PVP_TEAMS, SOCKET_EVENTS, SPAWN } from '../../game_constants.js';
import { io } from '../app.js';
import { state } from '../state.js';
import { findSpawnPoint } from '../lib/spawn.js';
import { hitboxesWithinRange } from '../lib/hitbox.js';
import { playerHitbox } from '../players.js';
import { PlayerProjectiles } from '../lib/player-projectiles.js';
import { captureScoringInterval } from '../lib/pvp-scoring.js';

// Match phases: live -> finished. Teams spawn on opposite sides, so no lock/grace is needed.
const PHASE = Object.freeze({ ACTIVE: 'active', ENDED: 'ended' });

const MS_PER_POINT = 1000 * PVP.secondsPerPoint;

function pickRect(rects) {
  if (!rects || rects.length === 0) return null;
  return rects[Math.floor(Math.random() * rects.length)];
}

function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export class ZoneCaptureMode {
  constructor(map) {
    this.bounds = map.bounds;
    // Each team gets its own spawn box; maps without them fall back to the shared one.
    this.teamSpawns = {
      teamA: pickRect(map.zones.teamASpawn) || pickRect(map.zones.playerSpawn),
      teamB: pickRect(map.zones.teamBSpawn) || pickRect(map.zones.playerSpawn),
    };
    // One capture zone per round, picked at random from the map's candidate circles.
    const zoneRect = pickRect(map.zones.captureZone);
    this.zones = zoneRect
      ? [{
          x: zoneRect.x,
          y: zoneRect.y,
          width: zoneRect.width,
          height: zoneRect.height,
          ellipse: zoneRect.ellipse === true,
          currentTeam: 'neutral',
        }]
      : [];

    this.phase = PHASE.ACTIVE;
    // Real milliseconds, not loop ticks: the loop drifts under load and would stretch PVP.secondsPerPoint on a busy rig.
    this.zoneHeldMs = { teamA: 0, teamB: 0 };
    this.lastZoneUpdateAt = 0;
    this.pendingDamage = [];
    this.respawnAt = new Map(); // playerId -> timestamp the player returns
    this.invulnUntil = new Map(); // playerId -> timestamp protection expires
    this.playerShots = new PlayerProjectiles(map.bounds);
    this.dots = new Map(); // playerId -> active poison stack

    this.startedAt = 0;
    this.roundEndsAt = 0;
    this.forfeitSince = 0; // when a team first emptied, so forfeits need sustained absence
  }

  // Fills unassigned players into the smaller team, then places everyone in their team's spawn box.
  placePlayers(players) {
    const count = { teamA: 0, teamB: 0 };
    for (const p of players) {
      if (PVP_TEAMS.includes(p.team)) count[p.team] += 1;
    }
    for (const p of players) {
      if (!PVP_TEAMS.includes(p.team)) {
        const team = count.teamA <= count.teamB ? 'teamA' : 'teamB';
        p.team = team;
        count[team] += 1;
      }
    }

    const occupied = { teamA: [], teamB: [] };
    for (const p of players) {
      const box = this.teamSpawns[p.team];
      if (!box) continue;
      const point = this.spawnPoint(box, occupied[p.team]);
      p.x = point.x;
      p.y = point.y;
      occupied[p.team].push({ x: point.x, y: point.y });
    }
  }

  // A clear point inside a spawn box, falling back to its center.
  spawnPoint(box, occupied) {
    return (
      findSpawnPoint([box], occupied, {
        edgePadding: SPAWN.edgePadding,
        minSpacing: SPAWN.minPlayerSpacing,
        maxAttempts: SPAWN.maxAttempts,
      }) || rectCenter(box)
    );
  }

  // Starts the round timer. Players are already placed by placePlayers().
  start() {
    const now = Date.now();
    this.startedAt = now;
    this.roundEndsAt = now + PVP.roundDurationMs;
    this.lastZoneUpdateAt = now;
    this.phase = PHASE.ACTIVE;
  }

  stop() {
    this.phase = PHASE.ENDED;
    this.forfeitSince = 0;
    this.respawnAt.clear();
    this.invulnUntil.clear();
    this.pendingDamage = [];
    this.playerShots.clear();
    this.dots.clear();
  }

  // Advances respawns and zone control; returns queued PvP damage for the game loop.
  tick() {
    const now = Date.now();
    this.processRespawns(now);
    this.updateZoneControl(now);
    this.updatePlayerShots(now);
    this.updateDots(now);

    const playerDamage = this.pendingDamage;
    this.pendingDamage = [];
    return { playerDamage };
  }

  // Hittable players as projectile targets; just-respawned (invulnerable) ones are omitted so aim assist skips them too.
  shotTargets(now) {
    const targets = [];
    for (const p of state.players.values()) {
      if (!p.socketId || p.dead) continue;
      if ((this.invulnUntil.get(p.playerId) || 0) > now) continue;
      targets.push({ id: p.playerId, team: p.team, hitbox: playerHitbox(p), player: p });
    }
    return targets;
  }

  // Spawns a player-fired projectile; this mode's tick resolves it against opposing players.
  firePlayerProjectile(player, cfg, dirX, dirY) {
    if (this.phase !== PHASE.ACTIVE || !player || player.dead) return;
    this.playerShots.spawn(player, cfg, dirX, dirY, this.shotTargets(Date.now()));
  }

  // Advances player shots. No friendly fire; just-respawned players are omitted so shots pass through.
  updatePlayerShots(now) {
    const targets = this.shotTargets(now);
    this.playerShots.tick(now, targets, (target, shot) => {
      if (this.phase !== PHASE.ACTIVE) return;
      this.queueShotDamage(target.player, shot.damage, shot);
      if (shot.dot) {
        // Fresh hits refresh the poison rather than stacking timers.
        this.dots.set(target.id, {
          ticksLeft: shot.dot.ticks,
          intervalMs: shot.dot.intervalMs,
          nextAt: now + shot.dot.intervalMs,
          damage: shot.dot.damage,
          ownerId: shot.ownerId,
        });
      }
    });
  }

  // Death or respawn clears the poison stack.
  updateDots(now) {
    for (const [playerId, dot] of this.dots) {
      const target = state.players.get(playerId);
      if (!target || target.dead || this.phase !== PHASE.ACTIVE) {
        this.dots.delete(playerId);
        continue;
      }
      if (now < dot.nextAt) continue;
      dot.nextAt = now + dot.intervalMs;
      dot.ticksLeft -= 1;
      this.queueShotDamage(target, dot.damage, { ownerId: dot.ownerId });
      if (dot.ticksLeft <= 0) this.dots.delete(playerId);
    }
  }

  // Queues projectile/poison damage; the game loop credits the kill when the damage lands.
  queueShotDamage(target, amount, shot) {
    this.pendingDamage.push({
      playerId: target.playerId,
      amount,
      sourceX: shot.x ?? null,
      sourceY: shot.y ?? null,
      attackerId: shot.ownerId ?? null,
    });
  }

  // Queues damage by player id for the reflect shield; flagged as bounced so it can't ping-pong.
  damagePlayerById(playerId, amount, attackerId) {
    const target = state.players.get(playerId);
    if (!target?.socketId || target.dead || this.phase !== PHASE.ACTIVE) return false;
    this.pendingDamage.push({
      playerId,
      amount,
      sourceX: null,
      sourceY: null,
      attackerId: attackerId ?? null,
      bounced: true,
    });
    return true;
  }

  processRespawns(now) {
    for (const p of state.players.values()) {
      if (!p.dead) {
        this.respawnAt.delete(p.playerId);
        continue;
      }
      if (!this.respawnAt.has(p.playerId)) {
        this.respawnAt.set(p.playerId, now + PVP.respawnDelayMs);
      } else if (now >= this.respawnAt.get(p.playerId)) {
        this.respawnAt.delete(p.playerId);
        this.revive(p, now);
      }
    }
  }

  // Returns a player to full health at their team's spawn box with brief invulnerability.
  revive(player, now) {
    const box = this.teamSpawns[player.team];
    const occupied = Array.from(state.players.values())
      .filter((o) => o !== player && !o.dead)
      .map((o) => ({ x: o.x, y: o.y }));
    const point = box ? this.spawnPoint(box, occupied) : { x: player.x, y: player.y };

    player.x = point.x;
    player.y = point.y;
    player.health = player.maxHealth;
    player.dead = false;
    player.action = null;
    player.actionExpiresAt = 0;
    player.velocityX = 0;
    player.velocityY = 0;
    player.lowHealthSignaled = false;
    this.invulnUntil.set(player.playerId, now + PVP.invulnMs);
    this.dots.delete(player.playerId); // a fresh life starts clean of poison

    if (player.socketId) {
      io.to(player.socketId).emit(SOCKET_EVENTS.YOU_RESPAWNED, {
        playerId: player.playerId,
        invulnMs: PVP.invulnMs,
      });
    }
  }

  // Credits the full real interval to the team that controlled the zone during that interval, then records the controller for the next interval.
  updateZoneControl(now = Date.now()) {
    if (this.phase !== PHASE.ACTIVE) return;
    const { effectiveNow, elapsedMs } = captureScoringInterval(
      now,
      this.lastZoneUpdateAt,
      this.roundEndsAt,
    );
    this.lastZoneUpdateAt = effectiveNow;
    for (const zone of this.zones) {
      if (PVP_TEAMS.includes(zone.currentTeam)) {
        this.zoneHeldMs[zone.currentTeam] += elapsedMs;
      }

      let teamAInside = false;
      let teamBInside = false;
      for (const p of state.players.values()) {
        if (!p.socketId || p.dead || !this.insideZone(p, zone)) continue;
        if (p.team === 'teamA') teamAInside = true;
        else if (p.team === 'teamB') teamBInside = true;
      }

      if (teamAInside && !teamBInside) {
        zone.currentTeam = 'teamA';
      } else if (teamBInside && !teamAInside) {
        zone.currentTeam = 'teamB';
      } else {
        zone.currentTeam = 'neutral';
      }
    }
  }

  // Whether a player's feet are inside a zone (circle or rectangle).
  insideZone(p, z) {
    if (z.ellipse) {
      const rx = z.width / 2;
      const ry = z.height / 2;
      const dx = (p.x - (z.x + rx)) / rx;
      const dy = (p.y - (z.y + ry)) / ry;
      return dx * dx + dy * dy <= 1;
    }
    return p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height;
  }

  // Capture points: one point per PVP.secondsPerPoint a team alone holds the circle.
  getScores() {
    return {
      teamA: Math.floor(this.zoneHeldMs.teamA / MS_PER_POINT),
      teamB: Math.floor(this.zoneHeldMs.teamB / MS_PER_POINT),
    };
  }

  // Queues damage from a player's attack against opposing-team players in range.
  playerAttack(attacker, hitbox, range, damage) {
    if (this.phase !== PHASE.ACTIVE || !attacker || attacker.dead) {
      return { hit: false, killed: false, hits: 0, kills: 0 };
    }

    const now = Date.now();
    let hits = 0;

    for (const target of state.players.values()) {
      if (!target.socketId || target === attacker || target.dead) continue;
      if (target.team === attacker.team) continue;
      if ((this.invulnUntil.get(target.playerId) || 0) > now) continue;
      if (!hitboxesWithinRange(hitbox, playerHitbox(target), range)) continue;

      hits += 1;
      this.pendingDamage.push({
        playerId: target.playerId,
        amount: damage,
        sourceX: attacker.x,
        sourceY: attacker.y,
        attackerId: attacker.playerId,
      });
    }

    // Kills are 0 on purpose: damage is queued, not applied; the game loop credits it when it lands.
    return { hit: hits > 0, killed: false, hits, kills: 0 };
  }

  announce(message, durationMs) {
    io.emit(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, { message, durationMs });
  }

  // Returns the round result when the timer expires or a whole team has left.
  checkMatchEnd() {
    if (this.phase === PHASE.ENDED) return null;
    // start() has not run yet, so there is no round to end — never read the unset 0 as "expired".
    if (!this.roundEndsAt) return null;

    const now = Date.now();

    // An empty team forfeits, but only after the grace window, so a brief drop-and-rejoin doesn't hand over the round.
    const counts = { teamA: 0, teamB: 0 };
    for (const p of state.players.values()) {
      if (p.socketId && PVP_TEAMS.includes(p.team)) counts[p.team] += 1;
    }
    const forfeitWinner =
      counts.teamA === 0 && counts.teamB > 0 ? 'teamB'
        : counts.teamB === 0 && counts.teamA > 0 ? 'teamA'
          : null;
    if (!forfeitWinner) {
      if (this.forfeitSince) {
        this.forfeitSince = 0;
        this.announce('Both teams are back — the round continues!', 3000);
      }
    } else {
      if (!this.forfeitSince) {
        this.forfeitSince = now;
        const leaver = forfeitWinner === 'teamA' ? 'Red' : 'Blue';
        const seconds = Math.round(PVP.forfeitGraceMs / 1000);
        this.announce(`${leaver} team disconnected — forfeit in ${seconds}s`, PVP.forfeitGraceMs);
      }
      if (now - this.forfeitSince >= PVP.forfeitGraceMs) {
        this.phase = PHASE.ENDED;
        for (const zone of this.zones) zone.currentTeam = 'neutral';
        return { reason: 'pvp-forfeit', winner: forfeitWinner, scores: this.getScores() };
      }
    }

    if (now < this.roundEndsAt) return null;
    this.phase = PHASE.ENDED;
    for (const zone of this.zones) zone.currentTeam = 'neutral';

    // Decide by full points so the winner always matches the displayed score.
    const scores = this.getScores();
    const winner = scores.teamA > scores.teamB ? 'teamA' : scores.teamB > scores.teamA ? 'teamB' : null;
    return { reason: 'pvp-round-end', winner, scores };
  }

  getStatePatch() {
    return {
      projectiles: this.playerShots.list(),
      pvp: {
        phase: this.phase,
        spawns: this.teamSpawns,
        zones: this.zones,
        scores: this.getScores(),
        roundRemainingMs: Math.max(0, this.roundEndsAt - Date.now()),
      },
    };
  }
}
