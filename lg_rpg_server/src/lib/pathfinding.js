// Keeps a number within a minimum and maximum limit.
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Calculates the straight-line distance between two points.
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculates the squared distance (faster because it skips the square root).
export function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Subtracts point a from point b.
export function subtract(b, a) {
  return { x: b.x - a.x, y: b.y - a.y };
}

// Adjusts a direction to have a length of 1.
export function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

// Creates a pathfinder helper for the game world.
export function createPathfinder(world = {}) {
  return {
    // Sets up the pathfinder with target locations (empty for now).
    prepare(targets) {
    },

    // Finds the direction pointing from one point to another.
    direction(from, to) {
      if (!to) return { x: 0, y: 0 };
      return normalize(subtract(to, from));
    },
  };
}
