
export const SOCKET_EVENTS = Object.freeze({
  JOIN_LOBBY: 'joinLobby',
  LEAVE_LOBBY: 'leaveLobby',
  UPDATE_LOBBY: 'updateLobby',
  LOBBY_ERROR: 'lobbyError',
  SELECT_GAME_MODE: 'selectGameMode',
  START_GAME: 'startGame',
  GAME_STARTED: 'gameStarted',
  END_GAME: 'endGame',
  MOVE: 'move',
  GAME_STATE: 'gameState',
});

// Per-screen view, in world pixels. fadeZone is the cross-screen fade width.
export const GAME_VIEW = Object.freeze({
  screenWidth: 1080,
  screenHeight: 1920,
  fadeZone: 20,
});
