import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';

abstract class GameServerRepository {
  Stream<GameServerEntity> get serverStatusStream;

  Stream<LobbyEntity?> get lobbyStream;

  bool get isGameConnected;

  String get playerToken;

  LobbyEntity? get currentLobby;

  Future<void> initToken();

  Future<void> connectToServer(String serverUrl);

  Future<void> disconnectFromServer();

  Future<void> joinLobby(String lobbyCode);

  Future<void> leaveLobby(String lobbyId);

  Future<void> reallocateTeam(String playerId, String teamName);

  Future<void> startGame(String lobbyId);

  Future<void> endGame(String lobbyId);
}
