import fs from 'fs';
import path from 'path';
import {
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
    };
  });
}

// Gets the current number of active enemies.
function cheerleaderEnemyCount() {
  if (!state.activeMode || typeof state.activeMode.getStatePatch !== 'function') return 0;
  return state.activeMode.getStatePatch().enemies?.length || 0;
}

// Returns the overall match context needed by the cheerleader.
export function getCheerleaderContext() {
  const elapsedMs = matchElapsedMs();
  return {
    mode: GAME_MODE_LABELS[state.selectedMode] || state.selectedMode,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    timeRemaining: Math.max(0, Math.ceil((MATCH.winDurationMs - elapsedMs) / 1000)),
    enemyCount: cheerleaderEnemyCount(),
    players: cheerleaderPlayerSnapshot(),
  };
}
