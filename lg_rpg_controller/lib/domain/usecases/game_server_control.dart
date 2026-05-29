import 'package:lg_rpg_controller/domain/repositories/game_server_repository.dart';

class InitGameServerTokenUseCase {
  final GameServerRepository repository;

  InitGameServerTokenUseCase(this.repository);
  Future<void> call() => repository.initToken();
}

class ConnectToGameServerUseCase {
  final GameServerRepository repository;

  ConnectToGameServerUseCase(this.repository);
  Future<void> call(String serverUrl) => repository.connectToServer(serverUrl);
}

class DisconnectFromGameServerUseCase {
  final GameServerRepository repository;

  DisconnectFromGameServerUseCase(this.repository);
  Future<void> call() => repository.disconnectFromServer();
}

class JoinLobbyUseCase {
  final GameServerRepository repository;

  JoinLobbyUseCase(this.repository);
  Future<void> call(String lobbyCode) => repository.joinLobby(lobbyCode);
}

class LeaveLobbyUseCase {
  final GameServerRepository repository;
  LeaveLobbyUseCase(this.repository);
  Future<void> call(String lobbyId) => repository.leaveLobby(lobbyId);
}

class ReallocateTeamUseCase {
  final GameServerRepository repository;
  ReallocateTeamUseCase(this.repository);
  Future<void> call(String playerId, String teamName) =>
      repository.reallocateTeam(playerId, teamName);
}

class StartGameUseCase {
  final GameServerRepository repository;
  StartGameUseCase(this.repository);
  Future<void> call(String lobbyId) => repository.startGame(lobbyId);
}

class EndGameUseCase {
  final GameServerRepository repository;
  EndGameUseCase(this.repository);
  Future<void> call(String lobbyId) => repository.endGame(lobbyId);
}
