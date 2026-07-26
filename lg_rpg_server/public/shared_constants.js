
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

// Per-screen view in world pixels; 360x640 upscales exactly 3x to a 1080x1920 screen. fadeZone is the cross-screen fade width.
export const GAME_VIEW = Object.freeze({
  screenWidth: 360,
  screenHeight: 640,
  fadeZone: 7,
});

// Maps are drawn on a 16px grid, so a screen spans 22.5 tiles and screen boundaries fall mid-tile.
export const MAP_TILE_SIZE = 16;

// Tile columns a map needs to cover every screen; the rounded-up spare columns stay offscreen.
export const mapTilesForScreens = (screens) => Math.ceil((GAME_VIEW.screenWidth * screens) / MAP_TILE_SIZE);

// Loadout system, shared by controller and server: pick a character, fill LOADOUT_SLOTS with items.
export const LOADOUT_SLOTS = 4;

// How long before a buff ends that the client blinks it as "about to expire".
export const POWERUP_BLINK_MS = 2000;

// Infinite use, cooldown-gated. durationMs = buff length, cooldownMs = wait to re-use.
export const POWERUP_CATALOG = Object.freeze([
  // 1.8× still outruns every enemy without being a teleport; 2.9× crossed a screen in 1.6s.
  Object.freeze({ id: 'speed', label: 'Speed', icon: '⚡',
    desc: '1.8× move speed for 10s — kite and reposition fast.',
    durationMs: 10000, cooldownMs: 25000, multiplier: 1.8 }),
  // Deliberately not chainable into permanent immunity: one short window, and reflect is a damage-share.
  Object.freeze({ id: 'shield', label: 'Shield', icon: '🛡',
    desc: 'Immune to all enemy damage for 8s.',
    durationMs: 8000, cooldownMs: 45000 }),
  Object.freeze({ id: 'reflect', label: 'Reflect', icon: '↩',
    desc: 'Take half damage and bounce it back doubled for 10s.',
    durationMs: 10000, cooldownMs: 40000, multiplier: 2, reduction: 0.5 }),
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
    blurb: 'Melee bruiser. Swings hit everything up close; specials cover burst, reach and sustain.',
    basic: Object.freeze({ id: 'melee', label: 'Swing', icon: '🗡' }),
    // Heavier swing than the shared default (15/45).
    melee: Object.freeze({ damage: 20, range: 55 }),
    // Each special covers something the 360° swing can't do; numbers mirror PLAYER_SPECIALS in game_constants.js.
    specials: Object.freeze([
      Object.freeze({ id: 'tide', label: 'Tide Slam', icon: '🌊', cooldownMs: 4000, desc: 'Three slams in place — 90 damage to everything in reach.' }),
      Object.freeze({ id: 'riptide', label: 'Riptide', icon: '💧', cooldownMs: 4000, desc: 'Dash forward, cutting through everything you pass.' }),
      Object.freeze({ id: 'frost', label: 'Frost Nova', icon: '❄', cooldownMs: 5000, desc: 'Three novas at double reach — halves enemy speed for 3s.' }),
      Object.freeze({ id: 'blessing', label: 'Blessing', icon: '✨', cooldownMs: 6000, desc: 'Heal 30, and nearby enemies hit everyone for half for 6s.' }),
    ]),
  }),
]);
