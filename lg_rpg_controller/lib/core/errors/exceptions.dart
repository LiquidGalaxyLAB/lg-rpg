class ValidationException implements Exception {
  final String message;
  ValidationException(this.message);

  @override
  String toString() => message;
}

/// Thrown when the game server cannot be reached (server down, firewall blocking the port, or wrong/unreachable IP).
class GameServerException implements Exception {
  final String message;
  GameServerException(this.message);

  @override
  String toString() => message;
}
