import {
  ENEMY_SPAWN,
  GAME_LOOP,
  MATCH,
  PLAYER_DEFAULTS,
  PLAYER_SIZE,
  SOCKET_EVENTS,
} from '../game_constants.js';
import { io } from './app.js';
import { state, matchElapsedMs } from './state.js';
import { clamp } from './lib/pathfinding.js';
import { emitGameEvent } from './cheerleader-bridge.js';
import { endMatch } from './match.js';
import { everyPlayerDead, playerHitbox } from './players.js';

// Starts the core game loop to update positions and broadcast state.
export function startGameLoop() {
  setInterval(() => {
    // Update player positions within map boundaries.
    if (state.worldBounds) {
      for (const player of state.players.values()) {
        if (player.dead) continue;
        player.x = clamp(player.x + player.velocityX, PLAYER_SIZE.halfWidth, state.worldBounds.width - PLAYER_SIZE.halfWidth);
        player.y = clamp(player.y + player.velocityY, PLAYER_SIZE.height, state.worldBounds.height);
      }
    }

    // Update active game mode simulation and apply damage to players.
    if (state.activeMode) {
      const alive = Array.from(state.players.values())
        .filter((p) => !p.dead)
        .map((p) => ({ id: p.playerId, x: p.x, y: p.y, hitbox: playerHitbox(p) }));
      const { playerDamage } = state.activeMode.tick(alive);

      const now = Date.now();
      for (const hit of playerDamage || []) {
        const player = state.players.get(hit.playerId);
        if (!player || player.dead) continue;
        player.health = Math.max(0, player.health - hit.amount);
        if (player.health === 0) {
          player.dead = true;
          player.action = 'death';
          player.actionExpiresAt = 0;
          player.velocityX = 0;
          player.velocityY = 0;
          emitGameEvent('player_died', { playerId: player.playerId, name: player.name });
          
          // Notify the dead player's controller.
          if (player.socketId) {
            io.to(player.socketId).emit(SOCKET_EVENTS.YOU_DIED, { playerId: player.playerId });
          }
        } else {
          // Signal low-health warning when falling below 30% HP.
          if (!player.lowHealthSignaled && player.health <= player.maxHealth * 0.3) {
            player.lowHealthSignaled = true;
            emitGameEvent('player_low_health', { playerId: player.playerId, name: player.name, hp: player.health });
          }
          // Trigger a hit animation for the player.
          if (player.action !== 'attack' || now >= player.actionExpiresAt) {
            player.action = 'take_hit';
            player.actionExpiresAt = now + PLAYER_DEFAULTS.actionSignalMs;
          }
        }
      }

      // Handle healing item pickups.
      if (state.heartField) {
        for (const player of state.players.values()) {
          if (player.dead) continue;
          const heal = state.heartField.tryConsume(playerHitbox(player));
          if (heal > 0) {
            player.health = Math.min(player.maxHealth, player.health + heal);
            if (player.health > player.maxHealth * 0.3) player.lowHealthSignaled = false;
          }
        }
      }

      // End the match if all players die or the timer runs out.
      if (state.matchActive && state.players.size > 0) {
        if (everyPlayerDead()) endMatch('all-dead');
        else if (matchElapsedMs() >= MATCH.winDurationMs) endMatch('timer-win');
      }
    }

    // Clear temporary actions (like attacking or taking damage) after they finish.
    const nowMs = Date.now();
    for (const player of state.players.values()) {
      if (!player.dead && player.actionExpiresAt && nowMs >= player.actionExpiresAt) {
        player.action = null;
        player.actionExpiresAt = 0;
      }
    }

    // Broadcast the updated game state to all clients.
    const modePatch = state.activeMode ? state.activeMode.getStatePatch() : {};
    io.emit(SOCKET_EVENTS.GAME_STATE, {
      players: Array.from(state.players.values()).map((p) => ({
        playerId: p.playerId,
        name: p.name,
        x: p.x,
        y: p.y,
        hp: p.health,
        maxHp: p.maxHealth,
        kills: p.kills || 0,
        dead: p.dead,
        action: p.action || null,
      })),
      hearts: state.heartField ? state.heartField.list() : [],
      match: state.matchActive
        ? { elapsedMs: matchElapsedMs(), durationMs: MATCH.winDurationMs, warmupMs: ENEMY_SPAWN.warmupMs }
        : null,
      ...modePatch,
    });
  }, GAME_LOOP.tickRateMs);
}
