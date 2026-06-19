import { GAME_MODES } from '../game_constants.js';
import { ZombieMode } from './modes/zombie.js';

// Returns the server-side game mode instance for a map.
export function createMode(mode, map) {
  if (mode === GAME_MODES.ZOMBIE) return new ZombieMode(map);
  return null;
}
