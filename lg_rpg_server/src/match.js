import { ENEMY_SPAWN, GAME_MODES, GAME_PHASES, MATCH, PLAYER_DEFAULTS, SOCKET_EVENTS } from '../game_constants.js';
import { io } from './app.js';
import { state } from './state.js';
import { emitGameEvent } from './cheerleader-bridge.js';

// Resets every player's stats and starts a new match.
export function startMatchState() {
  state.matchStartedAt = Date.now();
  state.matchActive = state.activeMode !== null;
  state.lastTeamScores = null;
  for (const player of state.players.values()) {
    player.health = PLAYER_DEFAULTS.maxHealth;
    player.maxHealth = PLAYER_DEFAULTS.maxHealth;
    player.dead = false;
    player.action = null;
    player.actionKind = null;
    player.actionExpiresAt = 0;
    player.kills = 0;
    player.lastAttackAt = 0;
    player.lowHealthSignaled = false;
    player.velocityX = 0;
    player.velocityY = 0;
  }
}

// Snapshots team scores before the mode is dropped, so a match ending after teardown (empty-lobby grace) still reports the round it played.
export function captureTeamScores() {
  if (typeof state.activeMode?.getScores === 'function') {
    state.lastTeamScores = state.activeMode.getScores();
  }
}

// The same rule checkMatchEnd uses, so a round that ends outside it still names the team the score shows.
function winnerFromScores(scores = {}) {
  const a = Number(scores.teamA || 0);
  const b = Number(scores.teamB || 0);
  return a > b ? 'teamA' : b > a ? 'teamB' : null;
}

export function connectedPlayerCount() {
  let count = 0;
  for (const player of state.players.values()) {
    if (player.socketId) count += 1;
  }
  return count;
}

// Keeps a PvP player's match state during the reconnect/forfeit grace window. The simulation ignores socket-less players, so the retained entry is not an active avatar until the same player id reconnects.
export function markPlayerDisconnected(playerId, socketId) {
  const player = state.players.get(playerId);
  if (!player || player.socketId !== socketId) return null;

  state.socketPlayers.delete(socketId);
  player.socketId = null;
  player.velocityX = 0;
  player.velocityY = 0;
  player.action = null;
  player.actionKind = null;
  player.actionExpiresAt = 0;

  if (state.phase === GAME_PHASES.PLAYING && connectedPlayerCount() === 0) {
    scheduleEmptyGrace();
  }
  return player;
}

// Stops active game elements and sends results; `result` is null for co-op, set for PvP team modes.
export function endMatch(reason = 'all-dead', result = null) {
  const outcome = reason === 'boss-defeated' ? 'win' : 'loss';
  state.matchActive = false;
  cancelEmptyGrace();
  // PvP rounds can end outside checkMatchEnd (everyone left, host teardown) with no result, so build one from the live scores — otherwise the boards fall back to the co-op layout.
  captureTeamScores();
  const teamResult = result
    || (state.selectedMode === GAME_MODES.PVP && state.lastTeamScores
      ? { winner: winnerFromScores(state.lastTeamScores), scores: state.lastTeamScores }
      : null);
  if (state.activeMode) {
    state.activeMode.stop();
    state.activeMode = null;
  }
  if (state.heartField) {
    state.heartField.stop();
    state.heartField = null;
  }
  state.phase = GAME_PHASES.LOBBY;
  // Carry health through so the final board can show who was still standing instead of assuming full HP.
  const results = Array.from(state.players.values())
    .map((p) => ({
      playerId: p.playerId,
      name: p.name,
      kills: p.kills || 0,
      team: p.team || null,
      hp: p.health,
      maxHp: p.maxHealth,
      dead: !!p.dead,
    }))
    .sort((a, b) => b.kills - a.kills);
  // Exclude the enemy-free warmup window so co-op "Survived" reflects combat time.
  const rawMs = Date.now() - state.matchStartedAt;
  const survivedMs = teamResult ? rawMs : Math.max(0, rawMs - ENEMY_SPAWN.warmupMs);
  // A draw gets its own event rather than a "won" one the commentator has to walk back.
  const cheerEvent = teamResult
    ? (teamResult.winner ? 'match_won' : 'match_draw')
    : outcome === 'win' ? 'match_won' : 'match_lost';
  emitGameEvent(cheerEvent, {
    survivedMs,
    results,
    ...(teamResult ? { winner: teamResult.winner, scores: teamResult.scores } : {}),
  });
  const finishingCheer = state.cheerleader;
  state.cheerleader = null;
  if (finishingCheer) {
    finishingCheer.finale().finally(() => finishingCheer.stop());
  }
  const payload = teamResult
    ? { reason, winner: teamResult.winner, scores: teamResult.scores, survivedMs, results }
    : { reason, outcome, survivedMs, results };
  io.emit(SOCKET_EVENTS.GAME_OVER, payload);

  // Players retained only for PvP reconnection must not become permanent lobby ghosts after the round ends.
  let removedDisconnected = false;
  for (const [playerId, player] of state.players) {
    if (player.socketId) continue;
    state.players.delete(playerId);
    removedDisconnected = true;
  }
  if (removedDisconnected) {
    const players = Array.from(state.players.values());
    if (players.length > 0 && !players.some((player) => player.isHost)) {
      players[0].isHost = true;
    }
    io.emit(SOCKET_EVENTS.UPDATE_LOBBY, {
      players,
      hostId: players.find((player) => player.isHost)?.playerId ?? '',
      selectedMode: state.selectedMode,
    });
  }

  console.log(`[game] match over (${reason}). ${teamResult ? `winner=${teamResult.winner ?? 'draw'}` : outcome}, survived ${survivedMs}ms`);
}

// Counts down to ending the match after the last player leaves.
export function scheduleEmptyGrace() {
  if (state.emptyGraceTimer) return;
  io.emit(SOCKET_EVENTS.MATCH_ANNOUNCEMENT, {
    message: 'All players left — ending the match…',
    durationMs: MATCH.emptyGraceMs,
  });
  console.log(`[game] all players gone; ending in ${MATCH.emptyGraceMs}ms unless someone returns.`);
  state.emptyGraceTimer = setTimeout(() => {
    state.emptyGraceTimer = null;
    if (state.phase === GAME_PHASES.PLAYING && connectedPlayerCount() === 0) endMatch('all-left');
  }, MATCH.emptyGraceMs);
}

export function cancelEmptyGrace() {
  if (state.emptyGraceTimer) {
    clearTimeout(state.emptyGraceTimer);
    state.emptyGraceTimer = null;
  }
}

// Removes a player and hands off host status if they held it.
export function removePlayer(playerId, socketId) {
  const removed = state.players.get(playerId);
  state.players.delete(playerId);
  if (socketId) state.socketPlayers.delete(socketId);

  if (removed?.isHost && state.players.size > 0) {
    state.players.values().next().value.isHost = true;
  }

  if (state.players.size === 0 && state.activeMode) {
    captureTeamScores();
    state.activeMode.stop();
    state.activeMode = null;
    state.matchActive = false;
    if (state.heartField) { state.heartField.stop(); state.heartField = null; }
    if (state.cheerleader) { state.cheerleader.stop(); state.cheerleader = null; }
  }

  if (state.phase === GAME_PHASES.PLAYING && connectedPlayerCount() === 0) {
    scheduleEmptyGrace();
  }
  return removed;
}
