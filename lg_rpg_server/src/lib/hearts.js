import { ENEMY_SPAWN, HEART, SPAWN } from '../../game_constants.js';
import { findSpawnPoint } from './spawn.js';

export class HeartField {
  constructor(map) {
    this.zones = map.zones.enemySpawn || [];
    this.hearts = new Map(); this.nextId = 1;
    this.warmupTimer = null;
    this.spawnTimer = null;
  }

  start() {
    this.warmupTimer = setTimeout(() => {
      this.topUp();
      this.spawnTimer = setInterval(() => this.spawn(), HEART.spawnIntervalMs);
    }, ENEMY_SPAWN.warmupMs);
  }

  stop() {
    clearTimeout(this.warmupTimer);
    clearInterval(this.spawnTimer);
    this.warmupTimer = null;
    this.spawnTimer = null;
    this.hearts.clear();
  }

  topUp() {
    while (this.hearts.size < HEART.maxOnMap && this.spawn());
  }

  spawn() {
    if (this.zones.length === 0 || this.hearts.size >= HEART.maxOnMap) return false;

    const occupied = Array.from(this.hearts.values());
    const point = findSpawnPoint(this.zones, occupied, {
      edgePadding: SPAWN.edgePadding,
      minSpacing: SPAWN.minEnemySpacing,
      maxAttempts: SPAWN.maxAttempts,
    });
    if (!point) return false;

    const id = `h${this.nextId++}`;
    this.hearts.set(id, { id, x: point.x, y: point.y });
    return true;
  }

  list() {
    return Array.from(this.hearts.values()).map((h) => ({
      id: h.id,
      x: Math.round(h.x),
      y: Math.round(h.y),
    }));
  }

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
