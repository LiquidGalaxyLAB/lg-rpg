import { PVP, PVP_TEAMS, SOCKET_EVENTS, SPAWN } from '../../game_constants.js';
import { io } from '../app.js';
import { state } from '../state.js';
import { findSpawnPoint } from '../lib/spawn.js';
import { hitboxesWithinRange } from '../lib/hitbox.js';
import { playerHitbox } from '../players.js';

// Match phases: confined -> released-but-safe -> live -> finished.
const PHASE = Object.freeze({ LOCK: 'lock', GRACE: 'grace', ACTIVE: 'active', ENDED: 'ended' });

// Picks a random rectangle from a list of map zones.
function pickRect(rects) {
  if (!rects || rects.length === 0) return null;
  return rects[Math.floor(Math.random() * rects.length)];
}

// Returns the center of a rectangle, used as a placement fallback.
function rectCenter(rect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export class ZoneCaptureMode {
  constructor(map) {
    this.bounds = map.bounds;
    this.spawnBox = pickRect(map.zones.playerSpawn);
    const zoneRect = pickRect(map.zones.captureZone);
    this.zone = zoneRect
      ? { x: zoneRect.x, y: zoneRect.y, width: zoneRect.width, height: zoneRect.height, currentTeam: 'neutral' }
      : null;

    this.phase = PHASE.LOCK;
    this.scores = { teamA: 0, teamB: 0 };
    this.pendingDamage = [];
    this.respawnAt = new Map(); // playerId -> timestamp the player returns
    this.invulnUntil = new Map(); // playerId -> timestamp protection expires

    this.startedAt = 0;
    this.lockEndsAt = 0;
    this.graceEndsAt = 0;
    this.roundEndsAt = 0;
  }

  // Balances teams and places all players inside the shared spawn box before start().
  placePlayers(players) {
    // Fill unassigned players into the smaller team for balance.
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

    if (!this.spawnBox) return;
    const occupied = [];
    for (const p of players) {
      const point = this.spawnPoint(occupied);
      p.x = point.x;
      p.y = point.y;
      occupied.push({ x: point.x, y: point.y });
    }
  }

  // Finds a clear point inside the spawn box, falling back to its center.
  spawnPoint(occupied) {
    return (
      findSpawnPoint([this.spawnBox], occupied, {
        edgePadding: SPAWN.edgePadding,
        minSpacing: SPAWN.minPlayerSpacing,
        maxAttempts: SPAWN.maxAttempts,
      }) || rectCenter(this.spawnBox)
    );
  }

  // Starts the round timers. Players are already placed by placePlayers().
  start() {
    const now = Date.now();
    this.startedAt = now;
    this.lockEndsAt = now + PVP.lockMs;
    this.graceEndsAt = this.lockEndsAt + PVP.graceMs;
    this.roundEndsAt = this.lockEndsAt + PVP.roundDurationMs;
    this.phase = PHASE.LOCK;
  }

  // Clears mode state.
  stop() {
    this.phase = PHASE.ENDED;
    this.respawnAt.clear();
    this.invulnUntil.clear();
    this.pendingDamage = [];
  }

  // While locked, players are confined to the shared spawn box.
  getConfinement() {
    return this.phase === PHASE.LOCK ? this.spawnBox : null;
  }

  // Advances phase, respawns, and zone control; returns queued PvP damage for the game loop.
  tick() {
    const now = Date.now();
    this.advancePhase(now);
    this.processRespawns(now);
    this.updateZoneControl();

    const playerDamage = this.pendingDamage;
    this.pendingDamage = [];
    return { playerDamage };
  }

  // Moves the match through its timed phases.
  advancePhase(now) {
    if (this.phase === PHASE.LOCK && now >= this.lockEndsAt) this.phase = PHASE.GRACE;
    if (this.phase === PHASE.GRACE && now >= this.graceEndsAt) this.phase = PHASE.ACTIVE;
  }

  // Schedules respawns for downed players and revives them when due.
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

  // Returns a player to full health at the spawn box with brief invulnerability.
  revive(player, now) {
    const occupied = Array.from(state.players.values())
      .filter((o) => o !== player && !o.dead)
      .map((o) => ({ x: o.x, y: o.y }));
    const point = this.spawnBox ? this.spawnPoint(occupied) : { x: player.x, y: player.y };

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

    // Tell the respawned player's controller to return to the game controls.
    if (player.socketId) {
      io.to(player.socketId).emit(SOCKET_EVENTS.YOU_RESPAWNED, {
        playerId: player.playerId,
        invulnMs: PVP.invulnMs,
      });
    }
  }

  // Recomputes which team controls the zone and increments their counter.
  updateZoneControl() {
    if (!this.zone || this.phase === PHASE.LOCK || this.phase === PHASE.ENDED) {
      if (this.zone) this.zone.currentTeam = 'neutral';
      return;
    }

    let teamAInside = false;
    let teamBInside = false;
    for (const p of state.players.values()) {
      if (p.dead || !this.insideZone(p)) continue;
      if (p.team === 'teamA') teamAInside = true;
      else if (p.team === 'teamB') teamBInside = true;
    }

    if (teamAInside && !teamBInside) {
      this.scores.teamA += 1;
      this.zone.currentTeam = 'teamA';
    } else if (teamBInside && !teamAInside) {
      this.scores.teamB += 1;
      this.zone.currentTeam = 'teamB';
    } else {
      this.zone.currentTeam = 'neutral';
    }
  }

  // Tests whether a player's feet are within the zone rectangle.
  insideZone(p) {
    const z = this.zone;
    return p.x >= z.x && p.x <= z.x + z.width && p.y >= z.y && p.y <= z.y + z.height;
  }

  // Queues damage from a player's attack against opposing-team players in range.
  playerAttack(attacker, hitbox, range, damage) {
    if (this.phase !== PHASE.ACTIVE || !attacker || attacker.dead) {
      return { hit: false, killed: false, hits: 0, kills: 0 };
    }

    const now = Date.now();
    const queuedByTarget = new Map();
    let hits = 0;
    let kills = 0;

    for (const target of state.players.values()) {
      if (target === attacker || target.dead) continue;
      if (target.team === attacker.team) continue;
      if ((this.invulnUntil.get(target.playerId) || 0) > now) continue;
      if (!hitboxesWithinRange(hitbox, playerHitbox(target), range)) continue;

      hits += 1;
      const already = queuedByTarget.get(target.playerId) || 0;
      const projected = target.health - already;
      if (projected > 0 && projected - damage <= 0) kills += 1;
      queuedByTarget.set(target.playerId, already + damage);
      this.pendingDamage.push({ playerId: target.playerId, amount: damage });
    }

    return { hit: hits > 0, killed: kills > 0, hits, kills };
  }

  // Returns the round result once the timer expires (null while still running).
  checkMatchEnd() {
    if (this.phase === PHASE.ENDED || Date.now() < this.roundEndsAt) return null;
    this.phase = PHASE.ENDED;
    if (this.zone) this.zone.currentTeam = 'neutral';

    const { teamA, teamB } = this.scores;
    const winner = teamA > teamB ? 'teamA' : teamB > teamA ? 'teamB' : null;
    return { reason: 'pvp-round-end', winner, scores: { ...this.scores } };
  }

  // Returns the client-facing PvP state patch.
  getStatePatch() {
    const now = Date.now();
    return {
      pvp: {
        phase: this.phase,
        spawnBox: this.spawnBox,
        zone: this.zone,
        scores: this.scores,
        lockRemainingMs: Math.max(0, this.lockEndsAt - now),
        roundRemainingMs: Math.max(0, this.roundEndsAt - now),
      },
    };
  }
}
