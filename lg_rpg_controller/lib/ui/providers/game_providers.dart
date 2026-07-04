import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/domain/entities/game_started_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_state_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_over_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/usecases/game_server_control.dart';
export '../../core/di/injection_container.dart'
    show gameServerRepositoryProvider;

final initGameServerTokenUseCaseProvider =
    Provider<InitGameServerTokenUseCase>((ref) {
  return InitGameServerTokenUseCase(ref.watch(gameServerRepositoryProvider));
});

final connectToGameServerUseCaseProvider =
    Provider<ConnectToGameServerUseCase>((ref) {
  return ConnectToGameServerUseCase(ref.watch(gameServerRepositoryProvider));
});

final connectAndJoinLobbyUseCaseProvider =
    Provider<ConnectAndJoinLobbyUseCase>((ref) {
  return ConnectAndJoinLobbyUseCase(ref.watch(gameServerRepositoryProvider));
});

final disconnectFromGameServerUseCaseProvider =
    Provider<DisconnectFromGameServerUseCase>((ref) {
  return DisconnectFromGameServerUseCase(
      ref.watch(gameServerRepositoryProvider));
});
final joinLobbyUseCaseProvider = Provider<JoinLobbyUseCase>((ref) {
  return JoinLobbyUseCase(ref.watch(gameServerRepositoryProvider));
});
final leaveLobbyUseCaseProvider = Provider<LeaveLobbyUseCase>((ref) {
  return LeaveLobbyUseCase(ref.watch(gameServerRepositoryProvider));
});
final startGameUseCaseProvider = Provider<StartGameUseCase>((ref) {
  return StartGameUseCase(ref.watch(gameServerRepositoryProvider));
});
final endGameUseCaseProvider = Provider<EndGameUseCase>((ref) {
  return EndGameUseCase(ref.watch(gameServerRepositoryProvider));
});
final movePlayerUseCaseProvider = Provider<MovePlayerUseCase>((ref) {
  return MovePlayerUseCase(ref.watch(gameServerRepositoryProvider));
});

final attackPlayerUseCaseProvider = Provider<AttackPlayerUseCase>((ref) {
  return AttackPlayerUseCase(ref.watch(gameServerRepositoryProvider));
});

final selectGameModeUseCaseProvider = Provider<SelectGameModeUseCase>((ref) {
  return SelectGameModeUseCase(ref.watch(gameServerRepositoryProvider));
});

final selectTeamUseCaseProvider = Provider<SelectTeamUseCase>((ref) {
  return SelectTeamUseCase(ref.watch(gameServerRepositoryProvider));
});

final lobbyStreamProvider = StreamProvider<LobbyEntity?>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.lobbyStream;
});

/// Live game-server socket status; tells "not connected" apart from "connected but lobby still loading".
final gameServerStatusProvider = StreamProvider<GameServerEntity>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.serverStatusStream;
});

final gameStartedStreamProvider = StreamProvider<GameStartedEntity>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.gameStartedStream;
});

final gameStateStreamProvider = StreamProvider<GameStateEntity>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.gameStateStream;
});

final gameOverStreamProvider = StreamProvider<GameOverEntity>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.gameOverStream;
});

final lastGameResultProvider = StateProvider<GameOverEntity?>((ref) => null);

/// Mode of the current (or just-ended) match, set from GAME_STARTED; lets UI tell PvP respawn apart from Zombie permadeath.
final currentMatchModeProvider = StateProvider<String?>((ref) => null);

final playerDiedStreamProvider = StreamProvider<void>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.playerDiedStream;
});

final playerRespawnedStreamProvider = StreamProvider<void>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.playerRespawnedStream;
});

final lobbyErrorStreamProvider = StreamProvider<String>((ref) {
  final repository = ref.watch(gameServerRepositoryProvider);
  return repository.lobbyErrorStream;
});
