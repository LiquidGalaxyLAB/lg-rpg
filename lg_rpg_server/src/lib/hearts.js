// Manages heart pickup spawning and collection during a match.
import { ENEMY_SPAWN, HEART, SPAWN } from '../../game_constants.js';
import { findSpawnPoint } from './spawn.js';
import { canStandAt } from './collision.js';

export class HeartField {
  constructor(map) {
    this.collision = map.collision;
    this.zones = map.zones.enemySpawn || [];
    this.hearts = new Map(); this.nextId = 1;
    this.warmupTimer = null;
    this.spawnTimer = null;
  }

  // Waits for warmup then fills to max and starts the periodic spawn interval.
  start() {
    this.warmupTimer = setTimeout(() => {
      this.topUp();
      this.spawnTimer = setInterval(() => this.spawn(), HEART.spawnIntervalMs);
    }, ENEMY_SPAWN.warmupMs);
  }

  // Cancels all timers and clears all hearts.
  stop() {
    clearTimeout(this.warmupTimer);
    clearInterval(this.spawnTimer);
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.hearts.clear();
  }

  // Spawns hearts until the map is at capacity.
  topUp() {
    while (this.hearts.size < HEART.maxOnMap && this.spawn());
  }

  // Attempts to place one heart at a random valid position; returns false if no spot is found.
  spawn() {
    if (this.zones.length === 0 || this.hearts.size >= HEART.maxOnMap) return false;

    const occupied = Array.from(this.hearts.values());
    const point = findSpawnPoint(this.zones, occupied, {
      edgePadding: SPAWN.edgePadding,
      minSpacing: SPAWN.minEnemySpacing,
      maxAttempts: SPAWN.maxAttempts * 4,
      isValidPoint: (point) => canStandAt(this.collision, point.x, point.y),
    });
    if (!point) return false;

    const id = `h${this.nextId++}`;
    this.hearts.set(id, { id, x: point.x, y: point.y });
    return true;
  }

  // Returns a serializable snapshot of all hearts for the client state patch.
  list() {
    return Array.from(this.hearts.values()).map((h) => ({
      id: h.id,
      x: Math.round(h.x),
      y: Math.round(h.y),
    }));
  }

  // Removes and returns heal amount if a heart overlaps the player's hitbox.
  tryConsume(playerHitbox) {
    for (const [id, heart] of this.hearts) {
      if (
        heart.x >= playerHitbox.left &&
        heart.x <= playerHitbox.right &&
        heart.y >= playerHitbox.top &&
        heart.y <= playerHitbox.bottom
      ) {
        this.hearts.delete(id);
        return HEART.healAmount;
      }
    }
    return 0;
  }
}
