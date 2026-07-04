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

class ConnectAndJoinLobbyUseCase {
  final GameServerRepository repository;

  ConnectAndJoinLobbyUseCase(this.repository);

  Future<void> call({
    required String serverUrl,
    String name = 'Player',
  }) async {
    await repository.initToken();
    await repository.connectToServer(serverUrl);
    await repository.joinLobby(name: name);
  }
}

class DisconnectFromGameServerUseCase {
  final GameServerRepository repository;

  DisconnectFromGameServerUseCase(this.repository);
  Future<void> call() => repository.disconnectFromServer();
}

class JoinLobbyUseCase {
  final GameServerRepository repository;

  JoinLobbyUseCase(this.repository);
  Future<void> call({String name = 'Player'}) =>
      repository.joinLobby(name: name);
}

class LeaveLobbyUseCase {
  final GameServerRepository repository;
  LeaveLobbyUseCase(this.repository);
  Future<void> call() => repository.leaveLobby();
}

class StartGameUseCase {
  final GameServerRepository repository;
  StartGameUseCase(this.repository);
  Future<void> call() => repository.startGame();
}

class EndGameUseCase {
  final GameServerRepository repository;
  EndGameUseCase(this.repository);
  Future<void> call() => repository.endGame();
}

class MovePlayerUseCase {
  final GameServerRepository repository;
  MovePlayerUseCase(this.repository);
  Future<void> call(double dx, double dy) => repository.movePlayer(dx, dy);
}

class AttackPlayerUseCase {
  final GameServerRepository repository;
  AttackPlayerUseCase(this.repository);
  Future<void> call() => repository.attackPlayer();
}

class SelectGameModeUseCase {
  final GameServerRepository repository;
  SelectGameModeUseCase(this.repository);
  Future<void> call(String mode) => repository.selectGameMode(mode);
}

class SelectTeamUseCase {
  final GameServerRepository repository;
  SelectTeamUseCase(this.repository);
  Future<void> call(String team) => repository.selectTeam(team);
}
