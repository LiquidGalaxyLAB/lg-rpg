import { DEFAULT_GAME_MODE, GAME_PHASES } from '../game_constants.js';

// Holds the shared, mutable game state used by all modules.
export const state = {
  players: new Map(),        // Map of players (playerId -> player data)
  socketPlayers: new Map(),  // Map of socket IDs to player IDs
  selectedMode: DEFAULT_GAME_MODE,
  currentMap: null,
  worldBounds: null,
  activeMode: null,          // Current game mode simulation (or null)
  heartField: null,          // Healing item spawner (or null)
  cheerleader: null,         // AI commentator (or null)
  cheerleaderSocketId: null, // Socket ID playing the AI audio
  matchActive: false,        // Whether a match is currently playing
  matchStartedAt: 0,         // Timestamp when the match started
  phase: GAME_PHASES.LOBBY,  // Current phase (lobby or playing)
  emptyGraceTimer: null,     // Timer to end the match if all players leave
};

// Calculates how long the current match has been active in milliseconds.
export function matchElapsedMs() {
  return state.matchActive ? Date.now() - state.matchStartedAt : 0;
}
