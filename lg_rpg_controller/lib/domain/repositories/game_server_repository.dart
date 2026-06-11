import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_started_entity.dart';

abstract class GameServerRepository {
  Stream<GameServerEntity> get serverStatusStream;

  Stream<LobbyEntity?> get lobbyStream;

  Stream<GameStartedEntity> get gameStartedStream;

  bool get isGameConnected;

  String get playerToken;

  LobbyEntity? get currentLobby;

  Future<void> initToken();

  Future<void> connectToServer(String serverUrl);

  Future<void> disconnectFromServer();

  Future<void> joinLobby({String name = 'Player'});

  Future<void> leaveLobby();

  Future<void> startGame();

  Future<void> endGame();

  Future<void> movePlayer(double dx, double dy);

  Future<void> selectGameMode(String mode);
}
