import 'dart:async';
import 'dart:io';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import 'package:lg_rpg_controller/core/errors/exceptions.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_started_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_state_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_over_entity.dart';
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

  bool _wantsLobby = false;
  String _lobbyName = 'Player';

  final _serverStatusController =
      StreamController<GameServerEntity>.broadcast();
  final _lobbyController = StreamController<LobbyEntity?>.broadcast();
  final _gameStartedController =
      StreamController<GameStartedEntity>.broadcast();
  final _gameStateController = StreamController<GameStateEntity>.broadcast();
  final _gameOverController = StreamController<GameOverEntity>.broadcast();
  final _playerDiedController = StreamController<void>.broadcast();

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
        _registerSocketListeners();

        if (_wantsLobby) {
          log.i('Reconnected — re-joining lobby as "$_lobbyName"');
          _socketService.emit(SocketEvent.joinLobby, {
            'playerId': _playerToken,
            'name': _lobbyName,
          });
        }
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
    _socketService.on(SocketEvent.gameStarted, (data) {
      log.i('Game started from server: $data');

      final payload = data is Map ? data : const {};
      _gameStartedController.add(GameStartedEntity(
        selectedMode:
            payload['selectedMode']?.toString() ?? GameMode.defaultMode,
        startedBy: payload['startedBy']?.toString() ?? '',
      ));
    });
    _socketService.on(SocketEvent.gameState, (data) {
      if (data is! Map) return;
      final players = data['players'];
      if (players is! List) return;
      // Find THIS player's slice by matching our token to the broadcast id.
      Map? mine;
      for (final p in players) {
        if (p is Map && p['playerId']?.toString() == _playerToken) {
          mine = p;
          break;
        }
      }
      if (mine == null) return;
      final match = data['match'];
      _gameStateController.add(GameStateEntity(
        hp: (mine['hp'] as num?)?.round() ?? 0,
        maxHp: (mine['maxHp'] as num?)?.round() ?? 0,
        elapsedMs:
            match is Map ? ((match['elapsedMs'] as num?)?.round() ?? 0) : 0,
        durationMs:
            match is Map ? ((match['durationMs'] as num?)?.round() ?? 0) : 0,
      ));
    });
    _socketService.on(SocketEvent.gameOver, (data) {
      log.i('Game over from server: $data');
      final payload = data is Map ? data : const {};
      _gameOverController.add(GameOverEntity(
        outcome: payload['outcome']?.toString() ?? 'loss',
        survivedMs: (payload['survivedMs'] as num?)?.round() ?? 0,
      ));
    });
    _socketService.on(SocketEvent.youDied, (data) {
      log.i('This player died: $data');
      _playerDiedController.add(null);
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
    _socketService.off(SocketEvent.gameStarted);
    _socketService.off(SocketEvent.gameState);
    _socketService.off(SocketEvent.gameOver);
    _socketService.off(SocketEvent.youDied);
  }

  @override
  Stream<GameServerEntity> get serverStatusStream =>
      _serverStatusController.stream;

  @override
  Stream<LobbyEntity?> get lobbyStream => _lobbyController.stream;

  @override
  Stream<GameStartedEntity> get gameStartedStream =>
      _gameStartedController.stream;

  @override
  Stream<GameStateEntity> get gameStateStream => _gameStateController.stream;

  @override
  Stream<GameOverEntity> get gameOverStream => _gameOverController.stream;

  @override
  Stream<void> get playerDiedStream => _playerDiedController.stream;

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

      await _preflightHealthCheck(_serverUrl);
      await _socketService.connect(_serverUrl);
    } catch (e) {
      log.e('Failed in connectToServer: $e');
      rethrow;
    }
  }

  /// Pings the server's `/api/health` endpoint to confirm reachability.
  Future<void> _preflightHealthCheck(String serverUrl) async {
    const timeout = Duration(seconds: 5);
    final uri = Uri.parse('$serverUrl/api/health');
    final client = HttpClient()..connectionTimeout = timeout;

    try {
      final request = await client.getUrl(uri).timeout(timeout);
      final response = await request.close().timeout(timeout);
      await response.drain<void>();

      if (response.statusCode != 200) {
        throw GameServerException(
          'Server responded with HTTP ${response.statusCode} at $uri. '
          'Make sure the LG RPG server is running.',
        );
      }
      log.i('Health check OK: $uri');
    } on TimeoutException {
      throw GameServerException(
        'Server at $serverUrl did not respond. The server may be down, or '
        'port ${GameServerConfig.port} is blocked on the Liquid Galaxy '
        '(check the firewall and network routing).',
      );
    } on SocketException catch (e) {
      throw GameServerException(
        'Cannot reach $serverUrl (${e.message}). Check that the LG IP is '
        'correct, the server is started, and port ${GameServerConfig.port} '
        'is open on the Liquid Galaxy.',
      );
    } finally {
      client.close(force: true);
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
      _wantsLobby = true;
      _lobbyName = name;
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
      _wantsLobby = false;
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
  Future<void> attackPlayer() async {
    try {
      if (_playerToken.isEmpty) {
        await initToken();
      }
      // Server cooldown-gates this; spamming the button is harmless.
      _socketService.emit(SocketEvent.playerAttack, {
        'playerId': _playerToken,
      });
    } catch (e) {
      log.e('Failed to emit attack: $e');
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
