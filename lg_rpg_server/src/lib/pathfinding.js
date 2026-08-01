// Forces a number to stay between a low and high limit (too small -> min, too big -> max).
function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

// Straight-line (as-the-crow-flies) distance between two points.
export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Distance without the square root — only good for comparing "who is closer" (faster).
export function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// Gives the arrow that points from point a to point b.
function subtract(b, a) {
  return { x: b.x - a.x, y: b.y - a.y };
}

// Shrinks an arrow to length 1 so it only carries direction, not speed.
function normalize(v) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

const OPEN = 0; // a tile you can walk on
const BLOCKED = 1; // a wall / tile you cannot walk on
const DEFAULT_REPATH_MS = 450; // a target's step-count map is re-made at least this often
const UNREACHED = -1; // a tile the flood never reached (sealed off by walls)

// The 8 tiles around a cell, as two flat lists, so the flood loop is one fast pass of integers.
const DX = Int8Array.of(-1, 0, 1, -1, 1, -1, 0, 1);
const DY = Int8Array.of(-1, -1, -1, 0, 0, 1, 1, 1);

// A unique name for a target so we can store/look up its step-count map.
function targetKey(target) {
  return target?.id ?? '__target';
}

// Turns a pixel position into the grid tile (column,row) it sits on.
function cellFor(point, cellSize, cols, rows) {
  return {
    x: clamp(Math.floor(point.x / cellSize), 0, cols - 1),
    y: clamp(Math.floor(point.y / cellSize), 0, rows - 1),
  };
}

// Gives the pixel point at the exact middle of a grid tile.
function cellCenter(cell, cellSize) {
  return {
    x: cell.x * cellSize + cellSize / 2,
    y: cell.y * cellSize + cellSize / 2,
  };
}

// Makes every wall fatter by `pad` tiles so enemies keep a body-width gap and don't scrape walls.
function inflateGrid(grid, cols, rows, pad) {
  if (pad <= 0) return grid;
  const inflated = grid.map((row) => row.slice());
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      if (grid[y][x] !== BLOCKED) continue;
      for (let dy = -pad; dy <= pad; dy += 1) {
        for (let dx = -pad; dx <= pad; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) inflated[ny][nx] = BLOCKED;
        }
      }
    }
  }
  return inflated;
}

// Builds a grid the size of the map and marks each tile OPEN or BLOCKED (then fattens the walls).
function buildGrid(collision, cols, rows, cellSize, inflateRadius = 0) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(OPEN));
  if (!collision) return grid;

  // Walk every wall tile from the map and mark the grid cells it covers as BLOCKED.
  for (let tileY = 0; tileY < collision.height; tileY += 1) {
    for (let tileX = 0; tileX < collision.width; tileX += 1) {
      if (collision.blocked[tileY * collision.width + tileX] !== BLOCKED) continue;
      const left = tileX * collision.tileWidth;
      const top = tileY * collision.tileHeight;
      const right = left + collision.tileWidth - 0.01;
      const bottom = top + collision.tileHeight - 0.01;
      const minCellX = clamp(Math.floor(left / cellSize), 0, cols - 1);
      const maxCellX = clamp(Math.floor(right / cellSize), 0, cols - 1);
      const minCellY = clamp(Math.floor(top / cellSize), 0, rows - 1);
      const maxCellY = clamp(Math.floor(bottom / cellSize), 0, rows - 1);

      for (let cy = minCellY; cy <= maxCellY; cy += 1) {
        for (let cx = minCellX; cx <= maxCellX; cx += 1) {
          grid[cy][cx] = BLOCKED;
        }
      }
    }
  }

  return inflateGrid(grid, cols, rows, Math.ceil(inflateRadius / cellSize));
}

// True only if (x,y) is inside the map AND that tile is walkable.
function isOpen(grid, cols, rows, x, y) {
  return x >= 0 && x < cols && y >= 0 && y < rows && grid[y][x] === OPEN;
}

// If a spot sits on a wall, search outward ring by ring and return the closest walkable tile.
function findNearestOpenCell(grid, cols, rows, x, y) {
  if (isOpen(grid, cols, rows, x, y)) {
    return { x, y };
  }

  let best = null;
  let bestD2 = Infinity;
  const maxRadius = Math.max(cols, rows);
  // Grow the search ring outward; stop at the first ring that has any open tile.
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

        const nx = x + dx;
        const ny = y + dy;
        if (!isOpen(grid, cols, rows, nx, ny)) continue;

        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = { x: nx, y: ny };
        }
      }
    }
    if (best) return best;
  }

  return null;
}

// Builds the navigation "brain": the open/wall grid plus the tools enemies use to move.
export function createPathfinder(world = {}) {
  const collision = world.collision;
  const bounds = world.bounds || {
    width: collision ? collision.width * collision.tileWidth : 0,
    height: collision ? collision.height * collision.tileHeight : 0,
  };
  const cellSize = world.cellSize || collision?.tileWidth || 16;
  const repathMs = world.repathMs || DEFAULT_REPATH_MS;
  const agentRadius = world.agentRadius || 0;
  // A brake: even while a target keeps moving, don't re-make its map more often than this.
  const minRecomputeMs = Math.max(80, Math.floor(repathMs / 3));

  // No map/walls to navigate: hand back a dummy that just points straight at the target.
  if (!collision || bounds.width <= 0 || bounds.height <= 0) {
    return {
      prepare() {
      },

      reachable() {
        return true;
      },

      direction(from, to) {
        if (!to) return { x: 0, y: 0 };
        return normalize(subtract(to, from));
      },
    };
  }

  // How many tiles wide/tall the grid is, then build the open/wall grid once (walls never move).
  const cols = Math.ceil(bounds.width / cellSize);
  const rows = Math.ceil(bounds.height / cellSize);
  const grid = buildGrid(collision, cols, rows, cellSize, agentRadius);

  // One step-count map per target, enemies roll "downhill" — one flood per player, not per enemy.
  const fields = new Map(); // target id -> { srcX, srcY, dist: Int32Array, computedAt }
  const targetMap = new Map();
  const queue = new Int32Array(cols * rows); // shared BFS frontier (floods are sequential)

  // Same as isOpen, but reuses this pathfinder's own grid/size.
  function open(cx, cy) {
    return cx >= 0 && cx < cols && cy >= 0 && cy < rows && grid[cy][cx] === OPEN;
  }

  // Can we step from a tile to a neighbor? A diagonal is blocked if it would squeeze past a corner.
  function stepAllowed(cx, cy, dx, dy) {
    if (!open(cx + dx, cy + dy)) return false;
    if (dx !== 0 && dy !== 0) return open(cx + dx, cy) && open(cx, cy + dy);
    return true;
  }

  // Numbers every reachable tile with its step-count from the target (0 at target, -1 = unreachable).
  function floodFrom(cellX, cellY) {
    const dist = new Int32Array(cols * rows).fill(UNREACHED);
    const start = findNearestOpenCell(grid, cols, rows, cellX, cellY);
    if (!start) return dist;

    let head = 0;
    let tail = 0;
    const startIdx = start.y * cols + start.x;
    dist[startIdx] = 0;
    queue[tail++] = startIdx;

    // Pull the next tile from the line and stamp each new reachable neighbor with "my number + 1".
    while (head < tail) {
      const idx = queue[head++];
      const x = idx % cols;
      const y = (idx - x) / cols;
      const d = dist[idx];
      for (let i = 0; i < 8; i += 1) {
        const dx = DX[i];
        const dy = DY[i];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const nIdx = ny * cols + nx;
        if (dist[nIdx] !== UNREACHED) continue;
        if (!stepAllowed(x, y, dx, dy)) continue;
        dist[nIdx] = d + 1;
        queue[tail++] = nIdx;
      }
    }
    return dist;
  }

  // Gives a target's step-count map, re-making it when the target moved tile or it got too old.
  function fieldFor(target, now) {
    const key = targetKey(target);
    const cell = cellFor(target, cellSize, cols, rows);
    let field = fields.get(key);
    const movedCell = !field || field.srcX !== cell.x || field.srcY !== cell.y;
    const stale =
      !field ||
      now - field.computedAt >= repathMs ||
      (movedCell && now - field.computedAt >= minRecomputeMs);
    if (stale) {
      field = { srcX: cell.x, srcY: cell.y, dist: floodFrom(cell.x, cell.y), computedAt: now };
      fields.set(key, field);
    }
    return field;
  }

  return {
    // Remembers who is being chased right now and throws away maps for targets no longer chased.
    prepare(activeTargets) {
      const activeKeys = new Set();
      targetMap.clear();
      for (const target of activeTargets || []) {
        const key = targetKey(target);
        activeKeys.add(key);
        targetMap.set(key, target);
      }
      for (const key of fields.keys()) {
        if (!activeKeys.has(key)) fields.delete(key);
      }
    },

    targets: targetMap,

    // Can something at `point` actually walk to `target`? Used to reject spawns sealed behind walls.
    reachable(point, target) {
      if (!target) return false;
      const field = fieldFor(target, Date.now());
      let cx = clamp(Math.floor(point.x / cellSize), 0, cols - 1);
      let cy = clamp(Math.floor(point.y / cellSize), 0, rows - 1);
      if (grid[cy][cx] !== OPEN) {
        const nearest = findNearestOpenCell(grid, cols, rows, cx, cy);
        if (!nearest) return false;
        cx = nearest.x;
        cy = nearest.y;
      }
      return field.dist[cy * cols + cx] !== UNREACHED;
    },

    // Tells an enemy which way to step: toward the neighbor tile with the smallest step-count.
    direction(from, to) {
      if (!to) return { x: 0, y: 0 };

      const fromCell = cellFor(from, cellSize, cols, rows);
      const toCell = cellFor(to, cellSize, cols, rows);
      // Same cell as the target: just seek straight to it.
      if (fromCell.x === toCell.x && fromCell.y === toCell.y) {
        return normalize(subtract(to, from));
      }

      const now = Date.now();
      const dist = fieldFor(to, now).dist;

      let cx = fromCell.x;
      let cy = fromCell.y;
      if (grid[cy][cx] !== OPEN) {
        const nearest = findNearestOpenCell(grid, cols, rows, cx, cy);
        if (nearest) {
          cx = nearest.x;
          cy = nearest.y;
        }
      }

      const here = dist[cy * cols + cx];
      // Unreachable from the target's flood (sealed region): fall back to a direct seek.
      if (here === UNREACHED) return normalize(subtract(to, from));

      // Look at the 8 neighbors and pick the walkable one with the smallest step-count.
      let bestX = -1;
      let bestY = -1;
      let bestD = here;
      for (let i = 0; i < 8; i += 1) {
        const dx = DX[i];
        const dy = DY[i];
        if (!stepAllowed(cx, cy, dx, dy)) continue;
        const nd = dist[(cy + dy) * cols + (cx + dx)];
        if (nd === UNREACHED) continue;
        if (nd < bestD) {
          bestD = nd;
          bestX = cx + dx;
          bestY = cy + dy;
        }
      }
      if (bestX === -1) return normalize(subtract(to, from));

      const waypoint = cellCenter({ x: bestX, y: bestY }, cellSize);
      return normalize(subtract(waypoint, from));
    },
  };
}
