import { DEFAULT_GAME_MODE, GAME_PHASES } from '../game_constants.js';

// Shared, mutable game state used by all modules.
export const state = {
  players: new Map(),        // playerId -> player data
  socketPlayers: new Map(),  // socket id -> playerId
  selectedMode: DEFAULT_GAME_MODE,
  currentMap: null,
  worldBounds: null,
  activeMode: null,
  heartField: null,
  cheerleader: null,
  cheerleaderSocketId: null,
  matchActive: false,
  matchStartedAt: 0,
  lastTeamScores: null,      // Final PvP scores, kept past mode teardown for the result payload
  phase: GAME_PHASES.LOBBY,
  emptyGraceTimer: null,     // Ends the match if all players leave
};

export function matchElapsedMs() {
  return state.matchActive ? Date.now() - state.matchStartedAt : 0;
}
