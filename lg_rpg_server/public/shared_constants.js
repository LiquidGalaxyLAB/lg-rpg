
export const SOCKET_EVENTS = Object.freeze({
  JOIN_LOBBY: 'joinLobby',
  LEAVE_LOBBY: 'leaveLobby',
  UPDATE_LOBBY: 'updateLobby',
  LOBBY_ERROR: 'lobbyError',
  SELECT_GAME_MODE: 'selectGameMode',
  SELECT_TEAM: 'selectTeam',
  START_GAME: 'startGame',
  GAME_STARTED: 'gameStarted',
  END_GAME: 'endGame',
  MOVE: 'move',
  PLAYER_ATTACK: 'playerAttack',
  ACTIVATE_POWERUP: 'activatePowerup',
  SELECT_CHARACTER: 'selectCharacter',
  SET_LOADOUT: 'setLoadout',
  GAME_STATE: 'gameState',
  GAME_OVER: 'gameOver',
  YOU_DIED: 'youDied',
  YOU_RESPAWNED: 'youRespawned',
  MATCH_ANNOUNCEMENT: 'matchAnnouncement',
  CHEERLEADER_AUDIO: 'cheerleaderAudio',
  CHEERLEADER_SPOKEN: 'cheerleaderSpoken',
  REGISTER_CHEERLEADER_SCREEN: 'registerCheerleaderScreen',
});

export const GAME_PHASES = Object.freeze({
  LOBBY: 'lobby',
  PLAYING: 'playing',
});

// Per-screen view, in world pixels. fadeZone is the cross-screen fade width.
export const GAME_VIEW = Object.freeze({
  screenWidth: 1080,
  screenHeight: 1920,
  fadeZone: 20,
});

// Loadout system, shared by controller and server: pick a character, fill LOADOUT_SLOTS with items.

export const LOADOUT_SLOTS = 4;

// How long before an active buff's end the client blinks it as "about to expire".
export const POWERUP_BLINK_MS = 2000;

// Power-ups: infinite use, cooldown-gated. durationMs = buff length, cooldownMs = wait to re-use.
export const POWERUP_CATALOG = Object.freeze([
  Object.freeze({ id: 'speed', label: 'Speed', icon: '⚡',
    desc: '2.9× move speed for 10s — kite and reposition fast.',
    durationMs: 10000, cooldownMs: 25000, multiplier: 2.9 }),
  Object.freeze({ id: 'shield', label: 'Shield', icon: '🛡',
    desc: 'Immune to all enemy damage for 15s.',
    durationMs: 15000, cooldownMs: 35000 }),
  Object.freeze({ id: 'reflect', label: 'Reflect', icon: '↩',
    desc: 'Take no damage and bounce it back doubled for 15s.',
    durationMs: 15000, cooldownMs: 40000, multiplier: 2 }),
  Object.freeze({ id: 'power', label: '2× Damage', icon: '💥',
    desc: 'Double your attack damage for 10s.',
    durationMs: 10000, cooldownMs: 30000, multiplier: 2 }),
]);

// Health items: three tiers — the bigger the heal, the longer the cooldown.
export const HEALTH_CATALOG = Object.freeze([
  Object.freeze({ id: 'minor', label: 'Minor Potion', icon: '🧪',
    desc: '+25 HP · short cooldown.', heal: 25, cooldownMs: 6000 }),
  Object.freeze({ id: 'greater', label: 'Greater Potion', icon: '⚗',
    desc: '+50 HP · medium cooldown.', heal: 50, cooldownMs: 15000 }),
  Object.freeze({ id: 'elixir', label: 'Elixir', icon: '🍶',
    desc: '+90 HP · long cooldown.', heal: 90, cooldownMs: 30000 }),
]);

// Playable characters; ids in PLAYER_RANGED fire projectiles, others swing melee. `stub` = unbuilt.
export const CHARACTER_CATALOG = Object.freeze([
  Object.freeze({
    id: 'huntress', displayName: 'Huntress', role: 'Archer',
    blurb: 'Ranged specialist. Aim and fire — burst, poison, pierce and homing.',
    basic: Object.freeze({ id: 'arrow', label: 'Arrow', icon: '🏹' }),
    specials: Object.freeze([
      Object.freeze({ id: 'fire', label: 'Fire', icon: '🔥', cooldownMs: 4000, desc: 'Splash burst — one-shots basic zombies.' }),
      Object.freeze({ id: 'poison', label: 'Acid', icon: '☠', cooldownMs: 4000, desc: 'Light hit, then burns the target over time.' }),
      Object.freeze({ id: 'magic', label: 'Magic', icon: '✦', cooldownMs: 3500, desc: 'Pierces a line of enemies.' }),
      Object.freeze({ id: 'ghost', label: 'Ghost', icon: '👻', cooldownMs: 5000, desc: 'Slow homing orb with splash.' }),
    ]),
  }),
  Object.freeze({
    id: 'water_priestess', displayName: 'Water Priestess', role: 'Attacker',
    blurb: 'Melee bruiser. Swings hit everything up close. Specials coming soon.',
    basic: Object.freeze({ id: 'melee', label: 'Swing', icon: '🗡' }),
    specials: Object.freeze([
      Object.freeze({ id: 'tide', label: 'Tide Slam', icon: '🌊', cooldownMs: 4000, stub: true, desc: 'Reserved — swings for now.' }),
      Object.freeze({ id: 'riptide', label: 'Riptide', icon: '💧', cooldownMs: 4000, stub: true, desc: 'Reserved — swings for now.' }),
      Object.freeze({ id: 'frost', label: 'Frost Nova', icon: '❄', cooldownMs: 5000, stub: true, desc: 'Reserved — swings for now.' }),
      Object.freeze({ id: 'blessing', label: 'Blessing', icon: '✨', cooldownMs: 6000, stub: true, desc: 'Reserved — swings for now.' }),
    ]),
  }),
]);
