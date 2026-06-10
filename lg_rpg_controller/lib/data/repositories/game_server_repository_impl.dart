import 'dart:async';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/lobby_entity.dart';
import 'package:lg_rpg_controller/domain/entities/player_entity.dart';
import 'package:lg_rpg_controller/domain/repositories/game_server_repository.dart';
import 'package:lg_rpg_controller/domain/services/socket_service_interface.dart';
import 'package:uuid/uuid.dart';

class GameServerRepositoryImpl extends GameServerRepository {
  final log = LogService();
  final LocalStorageDataSource _localStorage;
  final ISocketService _socketService;

  String _playerToken = '';
  LobbyEntity? _currentLobby;
  bool _isConnected = false;
  String _serverUrl = '';

  final _serverStatusController =
      StreamController<GameServerEntity>.broadcast();
  final _lobbyController = StreamController<LobbyEntity?>.broadcast();

  GameServerRepositoryImpl(this._localStorage, this._socketService) {
    _setupConnectionListener();
  }

  void _setupConnectionListener() {
    _socketService.connectionStream.listen((isConnected) {
      _isConnected = isConnected;
      _serverStatusController.add(GameServerEntity(
        isConnected: isConnected,
        serverUrl: isConnected ? _serverUrl : '',
        statusMessage: isConnected ? "Connected" : "Disconnected",
        playerToken: _playerToken,
      ));
      if (isConnected) {
        // Register socket event listeners once connection is active
        _registerSocketListeners();
      } else {
        // Clear listeners and state on disconnect
        _unregisterSocketListeners();
        _currentLobby = null;
        _lobbyController.add(null);
      }
    });
  }

  void _registerSocketListeners() {
    // Listen to lobby updates
    _socketService.on(SocketEvent.updateLobby, (data) {
      log.d('Received updateLobby: $data');

      if (data is! Map) {
        log.e('Invalid updateLobby payload: $data');
        return;
      }

      final rawPlayers = data['players'];
      final playersList = rawPlayers is List
          ? rawPlayers
              .whereType<Map>()
              .map(_mapSocketPlayer)
              .where((player) => player.id.isNotEmpty)
              .toList()
          : <PlayerEntity>[];
      final hostId = data['hostId']?.toString();
      _currentLobby = LobbyEntity(
        players: playersList,
        hostId: hostId?.isNotEmpty == true
            ? hostId!
            : (playersList.isNotEmpty ? playersList.first.id : ''),
        selectedMode: data['selectedMode']?.toString() ??
            data['mode']?.toString() ??
            GameMode.defaultMode,
        pvpTeams: const {},
      );
      _lobbyController.add(_currentLobby);
      log.i(
        'Connected players: ${playersList.map((player) => player.name).join(', ')}',
      );
    });
    _socketService.on(SocketEvent.lobbyError, (data) {
      log.e('Lobby error from server: ${data['message']}');
    });
  }

  PlayerEntity _mapSocketPlayer(Map<dynamic, dynamic> player) {
    return PlayerEntity(
      id: player['playerId']?.toString() ?? '',
      name: player['name']?.toString() ?? '',
      isReady: player['isReady'] == true,
    );
  }

  void _unregisterSocketListeners() {
    _socketService.off(SocketEvent.updateLobby);
    _socketService.off(SocketEvent.lobbyError);
  }

  @override
  Stream<GameServerEntity> get serverStatusStream =>
      _serverStatusController.stream;

  @override
  Stream<LobbyEntity?> get lobbyStream => _lobbyController.stream;

  @override
  bool get isGameConnected => _isConnected;

  @override
  String get playerToken => _playerToken;

  @override
  LobbyEntity? get currentLobby => _currentLobby;

  @override
  Future<void> initToken() async {
    try {
      log.d('Checking local storage for existing player token...');

      String? token = await _localStorage.getPlayerToken();

      if (token == null || token.isEmpty) {
        token = const Uuid().v4();
        await _localStorage.savePlayerToken(token);
        log.i('No token found. Generated new persistent player token: $token');
      } else {
        log.i('Player token successfully loaded: $token');
      }

      _playerToken = token;
    } catch (e) {
      log.e('Failed to initialize player token: $e');
    }
  }

  @override
  Future<void> connectToServer(String serverUrl) async {
    try {
      _serverUrl = serverUrl;
      await _socketService.connect(_serverUrl);
    } catch (e) {
      log.e('Failed in connectToServer: $e');
      rethrow;
    }
  }

  @override
  Future<void> disconnectFromServer() async {
    try {
      await _socketService.disconnect();
    } catch (e) {
      log.e('Failed in disconnectFromServer: $e');
    }
  }

  @override
  Future<void> joinLobby({String name = 'Player'}) async {
    try {
      log.i('Joining lobby ...');
      if (_playerToken.isEmpty) {
        await initToken();
      }

      await _localStorage.savePlayerName(name);
      _socketService.emit(SocketEvent.joinLobby, {
        'playerId': _playerToken,
        'name': name,
      });
    } catch (e) {
      log.e('Failed to join lobby: $e');
    }
  }

  @override
  Future<void> leaveLobby() async {
    try {
      log.i('Leaving lobby...');
      _socketService.emit(SocketEvent.leaveLobby, {
        'playerId': _playerToken,
      });
      // Locally reset lobby state
      _currentLobby = null;
      _lobbyController.add(null);
    } catch (e) {
      log.e('Failed to leave lobby: $e');
    }
  }

  @override
  Future<void> startGame() async {
    try {
      log.i('Starting game...');
      _socketService.emit(SocketEvent.startGame, {});
    } catch (e) {
      log.e('Failed to start game: $e');
    }
  }

  @override
  Future<void> endGame() async {
    try {
      log.i('Ending game...');
      _socketService.emit(SocketEvent.endGame, {});
    } catch (e) {
      log.e('Failed to end game: $e');
    }
  }

  @override
  Future<void> movePlayer(double dx, double dy) async {
    try {
      if (_playerToken.isEmpty) {
        await initToken();
      }
      _socketService.emit(SocketEvent.move, {
        'playerId': _playerToken,
        'dx': dx,
        'dy': dy,
      });
    } catch (e) {
      log.e('Failed to emit movement: $e');
    }
  }

  @override
  Future<void> selectGameMode(String mode) async {
    try {
      log.i('Selecting game mode: $mode...');
      _socketService.emit(SocketEvent.selectGameMode, {
        'playerId': _playerToken,
        'mode': mode,
      });
    } catch (e) {
      log.e('Failed to select game mode: $e');
    }
  }
}
