import {
  ENEMY_SPAWN,
  GAME_LOOP,
  MATCH,
  PLAYER_DEFAULTS,
  PLAYER_SIZE,
  POWERUP_BLINK_MS,
  POWERUP_BY_ID,
  SOCKET_EVENTS,
} from '../game_constants.js';
import { io } from './app.js';
import { state, matchElapsedMs } from './state.js';
import { moveWithCollision } from './lib/collision.js';
import { emitGameEvent } from './cheerleader-bridge.js';
import { endMatch } from './match.js';
import { everyPlayerDead, playerHitbox } from './players.js';

// Core loop: moves players, ticks the mode, broadcasts state.
export function startGameLoop() {
  setInterval(() => {
    // Confined to the spawn box during the PvP lock phase, map bounds otherwise.
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
        // Knockback stacks on input (controls stay live) and fades linearly to zero.
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

    if (state.activeMode) {
      const alive = Array.from(state.players.values())
        .filter((p) => !p.dead)
        .map((p) => ({ id: p.playerId, x: p.x, y: p.y, hitbox: playerHitbox(p) }));
      const { playerDamage } = state.activeMode.tick(alive);

      const now = Date.now();
      for (const hit of playerDamage || []) {
        const player = state.players.get(hit.playerId);
        if (!player || player.dead) continue;
        // Bounces damage back amplified (bounced hits don't re-reflect), but the wearer still takes a reduced share — it is not a second shield.
        let amount = hit.amount;
        if ((player.reflectUntil || 0) > now) {
          if (!hit.bounced) {
            const bounced = hit.amount * POWERUP_BY_ID.reflect.multiplier;
            // Co-op: bounce at the enemy that hit us. PvP: bounce at the opposing player.
            if (hit.enemyId && typeof state.activeMode.damageEnemyById === 'function') {
              const killed = state.activeMode.damageEnemyById(hit.enemyId, bounced);
              if (killed) {
                player.kills = (player.kills || 0) + 1;
                emitGameEvent('kill', { playerId: player.playerId, name: player.name, kills: player.kills });
              }
            } else if (hit.attackerId && typeof state.activeMode.damagePlayerById === 'function') {
              // Kill for this bounce is awarded below, when it lands next tick.
              state.activeMode.damagePlayerById(hit.attackerId, bounced, player.playerId);
            }
          }
          amount = Math.round(hit.amount * (1 - (POWERUP_BY_ID.reflect.reduction ?? 1)));
          if (amount <= 0) continue;
        }
        if ((player.shieldUntil || 0) > now) continue;
        player.health = Math.max(0, player.health - amount);
        if (player.health === 0) {
          player.dead = true;
          player.action = 'death';
          player.actionExpiresAt = 0;
          player.velocityX = 0;
          player.velocityY = 0;
          emitGameEvent('player_died', { playerId: player.playerId, name: player.name });

          // Credit at the moment health hits 0, so blocked hits can't inflate the score.
          const killer = hit.attackerId ? state.players.get(hit.attackerId) : null;
          if (killer && killer !== player) {
            killer.kills = (killer.kills || 0) + 1;
            emitGameEvent('kill', { playerId: killer.playerId, name: killer.name, kills: killer.kills });
          }

          if (player.socketId) {
            io.to(player.socketId).emit(SOCKET_EVENTS.YOU_DIED, { playerId: player.playerId });
          }
        } else {
          if (!player.lowHealthSignaled && player.health <= player.maxHealth * 0.3) {
            player.lowHealthSignaled = true;
            emitGameEvent('player_low_health', { playerId: player.playerId, name: player.name, hp: player.health });
          }
          if (player.action !== 'attack' || now >= player.actionExpiresAt) {
            player.action = 'take_hit';
            player.actionExpiresAt = now + PLAYER_DEFAULTS.actionSignalMs;
          }
          // Shove away from the attacker (no stun); rate-limited so swarms can't chain-slide it.
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

    // Clear temporary actions (attack, take_hit) once they finish.
    const nowMs = Date.now();
    for (const player of state.players.values()) {
      if (!player.dead && player.actionExpiresAt && nowMs >= player.actionExpiresAt) {
        player.action = null;
        player.actionKind = null;
        player.actionExpiresAt = 0;
      }
    }

    const modePatch = state.activeMode ? state.activeMode.getStatePatch() : {};
    io.emit(SOCKET_EVENTS.GAME_STATE, {
      players: Array.from(state.players.values()).map((p) => {
        // Buff visuals: `flag` shows the effect, `flagEnding` blinks it as it expires.
        const boostMsLeft = (p.speedBoostUntil || 0) - nowMs;
        const shieldMsLeft = (p.shieldUntil || 0) - nowMs;
        const reflectMsLeft = (p.reflectUntil || 0) - nowMs;
        const powerMsLeft = (p.powerUntil || 0) - nowMs;
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
          // Which attack the action was, so the screens can pick the matching FX without their own event.
          actionKind: p.actionKind || null,
          team: p.team || null,
          character: p.character || null,
          // Aim pointer: rounded to keep the payload small.
          facingX: Math.round((p.facingX ?? 1) * 100) / 100,
          facingY: Math.round((p.facingY ?? 0) * 100) / 100,
          boost: boostMsLeft > 0,
          boostEnding: boostMsLeft > 0 && boostMsLeft <= POWERUP_BLINK_MS,
          shield: shieldMsLeft > 0,
          shieldEnding: shieldMsLeft > 0 && shieldMsLeft <= POWERUP_BLINK_MS,
          reflect: reflectMsLeft > 0,
          reflectEnding: reflectMsLeft > 0 && reflectMsLeft <= POWERUP_BLINK_MS,
          power: powerMsLeft > 0,
          powerEnding: powerMsLeft > 0 && powerMsLeft <= POWERUP_BLINK_MS,
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
