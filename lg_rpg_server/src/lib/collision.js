// Tile-based collision detection and axis-separated movement resolution.

// Default foot hitbox used for players and enemies when no override is provided.
const DEFAULT_FEET_BODY = Object.freeze({
  halfWidth: 6,
  height: 8,
});

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Wraps raw grid data into a collision grid object.
export function createCollisionGrid({ width, height, tileWidth, tileHeight, blocked }) {
  return {
    width,
    height,
    tileWidth,
    tileHeight,
    blocked,
  };
}

// Returns the axis-aligned bounding rect for an entity's feet at (x, y).
function feetRectAt(x, y, body = DEFAULT_FEET_BODY) {
  return {
    left: x - body.halfWidth,
    top: y - body.height,
    right: x + body.halfWidth,
    bottom: y,
  };
}

// Returns true if the tile at (tileX, tileY) is blocked or out of bounds.
function isTileBlocked(collision, tileX, tileY) {
  if (!collision) return false;
  if (tileX < 0 || tileY < 0 || tileX >= collision.width || tileY >= collision.height) return true;
  return collision.blocked[tileY * collision.width + tileX] === 1;
}

// Returns true if any tile overlapping rect is blocked.
function rectCollides(collision, rect) {
  if (!collision) return false;

  const left = Math.floor(rect.left / collision.tileWidth);
  const right = Math.floor((rect.right - 0.01) / collision.tileWidth);
  const top = Math.floor(rect.top / collision.tileHeight);
  const bottom = Math.floor((rect.bottom - 0.01) / collision.tileHeight);

  for (let tileY = top; tileY <= bottom; tileY += 1) {
    for (let tileX = left; tileX <= right; tileX += 1) {
      if (isTileBlocked(collision, tileX, tileY)) return true;
    }
  }
  return false;
}

// Returns true if the entity's foot rect at (x, y) is clear of all blocked tiles.
export function canStandAt(collision, x, y, body = DEFAULT_FEET_BODY) {
  return !rectCollides(collision, feetRectAt(x, y, body));
}

// Moves a point by (deltaX, deltaY), sliding along walls by resolving each axis independently.
export function moveWithCollision(collision, point, deltaX, deltaY, bounds, body = DEFAULT_FEET_BODY) {
  let x = clamp(point.x, bounds.minX, bounds.maxX);
  let y = clamp(point.y, bounds.minY, bounds.maxY);

  const nextX = clamp(x + deltaX, bounds.minX, bounds.maxX);
  if (canStandAt(collision, nextX, y, body)) x = nextX;

  const nextY = clamp(y + deltaY, bounds.minY, bounds.maxY);
  if (canStandAt(collision, x, nextY, body)) y = nextY;

  return { x, y };
}
