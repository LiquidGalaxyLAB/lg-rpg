import { GAME_LOOP, PVP, PVP_TEAMS, SOCKET_EVENTS, SPAWN } from '../../game_constants.js';
import { io } from '../app.js';
import { state } from '../state.js';
import { findSpawnPoint } from '../lib/spawn.js';
import { hitboxesWithinRange } from '../lib/hitbox.js';
import { playerHitbox } from '../players.js';

// Match phases: live -> finished. Teams spawn on opposite sides, so no lock/grace is needed.
const PHASE = Object.freeze({ ACTIVE: 'active', ENDED: 'ended' });

const TICKS_PER_POINT = Math.round((1000 * PVP.secondsPerPoint) / GAME_LOOP.tickRateMs);

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
    this.zoneTicks = { teamA: 0, teamB: 0 };
    this.pendingDamage = [];
    this.respawnAt = new Map(); // playerId -> timestamp the player returns
    this.invulnUntil = new Map(); // playerId -> timestamp protection expires

    this.startedAt = 0;
    this.roundEndsAt = 0;
  }

  // Balances teams and places each player inside their own team's spawn box.
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

  // Finds a clear point inside a spawn box, falling back to its center.
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
    this.phase = PHASE.ACTIVE;
  }

  // Clears mode state.
  stop() {
    this.phase = PHASE.ENDED;
    this.respawnAt.clear();
    this.invulnUntil.clear();
    this.pendingDamage = [];
  }

  // Advances respawns and zone control; returns queued PvP damage for the game loop.
  tick() {
    const now = Date.now();
    this.processRespawns(now);
    this.updateZoneControl();

    const playerDamage = this.pendingDamage;
    this.pendingDamage = [];
    return { playerDamage };
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

    // Tell the respawned player's controller to return to the game controls.
    if (player.socketId) {
      io.to(player.socketId).emit(SOCKET_EVENTS.YOU_RESPAWNED, {
        playerId: player.playerId,
        invulnMs: PVP.invulnMs,
      });
    }
  }

  // The zone held by a single team earns that team one tick.
  updateZoneControl() {
    if (this.phase !== PHASE.ACTIVE) return;
    for (const zone of this.zones) {
      let teamAInside = false;
      let teamBInside = false;
      for (const p of state.players.values()) {
        if (p.dead || !this.insideZone(p, zone)) continue;
        if (p.team === 'teamA') teamAInside = true;
        else if (p.team === 'teamB') teamBInside = true;
      }

      if (teamAInside && !teamBInside) {
        this.zoneTicks.teamA += 1;
        zone.currentTeam = 'teamA';
      } else if (teamBInside && !teamAInside) {
        this.zoneTicks.teamB += 1;
        zone.currentTeam = 'teamB';
      } else {
        zone.currentTeam = 'neutral';
      }
    }
  }

  // Tests whether a player's feet are within a zone (circle or rectangle).
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
      teamA: Math.floor(this.zoneTicks.teamA / TICKS_PER_POINT),
      teamB: Math.floor(this.zoneTicks.teamB / TICKS_PER_POINT),
    };
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

  // Returns the round result when the timer expires or a whole team has left.
  checkMatchEnd() {
    if (this.phase === PHASE.ENDED) return null;

    // Forfeit: if every player on one team disconnected, the other team wins.
    const counts = { teamA: 0, teamB: 0 };
    for (const p of state.players.values()) {
      if (PVP_TEAMS.includes(p.team)) counts[p.team] += 1;
    }
    const forfeitWinner =
      counts.teamA === 0 && counts.teamB > 0 ? 'teamB'
        : counts.teamB === 0 && counts.teamA > 0 ? 'teamA'
          : null;
    if (forfeitWinner) {
      this.phase = PHASE.ENDED;
      for (const zone of this.zones) zone.currentTeam = 'neutral';
      return { reason: 'pvp-forfeit', winner: forfeitWinner, scores: this.getScores() };
    }

    if (Date.now() < this.roundEndsAt) return null;
    this.phase = PHASE.ENDED;
    for (const zone of this.zones) zone.currentTeam = 'neutral';

    // Decide by full points so the winner always matches the displayed score.
    const scores = this.getScores();
    const winner = scores.teamA > scores.teamB ? 'teamA' : scores.teamB > scores.teamA ? 'teamB' : null;
    return { reason: 'pvp-round-end', winner, scores };
  }

  // Returns the client-facing PvP state patch.
  getStatePatch() {
    return {
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
