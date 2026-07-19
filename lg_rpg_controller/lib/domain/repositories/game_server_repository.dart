import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_started_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_over_entity.dart';

abstract class GameServerRepository {
  Stream<GameServerEntity> get serverStatusStream;

  Stream<LobbyEntity?> get lobbyStream;

  Stream<GameStartedEntity> get gameStartedStream;

  Stream<GameOverEntity> get gameOverStream;

  Stream<void> get playerDiedStream;

  Stream<void> get playerRespawnedStream;

  Stream<String> get lobbyErrorStream;

  bool get isGameConnected;

  String get playerToken;

  LobbyEntity? get currentLobby;

  /// The character this player has chosen (its specials load free).
  String get selectedCharacter;

  /// The power-up/health item ids equipped into the loadout slots.
  List<String> get selectedLoadout;

  Future<void> initToken();

  Future<void> connectToServer(String serverUrl);

  Future<void> disconnectFromServer();

  Future<void> joinLobby({String name = 'Player'});

  Future<void> leaveLobby();

  Future<void> startGame();

  Future<void> movePlayer(double dx, double dy);

  /// Fires an attack; [kind] picks a special (validated server-side), else basic.
  Future<void> attackPlayer({String? kind});

  /// Activates an equipped loadout item (power-up buff or health potion) by id.
  Future<void> activatePowerup(String type);

  /// Picks the player's character (its specials load free).
  Future<void> selectCharacter(String character);

  /// Sets the equipped loadout item ids.
  Future<void> setLoadout(List<String> items);

  Future<void> selectGameMode(String mode);

  Future<void> selectTeam(String team);
}
