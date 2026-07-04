import { GAME_PHASES, MATCH, PLAYER_DEFAULTS, SOCKET_EVENTS } from '../game_constants.js';
import { io } from './app.js';
import { state } from './state.js';
import { emitGameEvent } from './cheerleader-bridge.js';

// Resets all player stats and starts a new match.
export function startMatchState() {
  state.matchStartedAt = Date.now();
  state.matchActive = state.activeMode !== null;
  for (const player of state.players.values()) {
    player.health = PLAYER_DEFAULTS.maxHealth;
    player.maxHealth = PLAYER_DEFAULTS.maxHealth;
    player.dead = false;
    player.action = null;
    player.actionExpiresAt = 0;
    player.kills = 0;
    player.lastAttackAt = 0;
    player.lowHealthSignaled = false;
    player.velocityX = 0;
    player.velocityY = 0;
  }
}

// Ends the match, stops active game elements, and sends results; result is null for co-op, set for PvP team modes.
export function endMatch(reason = 'all-dead', result = null) {
  const outcome = reason === 'timer-win' ? 'win' : 'loss';
  state.matchActive = false;
  cancelEmptyGrace();
  if (state.activeMode) {
    state.activeMode.stop();
    state.activeMode = null;
  }
  if (state.heartField) {
    state.heartField.stop();
    state.heartField = null;
  }
  state.phase = GAME_PHASES.LOBBY;
  const results = Array.from(state.players.values())
    .map((p) => ({ playerId: p.playerId, name: p.name, kills: p.kills || 0, team: p.team || null }))
    .sort((a, b) => b.kills - a.kills);
  const survivedMs = Date.now() - state.matchStartedAt;
  const cheerEvent = result ? 'match_won' : outcome === 'win' ? 'match_won' : 'match_lost';
  // PvP results carry the winner and score so the commentator announces them correctly.
  emitGameEvent(cheerEvent, {
    survivedMs,
    results,
    ...(result ? { winner: result.winner, scores: result.scores } : {}),
  });
  const finishingCheer = state.cheerleader;
  state.cheerleader = null;
  if (finishingCheer) {
    finishingCheer.finale().finally(() => finishingCheer.stop());
  }
  const payload = result
    ? { reason, winner: result.winner, scores: result.scores, survivedMs, results }
    : { reason, outcome, survivedMs, results };
  io.emit(SOCKET_EVENTS.GAME_OVER, payload);
  console.log(`[game] match over (${reason}). ${result ? `winner=${result.winner}` : outcome}, survived ${survivedMs}ms`);
}

// Starts a countdown to end the match when the last player leaves.
export function scheduleEmptyGrace() {
  if (state.emptyGraceTimer) return;
  io.emit(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, {
    message: 'All players left — ending the match…',
    durationMs: MATCH.emptyGraceMs,
  });
  console.log(`[game] all players gone; ending in ${MATCH.emptyGraceMs}ms unless someone returns.`);
  state.emptyGraceTimer = setTimeout(() => {
    state.emptyGraceTimer = null;
    if (state.phase === GAME_PHASES.PLAYING && state.players.size === 0) endMatch('all-left');
  }, MATCH.emptyGraceMs);
}

// Stops the countdown to end the match.
export function cancelEmptyGrace() {
  if (state.emptyGraceTimer) {
    clearTimeout(state.emptyGraceTimer);
    state.emptyGraceTimer = null;
  }
}

// Removes a player from the game and updates host status if they were host.
export function removePlayer(playerId, socketId) {
  const removed = state.players.get(playerId);
  state.players.delete(playerId);
  if (socketId) state.socketPlayers.delete(socketId);

  if (removed?.isHost && state.players.size > 0) {
    state.players.values().next().value.isHost = true;
  }


  if (state.players.size === 0 && state.activeMode) {
    state.activeMode.stop();
    state.activeMode = null;
    state.matchActive = false;
    if (state.heartField) { state.heartField.stop(); state.heartField = null; }
    if (state.cheerleader) { state.cheerleader.stop(); state.cheerleader = null; }
  }

  if (state.players.size === 0 && state.phase === GAME_PHASES.PLAYING) {
    scheduleEmptyGrace();
  }
  return removed;
}
