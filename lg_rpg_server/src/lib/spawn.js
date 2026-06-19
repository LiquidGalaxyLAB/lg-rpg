// Generates a random coordinate within a rectangle, applying a padding inset.
function randomPointInRect(rect, pad) {
  const minX = rect.x + pad;
  const maxX = rect.x + rect.width - pad;
  const minY = rect.y + pad;
  const maxY = rect.y + rect.height - pad;
  return {
    x: minX <= maxX ? minX + Math.random() * (maxX - minX) : rect.x + rect.width / 2,
    y: minY <= maxY ? minY + Math.random() * (maxY - minY) : rect.y + rect.height / 2,
  };
}

// Picks a random zone from a list, weighted by each zone's area.
function pickZoneWeighted(zones) {
  if (zones.length === 1) return zones[0];
  const total = zones.reduce((sum, r) => sum + r.width * r.height, 0);
  let roll = Math.random() * total;
  for (const rect of zones) {
    roll -= rect.width * rect.height;
    if (roll <= 0) return rect;
  }
  return zones[zones.length - 1];
}

// Checks if a candidate point is far enough from all occupied locations.
function isClear(point, occupied, minSpacing) {
  const minSq = minSpacing * minSpacing;
  for (const p of occupied) {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    if (dx * dx + dy * dy < minSq) return false;
  }
  return true;
}

// Attempts to find a clear spawn point across a set of zones using randomized trial and error.
export function findSpawnPoint(zones, occupied = [], opts = {}) {
  if (!zones || zones.length === 0) return null;
  const { edgePadding = 0, minSpacing = 0, maxAttempts = 16 } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const zone = pickZoneWeighted(zones);
    const point = randomPointInRect(zone, edgePadding);
    if (isClear(point, occupied, minSpacing)) return point;
  }
  return null;
}
