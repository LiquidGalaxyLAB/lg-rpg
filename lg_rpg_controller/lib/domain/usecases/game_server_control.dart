import 'package:lg_rpg_controller/domain/repositories/game_server_repository.dart';

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

class MovePlayerUseCase {
  final GameServerRepository repository;
  MovePlayerUseCase(this.repository);
  Future<void> call(double dx, double dy) => repository.movePlayer(dx, dy);
}

class AttackPlayerUseCase {
  final GameServerRepository repository;
  AttackPlayerUseCase(this.repository);
  Future<void> call({String? kind}) => repository.attackPlayer(kind: kind);
}

class ActivatePowerupUseCase {
  final GameServerRepository repository;
  ActivatePowerupUseCase(this.repository);
  Future<void> call(String type) => repository.activatePowerup(type);
}

class SelectCharacterUseCase {
  final GameServerRepository repository;
  SelectCharacterUseCase(this.repository);
  Future<void> call(String character) => repository.selectCharacter(character);
}

class SetLoadoutUseCase {
  final GameServerRepository repository;
  SetLoadoutUseCase(this.repository);
  Future<void> call(List<String> items) => repository.setLoadout(items);
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
