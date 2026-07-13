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
import { moveWithCollision } from './lib/collision.js';
import { emitGameEvent } from './cheerleader-bridge.js';
import { endMatch } from './match.js';
import { everyPlayerDead, playerHitbox } from './players.js';

// Starts the core game loop to update positions and broadcast state.
export function startGameLoop() {
  setInterval(() => {
    // Move players within map bounds, confined to the spawn box during PvP lock phase.
    if (state.worldBounds) {
      const confine = state.activeMode?.getConfinement?.() || null;
      const bounds = confine
        ? {
            minX: confine.x + PLAYER_SIZE.halfWidth,
            maxX: confine.x + confine.width - PLAYER_SIZE.halfWidth,
            minY: confine.y + PLAYER_SIZE.height,
            maxY: confine.y + confine.height,
          }
        : {
            minX: PLAYER_SIZE.halfWidth,
            maxX: state.worldBounds.width - PLAYER_SIZE.halfWidth,
            minY: PLAYER_SIZE.height,
            maxY: state.worldBounds.height,
          };
      const moveNow = Date.now();
      for (const player of state.players.values()) {
        if (player.dead) continue;
        // Hit knockback stacks on top of input, so controls stay live during the shove.
        // It starts at full speed and fades linearly to zero, so the hit lands sharp but lets go fast.
        const knocked = player.knockbackUntil && moveNow < player.knockbackUntil;
        const fade = knocked ? (player.knockbackUntil - moveNow) / PLAYER_DEFAULTS.knockbackMs : 0;
        const moved = moveWithCollision(
          state.currentMap?.collision,
          player,
          player.velocityX + (knocked ? player.knockbackVx * fade : 0),
          player.velocityY + (knocked ? player.knockbackVy * fade : 0),
          bounds,
        );
        player.x = moved.x;
        player.y = moved.y;
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
          // Shove the player away from the attacker (no stun; input keeps working).
          // Rate-limited so a swarm landing hits back-to-back can't chain shoves into an endless slide.
          if (hit.sourceX != null && now >= (player.knockbackCooldownUntil || 0)) {
            const dx = player.x - hit.sourceX;
            const dy = player.y - hit.sourceY;
            const len = Math.hypot(dx, dy) || 1;
            player.knockbackVx = (dx / len) * PLAYER_DEFAULTS.knockbackSpeed;
            player.knockbackVy = (dy / len) * PLAYER_DEFAULTS.knockbackSpeed;
            player.knockbackUntil = now + PLAYER_DEFAULTS.knockbackMs;
            player.knockbackCooldownUntil = now + PLAYER_DEFAULTS.knockbackCooldownMs;
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

      // End the match via mode result (PvP) or death/timer (co-op).
      if (state.matchActive && state.players.size > 0) {
        if (typeof state.activeMode.checkMatchEnd === 'function') {
          const result = state.activeMode.checkMatchEnd();
          if (result) endMatch(result.reason, result);
        } else if (everyPlayerDead()) {
          endMatch('all-dead');
        } else if (matchElapsedMs() >= ENEMY_SPAWN.warmupMs + MATCH.winDurationMs) {
          // At the survive mark the boss is summoned instead of ending; slaying it wins the match.
          const result = state.activeMode.updateBoss?.();
          if (result) {
            endMatch(result.reason);
          } else if (state.activeMode.bossSpawned && !state.activeMode.bossAnnounced) {
            // One-time entrance: banner on the screens plus a cheerleader call-out.
            state.activeMode.bossAnnounced = true;
            io.emit(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, {
              message: 'The dragon has awoken — slay it to win!',
              durationMs: 6000,
            });
            emitGameEvent('boss_spawned', {});
          }
        }
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
      players: Array.from(state.players.values()).map((p) => {
        return {
          playerId: p.playerId,
          name: p.name,
          x: p.x,
          y: p.y,
          hp: p.health,
          maxHp: p.maxHealth,
          kills: p.kills || 0,
          dead: p.dead,
          action: p.action || null,
          team: p.team || null,
        };
      }),
      hearts: state.heartField ? state.heartField.list() : [],
      // durationMs = warmup + survive so the on-screen clock starts at the full winDurationMs.
      match: state.matchActive
        ? {
            elapsedMs: matchElapsedMs(),
            durationMs: ENEMY_SPAWN.warmupMs + MATCH.winDurationMs,
            warmupMs: ENEMY_SPAWN.warmupMs,
          }
        : null,
      ...modePatch,
    });
  }, GAME_LOOP.tickRateMs);
}
