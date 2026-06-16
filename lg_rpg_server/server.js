import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import {
  assertGameModesMatchManifest,
  GAME_MODE_LABELS,
  GAME_MODES,
  DEFAULT_GAME_MODE,
  PLAYER_DEFAULTS,
  SERVER_CONFIG,
  SOCKET_EVENTS,
  VALID_GAME_MODES,
  GAME_LOOP,
  ASSET_MANIFESTS,
  PLAYER_SIZE,
} from './game_constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapsManifestPath = path.join(__dirname, 'public', ASSET_MANIFESTS.maps);
const mapsManifest = JSON.parse(fs.readFileSync(mapsManifestPath, 'utf8'));
assertGameModesMatchManifest(mapsManifest);

// Verify that every game mode has a map defined for the current number of screens (totalScreens).
for (const mode of Object.values(GAME_MODES)) {
  if (!mapsManifest.modes[mode]?.maps?.[String(SERVER_CONFIG.totalScreens)]) {
    throw new Error(
      `Maps manifest does not define a ${SERVER_CONFIG.totalScreens}-screen map for "${mode}".`,
    );
  }
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: SERVER_CONFIG.corsOrigin } });

const players = new Map(); // playerId -> player state
const socketPlayers = new Map(); // socketId -> playerId, so we can find a player on disconnect
let selectedMode = DEFAULT_GAME_MODE;

// Serve public files and force the browser to always download the newest version.
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
}));

function getSelectedMapConfig() {
  const screenCount = String(SERVER_CONFIG.totalScreens);
  const modeConfig = mapsManifest.modes[selectedMode];
  const mapConfig = modeConfig?.maps?.[screenCount];

  if (!mapConfig) {
    throw new Error(
      `Map config not found for mode "${selectedMode}" and ${screenCount} screens.`,
    );
  }

  return {
    mode: {
      id: modeConfig.id,
      label: modeConfig.label,
    },
    map: mapConfig,
  };
}


function readWorldBounds(mapConfig) {
  const tmjPath = path.join(__dirname, 'public', 'assets', mapConfig.path);
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));
  return {
    width: tmj.width * tmj.tilewidth,
    height: tmj.height * tmj.tileheight,
  };
}

let worldBounds = readWorldBounds(getSelectedMapConfig().map);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => {
  const selectedMapConfig = getSelectedMapConfig();

  res.json({
    totalScreens: SERVER_CONFIG.totalScreens,
    maxPlayers: SERVER_CONFIG.maxPlayers,
    defaultMode: DEFAULT_GAME_MODE,
    selectedMode,
    selectedModeLabel: selectedMapConfig.mode.label,
    map: selectedMapConfig.map,
    gameModes: Object.values(GAME_MODES).map((mode) => ({
      id: mode,
      label: GAME_MODE_LABELS[mode],
    })),
  });
});

function broadcastLobby() {
  const playerList = Array.from(players.values());
  const host = playerList.find((p) => p.isHost);
  io.emit(SOCKET_EVENTS.UPDATE_LOBBY, {
    players: playerList,
    hostId: host?.playerId ?? '',
    selectedMode,
  });
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);


function removePlayer(playerId, socketId) {
  const removed = players.get(playerId);
  players.delete(playerId);
  if (socketId) socketPlayers.delete(socketId);

  // If the host left, promote the next player so the lobby always has a host.
  if (removed?.isHost && players.size > 0) {
    const nextHost = players.values().next().value;
    players.set(nextHost.playerId, { ...nextHost, isHost: true });
  }
  return removed;
}

// --- Game loop: update positions & broadcast ---
setInterval(() => {
  for (const [, player] of players) {
    const nextX = (player.x || PLAYER_DEFAULTS.startX) + (player.velocityX || 0);
    const nextY = (player.y || PLAYER_DEFAULTS.startY) + (player.velocityY || 0);

    // Keep players inside the map.
    player.x = clamp(nextX, PLAYER_SIZE.halfWidth, worldBounds.width - PLAYER_SIZE.halfWidth);
    player.y = clamp(nextY, PLAYER_SIZE.height, worldBounds.height);
  }
  io.emit(SOCKET_EVENTS.GAME_STATE, {
    players: Array.from(players.values()).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      x: p.x || PLAYER_DEFAULTS.startX,
      y: p.y || PLAYER_DEFAULTS.startY,
    })),
  });
}, GAME_LOOP.tickRateMs);

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on(SOCKET_EVENTS.JOIN_LOBBY, (payload = {}) => {
    const playerId = String(payload.playerId || '').trim();
    if (!playerId) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Missing player id.' });
      return;
    }

    // Reuse existing state on rejoin; otherwise reject if the lobby is full.
    const existing = players.get(playerId);
    if (!existing && players.size >= SERVER_CONFIG.maxPlayers) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Lobby is full.' });
      return;
    }

    const player = {
      playerId,
      name: String(payload.name || existing?.name || `Player ${players.size + 1}`),
      isReady: existing?.isReady ?? false,
      isHost: existing?.isHost ?? players.size === 0,
      joinedAt: existing?.joinedAt ?? Date.now(),
      socketId: socket.id,
      x: existing?.x ?? PLAYER_DEFAULTS.startX,
      y: existing?.y ?? PLAYER_DEFAULTS.startY,
      velocityX: existing?.velocityX ?? 0,
      velocityY: existing?.velocityY ?? 0,
    };

    players.set(playerId, player);
    socketPlayers.set(socket.id, playerId);

    console.log(`[lobby] player joined: ${player.name} (${player.playerId}). total=${players.size}`);
    broadcastLobby();
  });

  // Store the player's intended velocity; the game loop applies it each tick.
  socket.on(SOCKET_EVENTS.MOVE, (data) => {
    const player = players.get(data.playerId);
    if (!player) return;
    player.velocityX = (data.dx || 0) * PLAYER_DEFAULTS.speed;
    player.velocityY = (data.dy || 0) * PLAYER_DEFAULTS.speed;
  });

  socket.on(SOCKET_EVENTS.SELECT_GAME_MODE, (payload = {}) => {
    const playerId = socketPlayers.get(socket.id);
    const player = players.get(playerId);

    if (!player) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before selecting a game mode.' });
      return;
    }

    if (!player.isHost) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Only the host can select the game mode.' });
      return;
    }

    const mode = String(payload.mode || '').trim();
    if (!VALID_GAME_MODES.has(mode)) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Invalid game mode.' });
      return;
    }

    selectedMode = mode;
    worldBounds = readWorldBounds(getSelectedMapConfig().map);
    console.log(`[lobby] game mode selected: ${selectedMode} by ${player.name} (${player.playerId})`);
    broadcastLobby();
  });

  socket.on(SOCKET_EVENTS.START_GAME, () => {
    const playerId = socketPlayers.get(socket.id);
    const player = players.get(playerId);

    if (!player) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before starting the game.' });
      return;
    }

    if (!player.isHost) {
      socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Only the host can start the game.' });
      return;
    }

    console.log(`[game] started in ${selectedMode} mode by ${player.name} (${player.playerId})`);
    const selectedMapConfig = getSelectedMapConfig();
    io.emit(SOCKET_EVENTS.GAME_STARTED, {
      selectedMode,
      map: selectedMapConfig.map,
      startedBy: player.playerId,
    });
  });

  socket.on(SOCKET_EVENTS.LEAVE_LOBBY, (payload = {}) => {
    const playerId = String(payload.playerId || socketPlayers.get(socket.id) || '').trim();
    if (!playerId) return;

    removePlayer(playerId, socket.id);
    console.log(`[lobby] player left: ${playerId}. total=${players.size}`);
    broadcastLobby();
  });

  socket.on('disconnect', () => {
    const playerId = socketPlayers.get(socket.id);

    if (!playerId) {
      socketPlayers.delete(socket.id);
      console.log(`[socket] disconnected: ${socket.id}`);
      return;
    }

    removePlayer(playerId, socket.id);
    console.log(`[lobby] player disconnected: ${playerId}. total=${players.size}`);
    broadcastLobby();
  });
});

server.listen(SERVER_CONFIG.port, () => {
  console.log(`Server is running at port ${SERVER_CONFIG.port}`);
});
