import {
  GAME_MODES,
  GAME_PHASES,
  PLAYER_DEFAULTS,
  PVP,
  PVP_TEAMS,
  SERVER_CONFIG,
  SOCKET_EVENTS,
  VALID_GAME_MODES,
} from '../../game_constants.js';
import { io } from '../app.js';
import { publicDir } from '../paths.js';
import { state } from '../state.js';
import { getSelectedMapConfig } from '../maps.js';
import { createMode } from '../game-modes.js';
import { broadcastLobby, playerHitbox, spawnPlayerPosition } from '../players.js';
import { cancelEmptyGrace, endMatch, removePlayer, startMatchState } from '../match.js';
import {
  drainGameEvents,
  emitCheerleaderAudio,
  emitGameEvent,
  getCheerleaderContext,
  logSpoken,
  registerCheerleaderAudioScreen,
  unregisterCheerleaderAudioScreen,
} from '../cheerleader-bridge.js';
import { loadMap } from '../lib/map_loader.js';
import { HeartField } from '../lib/hearts.js';
import { createCheerleader } from '../lib/cheerleader/index.js';

// Registers network handlers to manage player socket connections.
export function registerSocketHandlers() {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // Registers the right screen to receive and play AI commentary audio.
    socket.on(SOCKET_EVENTS.REGISTER_CHEERLEADER_SCREEN, () => {
      registerCheerleaderAudioScreen(socket);
    });

    // Logs the commentary text when the cheerleader speaks.
    socket.on(SOCKET_EVENTS.CHEERLEADER_SPOKEN, ({ speaker, line } = {}) => {
      if (!line) return;
      logSpoken(`${new Date().toISOString()}  ${speaker || 'Curly'}: ${line}\n`);
    });

    // Adds a player to the lobby, validating connection and player limits.
    socket.on(SOCKET_EVENTS.JOIN_LOBBY, (payload = {}) => {
      const playerId = String(payload.playerId || '').trim();
      if (!playerId) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Missing player id.' });
        return;
      }

      // Block new players from joining during an active match.
      if (state.phase === GAME_PHASES.PLAYING && !state.players.has(playerId)) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, {
          message: 'A match is in progress. Please wait for it to finish.',
        });
        return;
      }

      // Block connection if the lobby is full.
      const existing = state.players.get(playerId);
      if (!existing && state.players.size >= SERVER_CONFIG.maxPlayers) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Lobby is full.' });
        return;
      }

      const spawn = existing ? { x: existing.x, y: existing.y } : { x: 0, y: 0 };

      // Initialize player state or keep existing stats on reconnect.
      const player = {
        playerId,
        name: String(payload.name || existing?.name || `Player ${state.players.size + 1}`),
        isReady: existing?.isReady ?? false,
        isHost: existing?.isHost ?? state.players.size === 0,
        joinedAt: existing?.joinedAt ?? Date.now(),
        socketId: socket.id,
        x: spawn.x,
        y: spawn.y,
        velocityX: existing?.velocityX ?? 0,
        velocityY: existing?.velocityY ?? 0,
        health: existing?.health ?? PLAYER_DEFAULTS.maxHealth,
        maxHealth: PLAYER_DEFAULTS.maxHealth,
        dead: existing?.dead ?? false,
        action: existing?.action ?? null,
        actionExpiresAt: existing?.actionExpiresAt ?? 0,
        kills: existing?.kills ?? 0,
        lastAttackAt: existing?.lastAttackAt ?? 0,
        team: existing?.team ?? null,
      };

      // Clean up the old socket mapping if the player rejoins on a new socket.
      if (existing && existing.socketId !== socket.id) {
        state.socketPlayers.delete(existing.socketId);
      }

      state.players.set(playerId, player);
      state.socketPlayers.set(socket.id, playerId);

      console.log(`[lobby] player joined: ${player.name} (${player.playerId}). total=${state.players.size}`);
      broadcastLobby();
    });

    // Updates the player's movement direction based on controller inputs.
    socket.on(SOCKET_EVENTS.MOVE, (data = {}) => {
      const player = state.players.get(state.socketPlayers.get(socket.id));
      if (!player || player.dead) return;
      player.velocityX = (data.dx || 0) * PLAYER_DEFAULTS.speed;
      player.velocityY = (data.dy || 0) * PLAYER_DEFAULTS.speed;
    });

    // Triggers player combat actions and checks attack cooldowns.
    socket.on(SOCKET_EVENTS.PLAYER_ATTACK, () => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);
      if (!player || player.dead || !state.activeMode || typeof state.activeMode.playerAttack !== 'function') return;

      // Enforce the attack cooldown.
      const now = Date.now();
      if (now - (player.lastAttackAt || 0) < PLAYER_DEFAULTS.attackCooldownMs) return;
      player.lastAttackAt = now;

      player.action = 'attack';
      player.actionExpiresAt = now + PLAYER_DEFAULTS.actionSignalMs;

      // Execute attack through the active game mode simulation.
      const result = state.activeMode.playerAttack(
        player,
        playerHitbox(player),
        PLAYER_DEFAULTS.attackRange,
        PLAYER_DEFAULTS.attackDamage,
      );
      const killCount = Number.isFinite(result?.kills) ? result.kills : result?.killed ? 1 : 0;
      if (killCount > 0) {
        player.kills = (player.kills || 0) + killCount;
        emitGameEvent('kill', { playerId: player.playerId, name: player.name, kills: player.kills });
      }
    });

    // Allows the host to change the game mode from the lobby.
    socket.on(SOCKET_EVENTS.SELECT_GAME_MODE, (payload = {}) => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);

      if (!player) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before selecting a game mode.' });
        return;
      }

      // Ensure only the host can select the game mode.
      if (!player.isHost) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Only the host can select the game mode.' });
        return;
      }

      if (state.phase === GAME_PHASES.PLAYING) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Cannot change the mode during a match.' });
        return;
      }

      const mode = String(payload.mode || '').trim();
      if (!VALID_GAME_MODES.has(mode)) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Invalid game mode.' });
        return;
      }

      state.selectedMode = mode;
      console.log(`[lobby] game mode selected: ${state.selectedMode} by ${player.name} (${player.playerId})`);
      broadcastLobby();
    });

    // Lets a player pick their PvP team from the lobby.
    socket.on(SOCKET_EVENTS.SELECT_TEAM, (payload = {}) => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);

      if (!player) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before selecting a team.' });
        return;
      }

      if (state.phase === GAME_PHASES.PLAYING) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Cannot change teams during a match.' });
        return;
      }

      const team = String(payload.team || '').trim();
      if (!PVP_TEAMS.includes(team)) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Invalid team.' });
        return;
      }

      player.team = team;
      console.log(`[lobby] team selected: ${team} by ${player.name} (${player.playerId})`);
      broadcastLobby();
    });

    // Initializes the map, spawn locations, and simulations to start the match.
    socket.on(SOCKET_EVENTS.START_GAME, () => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);

      if (!player) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before starting the game.' });
        return;
      }

      // Ensure only the host can start the game.
      if (!player.isHost) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Only the host can start the game.' });
        return;
      }

      if (state.phase === GAME_PHASES.PLAYING) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'A match is already in progress.' });
        return;
      }

      // PvP is team-vs-team, so both teams must end up with at least one player.
      if (state.selectedMode === GAME_MODES.PVP) {
        if (state.players.size < PVP.minPlayers) {
          socket.emit(SOCKET_EVENTS.LOBBY_ERROR, {
            message: `PvP needs at least ${PVP.minPlayers} players. Wait for another player to join.`,
          });
          return;
        }
        // Unassigned players get auto-balanced, so only an all-on-one-team lobby is invalid.
        const counts = { teamA: 0, teamB: 0 };
        let unassigned = 0;
        for (const p of state.players.values()) {
          if (PVP_TEAMS.includes(p.team)) counts[p.team] += 1;
          else unassigned += 1;
        }
        if (unassigned === 0 && (counts.teamA === 0 || counts.teamB === 0)) {
          socket.emit(SOCKET_EVENTS.LOBBY_ERROR, {
            message: 'Both teams need at least one player. Move someone to the other team.',
          });
          return;
        }
      }

      console.log(`[game] started in ${state.selectedMode} mode by ${player.name} (${player.playerId})`);
      cancelEmptyGrace();
      state.phase = GAME_PHASES.PLAYING;
      const selectedMapConfig = getSelectedMapConfig();

      // Load map assets and boundaries.
      state.currentMap = loadMap(publicDir, selectedMapConfig.map);
      state.worldBounds = state.currentMap.bounds;

      // Create the game mode simulation and reset player stats.
      if (state.activeMode) state.activeMode.stop();
      state.activeMode = createMode(state.selectedMode, state.currentMap);
      startMatchState();


      if (typeof state.activeMode?.placePlayers === 'function') {
        state.activeMode.placePlayers(Array.from(state.players.values()));
      } else {
        for (const p of state.players.values()) {
          const spawn = spawnPlayerPosition();
          if (spawn) { p.x = spawn.x; p.y = spawn.y; }
        }
      }

      io.emit(SOCKET_EVENTS.GAME_STARTED, {
        selectedMode: state.selectedMode,
        map: selectedMapConfig.map,
        startedBy: player.playerId,
      });

      // Start the game mode simulation, healing items, and AI commentator.
      state.activeMode?.start();

      if (state.heartField) state.heartField.stop();
      state.heartField = state.activeMode ? new HeartField(state.currentMap) : null;
      state.heartField?.start();

      if (state.cheerleader) state.cheerleader.stop();
      state.cheerleader = createCheerleader({
        drain: drainGameEvents,
        play: emitCheerleaderAudio,
        getMatchContext: getCheerleaderContext,
      });
      state.cheerleader?.start();
      if (state.cheerleader) logSpoken(`\n=== match start ${new Date().toISOString()} — ${state.selectedMode} ===\n`);
      emitGameEvent('match_start', { mode: state.selectedMode });
    });

    // Handles a player manually leaving the lobby.
    socket.on(SOCKET_EVENTS.LEAVE_LOBBY, () => {
      const playerId = state.socketPlayers.get(socket.id);
      if (!playerId) return;

      removePlayer(playerId, socket.id);
      console.log(`[lobby] player left: ${playerId}. total=${state.players.size}`);

      // Voluntary leave: if that was the last player, end the match now instead of waiting out the disconnect grace window.
      if (state.players.size === 0 && state.phase === GAME_PHASES.PLAYING) {
        endMatch('all-left');
      } else {
        broadcastLobby();
      }
    });

    // Clean up player state and notify other clients on disconnect.
    socket.on('disconnect', () => {
      unregisterCheerleaderAudioScreen(socket.id);
      const playerId = state.socketPlayers.get(socket.id);

      if (!playerId) {
        state.socketPlayers.delete(socket.id);
        console.log(`[socket] disconnected: ${socket.id}`);
        return;
      }

      removePlayer(playerId, socket.id);
      console.log(`[lobby] player disconnected: ${playerId}. total=${state.players.size}`);
      broadcastLobby();
    });
  });
}
