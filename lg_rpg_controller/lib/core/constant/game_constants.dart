abstract final class GameMode {
  static const pvp = 'pvp';
  static const zombie = 'zombie';

  static const defaultMode = zombie;
  static const values = {pvp, zombie};
}

abstract final class GameModeLabel {
  static const pvp = 'PvP Mode';
  static const zombie = 'Zombie Mode';
}

abstract final class GameServerConfig {
  static const port = 3000;

  static String urlForHost(String host) {
    final trimmed = host.trim();
    if (trimmed.isEmpty) return '';
    return 'http://$trimmed:$port';
  }
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
  static const playerAttack = 'playerAttack';
  static const gameState = 'gameState';
  static const gameOver = 'gameOver';
  static const youDied = 'youDied';
  static const youRespawned = 'youRespawned';
  static const matchAnnouncement = 'matchAnnouncement';
}
