import { PLAYER_SIZE, SOCKET_EVENTS, SPAWN } from '../game_constants.js';
import { io } from './app.js';
import { state } from './state.js';
import { findSpawnPoint } from './lib/spawn.js';
import { canStandAt } from './lib/collision.js';

// Determines a valid spawn point for a player, avoiding collision with existing players.
export function spawnPlayerPosition() {
  if (!state.currentMap) return null;
  const zones = state.currentMap.zones.playerSpawn || [];
  const occupied = Array.from(state.players.values()).map((p) => ({ x: p.x, y: p.y }));
  return findSpawnPoint(zones, occupied, {
    edgePadding: SPAWN.edgePadding,
    minSpacing: SPAWN.minPlayerSpacing,
    maxAttempts: SPAWN.maxAttempts * 4,
    isValidPoint: (point) => canStandAt(state.currentMap.collision, point.x, point.y),
  });
}

// Computes the bounding box of a player based on their size constants.
export function playerHitbox(player) {
  return {
    left: player.x - PLAYER_SIZE.halfWidth,
    top: player.y - PLAYER_SIZE.height,
    right: player.x + PLAYER_SIZE.halfWidth,
    bottom: player.y,
  };
}

// Checks if all active players in the game state are dead.
export function everyPlayerDead() {
  for (const player of state.players.values()) {
    if (!player.dead) return false;
  }
  return true;
}

// Broadcasts the current lobby state, including the player list and host ID, to all clients.
export function broadcastLobby() {
  const playerList = Array.from(state.players.values());
  const host = playerList.find((p) => p.isHost);
  io.emit(SOCKET_EVENTS.UPDATE_LOBBY, {
    players: playerList,
    hostId: host?.playerId ?? '',
    selectedMode: state.selectedMode,
  });
}
