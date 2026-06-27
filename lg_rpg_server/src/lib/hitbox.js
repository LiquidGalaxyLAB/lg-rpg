// Shared axis-aligned hitbox geometry helpers used by the game modes.

// Returns the squared gap between two rectangles (0 when they overlap).
export function distanceSqBetweenHitboxes(a, b) {
  const dx = a.left > b.right ? a.left - b.right : b.left > a.right ? b.left - a.right : 0;
  const dy = a.top > b.bottom ? a.top - b.bottom : b.top > a.bottom ? b.top - a.bottom : 0;
  return dx * dx + dy * dy;
}

// Tests whether two rectangles are within `range` pixels of each other.
export function hitboxesWithinRange(a, b, range) {
  return distanceSqBetweenHitboxes(a, b) <= range * range;
}
