abstract final class GameMode {
  static const pvp = 'pvp';
  static const zombie = 'zombie';

  static const defaultMode = pvp;
  static const values = {pvp, zombie};
}

abstract final class GameModeLabel {
  static const pvp = 'PvP Mode';
  static const zombie = 'Zombie Mode';
}

abstract final class GameServerConfig {
  static const url = String.fromEnvironment(
    'GAME_SERVER_URL',
    defaultValue: 'http://10.129.32.94:3000',
  );
}

abstract final class SocketEvent {
  static const joinLobby = 'joinLobby';
  static const leaveLobby = 'leaveLobby';
  static const updateLobby = 'updateLobby';
  static const lobbyError = 'lobbyError';
  static const selectGameMode = 'selectGameMode';
  static const startGame = 'startGame';
  static const gameStarted = 'gameStarted';
  static const endGame = 'endGame';
  static const move = 'move';
  static const gameState = 'gameState';
}
