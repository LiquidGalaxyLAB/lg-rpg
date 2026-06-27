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

// Distance from a zone's center to the nearest target point.
function nearestTargetDistance(rect, targets) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  let best = Infinity;
  for (const t of targets) {
    const dx = t.x - cx;
    const dy = t.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

// Picks a random zone weighted by area, optionally biased toward zones near a target.

function pickZoneWeighted(zones, targets = [], falloff = 0) {
  if (zones.length === 1) return zones[0];

  const weights = zones.map((rect) => {
    const area = rect.width * rect.height;
    if (!targets.length || falloff <= 0) return area;
    return area / (1 + nearestTargetDistance(rect, targets) / falloff);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < zones.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return zones[i];
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
  const {
    edgePadding = 0,
    minSpacing = 0,
    maxAttempts = 16,
    isValidPoint = () => true,
    targets = [],
    distanceFalloff = 0,
  } = opts;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const zone = pickZoneWeighted(zones, targets, distanceFalloff);
    const point = randomPointInRect(zone, edgePadding);
    if (isClear(point, occupied, minSpacing) && isValidPoint(point)) return point;
  }
  return null;
}
