import fs from 'fs';
import path from 'path';
import {
  ENEMY_SPAWN,
  GAME_MODES,
  GAME_MODE_LABELS,
  MATCH,
  PLAYER_DEFAULTS,
  SOCKET_EVENTS,
} from '../game_constants.js';
import { rootDir } from './paths.js';
import { io } from './app.js';
import { state, matchElapsedMs } from './state.js';

// Queue of game events consumed by the cheerleader commentator.
const gameEvents = [];

export function emitGameEvent(type, data = {}) {
  if (!state.cheerleader) return;
  gameEvents.push({ type, data, at: Date.now() });
}

export function drainGameEvents() {
  return gameEvents.splice(0, gameEvents.length);
}

// Logs spoken commentator lines to a file.
const SPOKEN_LOG_PATH = path.join(rootDir, 'logs', 'cheerleader_spoken.log');
fs.mkdirSync(path.dirname(SPOKEN_LOG_PATH), { recursive: true });
fs.writeFileSync(SPOKEN_LOG_PATH, ''); // reset transcript on each server start

export function logSpoken(text) {
  fs.appendFile(SPOKEN_LOG_PATH, text, (err) => {
    if (err) console.warn('[cheerleader] spoken-log write failed:', err.message);
  });
}

// Sends cheerleader audio to the right screen socket.
export function emitCheerleaderAudio(audio) {
  if (!state.cheerleaderSocketId || !io.sockets.sockets.has(state.cheerleaderSocketId)) return;
  io.to(state.cheerleaderSocketId).emit(SOCKET_EVENTS.CHEERLEADER_AUDIO, audio);
}

// Registers the socket playing the commentator audio.
export function registerCheerleaderAudioScreen(socket) {
  state.cheerleaderSocketId = socket.id;
  console.log(`[cheerleader] audio routed to right screen socket: ${socket.id}`);
}

// Unregisters the commentator audio screen socket.
export function unregisterCheerleaderAudioScreen(socketId) {
  if (state.cheerleaderSocketId === socketId) state.cheerleaderSocketId = null;
}

// Prepares player status details for the cheerleader context.
function cheerleaderPlayerSnapshot() {
  return Array.from(state.players.values()).map((p) => {
    const hp = Number(p.health ?? PLAYER_DEFAULTS.maxHealth);
    const maxHp = Number(p.maxHealth ?? PLAYER_DEFAULTS.maxHealth);
    let status = 'healthy';
    if (p.dead) status = 'down';
    else if (hp <= maxHp * 0.3) status = 'critical';
    else if (hp < maxHp) status = 'hurt';

    return {
      name: p.name,
      hp,
      maxHp,
      kills: p.kills || 0,
      status,
      team: p.team || null,
    };
  });
}

// Gets the current number of active enemies.
function cheerleaderEnemyCount() {
  if (!state.activeMode || typeof state.activeMode.getStatePatch !== 'function') return 0;
  return state.activeMode.getStatePatch().enemies?.length || 0;
}

// Last live PvP patch, kept for the finale after the mode instance is cleared.
let lastPvpSnapshot = null;

// Returns mode-aware match context for the cheerleader commentator.
export function getCheerleaderContext() {
  const modeId = state.selectedMode;
  const base = {
    mode: GAME_MODE_LABELS[modeId] || modeId,
    modeId,
    players: cheerleaderPlayerSnapshot(),
  };

  // Keep the last PvP snapshot so the finale still reports the real final score after mode teardown.
  if (modeId === GAME_MODES.PVP) {
    const live = state.activeMode?.getStatePatch?.().pvp || null;
    if (live) lastPvpSnapshot = live;
    const pvp = live || lastPvpSnapshot;
    const zones = pvp?.zones || [];
    return {
      ...base,
      phase: live ? pvp?.phase || 'active' : 'ended',
      timeRemaining: Math.max(0, Math.ceil((pvp?.roundRemainingMs || 0) / 1000)),
      scores: pvp?.scores || { teamA: 0, teamB: 0 },
      zonesHeld: {
        teamA: zones.filter((z) => z.currentTeam === 'teamA').length,
        teamB: zones.filter((z) => z.currentTeam === 'teamB').length,
        total: zones.length,
      },
    };
  }

  // Zombie: a warm-up/grace window (no enemies), the survive timer, then the dragon boss fight.
  const elapsedMs = matchElapsedMs();
  const graceMs = ENEMY_SPAWN.warmupMs;
  const inGrace = elapsedMs < graceMs;
  const inBoss = elapsedMs >= graceMs + MATCH.winDurationMs;
  return {
    ...base,
    phase: inGrace ? 'grace' : inBoss ? 'boss' : 'survive',
    graceRemaining: Math.max(0, Math.ceil((graceMs - elapsedMs) / 1000)),
    elapsedSeconds: Math.floor(Math.max(0, elapsedMs - graceMs) / 1000),
    timeRemaining: inGrace
      ? Math.ceil(MATCH.winDurationMs / 1000)
      : Math.max(0, Math.ceil((graceMs + MATCH.winDurationMs - elapsedMs) / 1000)),
    enemyCount: cheerleaderEnemyCount(),
  };
}
