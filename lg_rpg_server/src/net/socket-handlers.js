import {
  CHARACTER_KITS,
  CHARACTER_MELEE,
  DEFAULT_CHARACTER,
  GAME_MODES,
  GAME_PHASES,
  HEALTH_BY_ID,
  LOADOUT_SLOTS,
  PLAYER_DEFAULTS,
  PLAYER_RANGED,
  PLAYER_SPECIALS,
  POWERUP_BY_ID,
  PVP,
  PVP_TEAMS,
  SERVER_CONFIG,
  SOCKET_EVENTS,
  VALID_CHARACTERS,
  VALID_GAME_MODES,
} from '../../game_constants.js';
import { io } from '../app.js';
import { publicDir } from '../paths.js';
import { state } from '../state.js';
import { getSelectedMapConfig } from '../maps.js';
import { createMode } from '../game-modes.js';
import { broadcastLobby, playerHitbox, spawnPlayerPosition } from '../players.js';
import {
  cancelEmptyGrace,
  endMatch,
  markPlayerDisconnected,
  removePlayer,
  startMatchState,
} from '../match.js';
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

export function registerSocketHandlers() {
  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // The right screen registers to receive and play AI commentary audio.
    socket.on(SOCKET_EVENTS.REGISTER_CHEERLEADER_SCREEN, () => {
      registerCheerleaderAudioScreen(socket);
    });

    socket.on(SOCKET_EVENTS.CHEERLEADER_SPOKEN, ({ speaker, line } = {}) => {
      if (!line) return;
      logSpoken(`${new Date().toISOString()}  ${speaker || 'Curly'}: ${line}\n`);
    });

    socket.on(SOCKET_EVENTS.JOIN_LOBBY, (payload = {}) => {
      const playerId = String(payload.playerId || '').trim();
      if (!playerId) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Missing player id.' });
        return;
      }

      if (state.phase === GAME_PHASES.PLAYING && !state.players.has(playerId)) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, {
          message: 'A match is in progress. Please wait for it to finish.',
        });
        return;
      }

      const existing = state.players.get(playerId);
      if (!existing && state.players.size >= SERVER_CONFIG.maxPlayers) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Lobby is full.' });
        return;
      }

      const spawn = existing ? { x: existing.x, y: existing.y } : { x: 0, y: 0 };

      // Keeps existing stats on reconnect.
      const player = {
        ...existing,
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
        character: existing?.character ?? DEFAULT_CHARACTER,
        loadout: existing?.loadout ?? [], // equipped power-up/health item ids
        powerupCooldowns: existing?.powerupCooldowns ?? {},
        // Last movement direction, so ranged shots fire where the player faces.
        facingX: existing?.facingX ?? 1,
        facingY: existing?.facingY ?? 0,
        rangedCooldowns: existing?.rangedCooldowns ?? {},
      };

      // Drop the stale mapping when a player rejoins on a new socket.
      if (existing && existing.socketId !== socket.id) {
        state.socketPlayers.delete(existing.socketId);
      }

      state.players.set(playerId, player);
      state.socketPlayers.set(socket.id, playerId);
      if (state.phase === GAME_PHASES.PLAYING) cancelEmptyGrace();

      console.log(`[lobby] player joined: ${player.name} (${player.playerId}). total=${state.players.size}`);
      broadcastLobby();
    });

    socket.on(SOCKET_EVENTS.MOVE, (data = {}) => {
      const player = state.players.get(state.socketPlayers.get(socket.id));
      if (!player || player.dead) return;
      // Baked into velocity here so the sprint starts and ends responsively.
      const boosted = (player.speedBoostUntil || 0) > Date.now();
      const speed = PLAYER_DEFAULTS.speed * (boosted ? POWERUP_BY_ID.speed.multiplier : 1);
      player.velocityX = (data.dx || 0) * speed;
      player.velocityY = (data.dy || 0) * speed;
      // Facing aims the next shot: twin-stick aim if sent, else movement dir; released keeps last.
      if (data.ax || data.ay) {
        const len = Math.hypot(data.ax || 0, data.ay || 0) || 1;
        player.facingX = (data.ax || 0) / len;
        player.facingY = (data.ay || 0) / len;
      } else if (data.dx || data.dy) {
        const len = Math.hypot(data.dx || 0, data.dy || 0) || 1;
        player.facingX = (data.dx || 0) / len;
        player.facingY = (data.dy || 0) / len;
      }
    });

    // Triggers attacks: payload.kind picks a special, validated against the character's kit.
    socket.on(SOCKET_EVENTS.PLAYER_ATTACK, (payload = {}) => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);
      if (!player || player.dead || !state.activeMode || typeof state.activeMode.playerAttack !== 'function') return;

      const kit = CHARACTER_KITS[player.character];
      const kind = typeof payload?.kind === 'string' && kit?.specials.includes(payload.kind)
        ? payload.kind
        : kit?.basic;
      const ranged = kind ? PLAYER_RANGED.attacks[kind] : null;
      const special = kind ? PLAYER_SPECIALS.attacks[kind] : null;

      // Shared attack cooldown, plus the per-kind one for ranged shots and melee specials.
      const now = Date.now();
      if (now - (player.lastAttackAt || 0) < PLAYER_DEFAULTS.attackCooldownMs) return;
      if (ranged || special) {
        player.rangedCooldowns = player.rangedCooldowns || {};
        if (now - (player.rangedCooldowns[kind] || 0) < (ranged ?? special).cooldownMs) return;
      }
      player.lastAttackAt = now;

      player.action = 'attack';
      // Lets the screens play the matching FX off the existing action signal, with no event of their own.
      player.actionKind = kind || null;

      const powered = (player.powerUntil || 0) > now;
      const dmgMult = powered ? POWERUP_BY_ID.power.multiplier : 1;

      if (ranged && typeof state.activeMode.firePlayerProjectile === 'function') {
        player.rangedCooldowns[kind] = now;
        // Cloned so the projectile carries the boosted damage via cfg.damage/dot.
        const shotCfg = dmgMult === 1 ? ranged : {
          ...ranged,
          damage: ranged.damage * dmgMult,
          dot: ranged.dot ? { ...ranged.dot, damage: ranged.dot.damage * dmgMult } : ranged.dot,
        };
        // Hold the attack pose through the draw, then loose the shot on the release frame.
        player.actionExpiresAt = now + PLAYER_RANGED.windupMs + PLAYER_DEFAULTS.actionSignalMs;
        const mode = state.activeMode;
        // An explicit twin-stick aim vector beats the movement facing.
        const aimX = Number(payload?.aimX);
        const aimY = Number(payload?.aimY);
        const aimLen = Math.hypot(aimX, aimY);
        const hasAim = Number.isFinite(aimX) && Number.isFinite(aimY) && aimLen > 0.01;
        setTimeout(() => {
          // The match may have ended or the player died/left during the draw.
          if (state.activeMode !== mode || player.dead || state.players.get(playerId) !== player) return;
          // Read here, not at press, so steering during the draw still aims the shot.
          const dirX = hasAim ? aimX / aimLen : player.facingX || 1;
          const dirY = hasAim ? aimY / aimLen : player.facingY || 0;
          mode.firePlayerProjectile(player, shotCfg, dirX, dirY);
        }, PLAYER_RANGED.windupMs);
        return;
      }

      player.actionExpiresAt = now + PLAYER_DEFAULTS.actionSignalMs;

      // One radial hit with kill crediting; shared by the basic swing and every melee special.
      const swing = (radius, damage) => {
        const result = state.activeMode?.playerAttack(player, playerHitbox(player), radius, damage);
        const killCount = Number.isFinite(result?.kills) ? result.kills : result?.killed ? 1 : 0;
        if (killCount > 0) {
          player.kills = (player.kills || 0) + killCount;
          emitGameEvent('kill', { playerId: player.playerId, name: player.name, kills: player.kills });
        }
      };

      if (special) {
        player.rangedCooldowns[kind] = now;
        // Hold the attack pose for the whole ability, not just the one-frame signal.
        const activeMs = special.mode === 'pulse'
          ? special.pulses * special.pulseIntervalMs
          : special.mode === 'dash' ? special.dashMs : PLAYER_DEFAULTS.actionSignalMs;
        player.actionExpiresAt = now + activeMs + PLAYER_DEFAULTS.actionSignalMs;
        const mode = state.activeMode;
        // Every repeat re-checks that the match, mode and player are still the ones we started on.
        const stillLive = () => state.activeMode === mode
          && !player.dead
          && state.players.get(playerId) === player;

        if (special.mode === 'pulse') {
          for (let i = 0; i < special.pulses; i++) {
            const fire = () => { if (stillLive()) swing(special.radius, special.damage * dmgMult); };
            if (i === 0) fire();
            else setTimeout(fire, i * special.pulseIntervalMs);
          }
          // Once up front, not per pulse, so the slow window starts when the cast does. Co-op only — PvP has no enemies and doesn't implement the hook.
          if (special.slow) mode.applySlow?.(playerHitbox(player), special.radius, special.slow);
        } else if (special.mode === 'dash') {
          // Reuses the knockback channel the game loop already integrates, shoving along her own facing instead of away from a hit.
          const dirX = player.facingX || 1;
          const dirY = player.facingY || 0;
          const len = Math.hypot(dirX, dirY) || 1;
          player.knockbackVx = (dirX / len) * special.dashSpeed;
          player.knockbackVy = (dirY / len) * special.dashSpeed;
          player.knockbackUntil = now + special.dashMs;
          // Ticks across the dash so enemies she passes through are caught, not only those where she started.
          for (let i = 0; i < special.hits; i++) {
            const fire = () => { if (stillLive()) swing(special.radius, (special.damage / special.hits) * dmgMult); };
            if (i === 0) fire();
            else setTimeout(fire, Math.round((i * special.dashMs) / special.hits));
          }
        } else if (special.mode === 'blessing') {
          player.health = Math.min(player.maxHealth, player.health + special.heal);
          if (player.health > player.maxHealth * 0.3) player.lowHealthSignaled = false;
          mode.applyWeaken?.(playerHitbox(player), special.radius, special.weaken);
        }
        return;
      }

      const melee = CHARACTER_MELEE[player.character];
      swing(
        melee?.range ?? PLAYER_DEFAULTS.attackRange,
        (melee?.damage ?? PLAYER_DEFAULTS.attackDamage) * dmgMult,
      );
    });

    // Activates a loadout item (buff or potion); must be equipped and off cooldown.
    socket.on(SOCKET_EVENTS.ACTIVATE_POWERUP, (data = {}) => {
      const player = state.players.get(state.socketPlayers.get(socket.id));
      if (!player || player.dead) return;
      const type = String(data.type || '');
      if (!Array.isArray(player.loadout) || !player.loadout.includes(type)) return;

      const powerup = POWERUP_BY_ID[type];
      const health = HEALTH_BY_ID[type];
      if (!powerup && !health) return;

      const now = Date.now();
      const cooldownMs = powerup?.cooldownMs ?? health?.cooldownMs ?? 0;
      player.powerupCooldowns = player.powerupCooldowns || {};
      if (now - (player.powerupCooldowns[type] || 0) < cooldownMs) return;

      if (powerup) {
        // Absolute expiries, read by the game loop and the MOVE handler.
        if (type === 'speed') player.speedBoostUntil = now + powerup.durationMs;
        else if (type === 'shield') player.shieldUntil = now + powerup.durationMs;
        else if (type === 'reflect') player.reflectUntil = now + powerup.durationMs;
        else if (type === 'power') player.powerUntil = now + powerup.durationMs;
      } else {
        player.health = Math.min(player.maxHealth, player.health + health.heal);
        if (player.health > player.maxHealth * 0.3) player.lowHealthSignaled = false;
      }
      player.powerupCooldowns[type] = now;
    });

    // Lets a player pick their character from the lobby (its specials load free).
    socket.on(SOCKET_EVENTS.SELECT_CHARACTER, (data = {}) => {
      const player = state.players.get(state.socketPlayers.get(socket.id));
      if (!player) return;
      if (state.phase === GAME_PHASES.PLAYING) return;
      const character = String(data.character || '');
      if (!VALID_CHARACTERS.has(character)) return;
      player.character = character;
      broadcastLobby();
    });

    // Sets the player's equipped loadout — up to LOADOUT_SLOTS unique valid item ids.
    socket.on(SOCKET_EVENTS.SET_LOADOUT, (data = {}) => {
      const player = state.players.get(state.socketPlayers.get(socket.id));
      if (!player) return;
      if (state.phase === GAME_PHASES.PLAYING) return;
      const items = Array.isArray(data.items) ? data.items : [];
      const valid = [];
      for (const raw of items) {
        const id = String(raw);
        if (!POWERUP_BY_ID[id] && !HEALTH_BY_ID[id]) continue;
        if (valid.includes(id)) continue;
        valid.push(id);
        if (valid.length >= LOADOUT_SLOTS) break;
      }
      player.loadout = valid;
    });

    // Host-only, lobby-only.
    socket.on(SOCKET_EVENTS.SELECT_GAME_MODE, (payload = {}) => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);

      if (!player) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before selecting a game mode.' });
        return;
      }

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

    // Loads the map, places players and starts the mode simulation.
    socket.on(SOCKET_EVENTS.START_GAME, () => {
      const playerId = state.socketPlayers.get(socket.id);
      const player = state.players.get(playerId);

      if (!player) {
        socket.emit(SOCKET_EVENTS.LOBBY_ERROR, { message: 'Join the lobby before starting the game.' });
        return;
      }

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

      state.currentMap = loadMap(publicDir, selectedMapConfig.map);
      state.worldBounds = state.currentMap.bounds;

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

    socket.on(SOCKET_EVENTS.LEAVE_LOBBY, () => {
      const playerId = state.socketPlayers.get(socket.id);
      if (!playerId) return;

      removePlayer(playerId, socket.id);
      console.log(`[lobby] player left: ${playerId}. total=${state.players.size}`);

      // A voluntary leave by the last player ends the match now, skipping the disconnect grace window.
      if (state.players.size === 0 && state.phase === GAME_PHASES.PLAYING) {
        endMatch('all-left');
      } else {
        broadcastLobby();
      }
    });

    socket.on('disconnect', () => {
      unregisterCheerleaderAudioScreen(socket.id);
      const playerId = state.socketPlayers.get(socket.id);

      if (!playerId) {
        state.socketPlayers.delete(socket.id);
        console.log(`[socket] disconnected: ${socket.id}`);
        return;
      }

      if (state.phase === GAME_PHASES.PLAYING && state.selectedMode === GAME_MODES.PVP) {
        markPlayerDisconnected(playerId, socket.id);
      } else {
        removePlayer(playerId, socket.id);
      }
      console.log(`[lobby] player disconnected: ${playerId}. total=${state.players.size}`);
      broadcastLobby();
    });
  });
}
