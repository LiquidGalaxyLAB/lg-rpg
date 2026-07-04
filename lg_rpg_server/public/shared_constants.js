
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
