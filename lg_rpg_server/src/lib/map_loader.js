import fs from 'fs';
import path from 'path';
import { createCollisionGrid } from './collision.js';

const GID_MASK = 0x0fffffff;

// Finds an object layer with the specified name in a Tiled map structure.
function findObjectLayer(layers, name) {
  for (const layer of layers) {
    if (layer.type === 'objectgroup' && layer.name === name) return layer;
    if (layer.type === 'group' && layer.layers) {
      const found = findObjectLayer(layer.layers, name);
      if (found) return found;
    }
  }
  return null;
}

// Extracts non-empty rectangular objects from a Tiled object layer.
function extractRects(layer) {
  if (!layer) return [];
  // Filter out invalid sizes and map to simplified rectangle structures
  return layer.objects
    .filter((o) => o.width > 0 && o.height > 0)
    .map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));
}

function attrs(tag) {
  const out = {};
  for (const match of tag.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/g)) {
    out[match[1]] = match[2];
  }
  return out;
}

function readJsonTilesetData(rawTiles = []) {
  const collidableIds = new Set();
  const walkableIds = new Set();
  const animations = new Map();

  for (const tile of rawTiles) {
    for (const prop of tile.properties || []) {
      if (prop.value !== true && prop.value !== 'true') continue;
      const name = String(prop.name || '').trim();
      if (name === 'collides') collidableIds.add(tile.id);
      if (name === 'walkable') walkableIds.add(tile.id);
    }
    if (tile.animation?.length) {
      animations.set(tile.id, tile.animation.map((frame) => ({ tileid: frame.tileid })));
    }
  }

  return { collidableIds, walkableIds, animations };
}

function readTsxTilesetData(tsxPath) {
  const xml = fs.readFileSync(tsxPath, 'utf8');
  const collidableIds = new Set();
  const walkableIds = new Set();
  const animations = new Map();

  for (const match of xml.matchAll(/<tile\b[^>]*>[\s\S]*?<\/tile>/g)) {
    const tileXml = match[0];
    const tileTag = tileXml.match(/<tile\b[^>]*>/)?.[0] || '';
    const id = Number(attrs(tileTag).id);

    for (const propMatch of tileXml.matchAll(/<property\b[^>]*>/g)) {
      const prop = attrs(propMatch[0]);
      if (prop.value !== 'true') continue;
      const name = String(prop.name || '').trim();
      if (name === 'collides') collidableIds.add(id);
      if (name === 'walkable') walkableIds.add(id);
    }

    const frames = [];
    for (const frameMatch of tileXml.matchAll(/<frame\b[^>]*>/g)) {
      frames.push({ tileid: Number(attrs(frameMatch[0]).tileid) });
    }
    if (frames.length) animations.set(id, frames);
  }

  return { collidableIds, walkableIds, animations };
}

function tilesetData(tmjPath, tileset) {
  if (!tileset.source) return readJsonTilesetData(tileset.tiles);

  const tsxPath = path.resolve(path.dirname(tmjPath), tileset.source.replace(/\\/g, '/'));
  return readTsxTilesetData(tsxPath);
}

function collectCollisionGids(tmjPath, tilesets) {
  const collidableGids = new Set();
  const walkableGids = new Set();

  for (const tileset of tilesets) {
    const { collidableIds, walkableIds, animations } = tilesetData(tmjPath, tileset);

    for (const localId of collidableIds) {
      collidableGids.add(tileset.firstgid + localId);
    }

    for (const localId of walkableIds) {
      walkableGids.add(tileset.firstgid + localId);
    }

    for (const [localId, frames] of animations) {
      if (collidableIds.has(localId) || frames.some((frame) => collidableIds.has(frame.tileid))) {
        collidableGids.add(tileset.firstgid + localId);
      }
      if (walkableIds.has(localId) || frames.some((frame) => walkableIds.has(frame.tileid))) {
        walkableGids.add(tileset.firstgid + localId);
      }
    }
  }

  return { collidableGids, walkableGids };
}

function buildCollision(tmjPath, tmj) {
  const { collidableGids, walkableGids } = collectCollisionGids(tmjPath, tmj.tilesets || []);
  const blocked = new Uint8Array(tmj.width * tmj.height);
  let blockedCount = 0;

  for (const layer of tmj.layers || []) {
    if (layer.type !== 'tilelayer' || !layer.data) continue;
    const width = layer.width || tmj.width;
    for (let i = 0; i < layer.data.length; i += 1) {
      const gid = (layer.data[i] >>> 0) & GID_MASK;
      const tileX = i % width;
      const tileY = Math.floor(i / width);
      const index = tileY * tmj.width + tileX;
      if (walkableGids.has(gid)) {
        if (blocked[index] !== 0) blockedCount -= 1;
        blocked[index] = 0;
        continue;
      }
      if (!collidableGids.has(gid)) continue;
      if (blocked[index] === 0) blockedCount += 1;
      blocked[index] = 1;
    }
  }

  return {
    ...createCollisionGrid({
      width: tmj.width,
      height: tmj.height,
      tileWidth: tmj.tilewidth,
      tileHeight: tmj.tileheight,
      blocked,
    }),
    blockedCount,
    collidableTileCount: collidableGids.size,
    walkableTileCount: walkableGids.size,
  };
}

// Loads and parses a Tiled map JSON file to extract pixel dimensions and configured zones.
export function loadMap(publicDir, mapConfig) {
  // Read and parse the TMJ map file from the public assets directory
  const tmjPath = path.join(publicDir, 'assets', mapConfig.path);
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));

  // Calculate the total map dimensions in pixels
  const bounds = {
    width: tmj.width * tmj.tilewidth,
    height: tmj.height * tmj.tileheight,
  };

  // Map requested tiled layers to logical zones
  const objectLayers = mapConfig.objectLayers || {};
  const zones = {};
  for (const [logicalName, tiledName] of Object.entries(objectLayers)) {
    zones[logicalName] = extractRects(findObjectLayer(tmj.layers, tiledName));
  }

  const collision = buildCollision(tmjPath, tmj);

  const zoneCounts = Object.entries(zones).map(([name, rects]) => `${name}=${rects.length}`).join(' ');
  console.log(`[map] loaded ${mapConfig.path} | ${bounds.width}x${bounds.height}px | zones: ${zoneCounts} | blocked tiles: ${collision.blockedCount}`);

  return { bounds, zones, collision };
}
