import fs from 'fs';
import path from 'path';

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

  return { bounds, zones };
}
