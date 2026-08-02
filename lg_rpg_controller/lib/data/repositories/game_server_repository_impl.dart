import 'dart:async';
import 'dart:io';
import 'package:lg_rpg_controller/core/constant/game_constants.dart';
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import 'package:lg_rpg_controller/core/errors/exceptions.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';
import 'package:lg_rpg_controller/domain/entities/game_server_entity.dart';
import 'package:lg_rpg_controller/domain/entities/game_started_entity.dart';
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

  String? _myTeam;

  // Chosen character + equipped loadout item ids; persisted and re-sent on (re)connect.
  String _character = CharacterCatalog.defaultCharacter;
  List<String> _loadout = <String>[];

  final _serverStatusController =
      StreamController<GameServerEntity>.broadcast();
  final _lobbyController = StreamController<LobbyEntity?>.broadcast();
  final _gameStartedController =
      StreamController<GameStartedEntity>.broadcast();
  final _gameOverController = StreamController<GameOverEntity>.broadcast();
  final _playerDiedController = StreamController<void>.broadcast();
  final _playerRespawnedController = StreamController<void>.broadcast();
  final _lobbyErrorController = StreamController<String>.broadcast();

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
          _emitLoadoutState();
        }
      } else {
        _unregisterSocketListeners();
        _currentLobby = null;
        _lobbyController.add(null);
      }
    });
  }

  void _registerSocketListeners() {
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

      // Lobby updates go to every socket (even after leaving or a rejected join), so the only reliable membership check is whether the snapshot lists our own token.
      final containsMe = playersList.any((player) => player.id == _playerToken);
      if (!containsMe) {
        if (_currentLobby != null) {
          _currentLobby = null;
          _lobbyController.add(null);
        }
        return;
      }

      final hostId = data['hostId']?.toString();
      _currentLobby = LobbyEntity(
        players: playersList,
        hostId: hostId?.isNotEmpty == true
            ? hostId!
            : (playersList.isNotEmpty ? playersList.first.id : ''),
        selectedMode: data['selectedMode']?.toString() ??
            data['mode']?.toString() ??
            GameMode.defaultMode,
        pvpTeams: {
          for (final player in playersList)
            if (player.team != null) player.id: player.team!,
        },
      );
      _lobbyController.add(_currentLobby);
      log.i(
        'Connected players: ${playersList.map((player) => player.name).join(', ')}',
      );
    });
    _socketService.on(SocketEvent.lobbyError, (data) {
      final message = (data is Map ? data['message'] : data)?.toString() ?? '';
      log.e('Lobby error from server: $message');
      if (message.isNotEmpty) _lobbyErrorController.add(message);
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
      // Tracked so GAME_OVER can tell a winning team apart from a losing one.
      _myTeam = mine['team']?.toString();
    });
    _socketService.on(SocketEvent.gameOver, (data) {
      log.i('Game over from server: $data');
      final payload = data is Map ? data : const {};
      // PvP reports a winning team (null on a tie); co-op sends an explicit per-player outcome.
      String outcome;
      if (payload.containsKey('winner')) {
        final winner = payload['winner']?.toString();
        outcome = winner == null
            ? 'draw'
            : winner == _myTeam
                ? 'win'
                : 'loss';
      } else {
        outcome = payload['outcome']?.toString() ?? 'loss';
      }
      _gameOverController.add(GameOverEntity(
        outcome: outcome,
        survivedMs: (payload['survivedMs'] as num?)?.round() ?? 0,
        reason: payload['reason']?.toString(),
      ));
    });
    _socketService.on(SocketEvent.youDied, (data) {
      log.i('This player died: $data');
      _playerDiedController.add(null);
    });
    _socketService.on(SocketEvent.youRespawned, (data) {
      log.i('This player respawned: $data');
      _playerRespawnedController.add(null);
    });
  }

  PlayerEntity _mapSocketPlayer(Map<dynamic, dynamic> player) {
    final team = player['team']?.toString();
    return PlayerEntity(
      id: player['playerId']?.toString() ?? '',
      name: player['name']?.toString() ?? '',
      isReady: player['isReady'] == true,
      team: PvpTeam.values.contains(team) ? team : null,
    );
  }

  void _unregisterSocketListeners() {
    _socketService.off(SocketEvent.updateLobby);
    _socketService.off(SocketEvent.lobbyError);
    _socketService.off(SocketEvent.gameStarted);
    _socketService.off(SocketEvent.gameState);
    _socketService.off(SocketEvent.gameOver);
    _socketService.off(SocketEvent.youDied);
    _socketService.off(SocketEvent.youRespawned);
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
  Stream<GameOverEntity> get gameOverStream => _gameOverController.stream;

  @override
  Stream<void> get playerDiedStream => _playerDiedController.stream;

  @override
  Stream<void> get playerRespawnedStream => _playerRespawnedController.stream;

  @override
  Stream<String> get lobbyErrorStream => _lobbyErrorController.stream;

  @override
  bool get isGameConnected => _isConnected;

  @override
  String get playerToken => _playerToken;

  @override
  LobbyEntity? get currentLobby => _currentLobby;

  @override
  String get selectedCharacter => _character;

  @override
  List<String> get selectedLoadout => List.unmodifiable(_loadout);

  // Re-sends the player's character + loadout so a fresh (or reconnected) socket has them before a match starts.
  void _emitLoadoutState() {
    _socketService.emit(SocketEvent.selectCharacter, {
      'playerId': _playerToken,
      'character': _character,
    });
    _socketService.emit(SocketEvent.setLoadout, {
      'playerId': _playerToken,
      'items': _loadout,
    });
  }

  /// Loads the token (and saved character/loadout) if not already loaded.
  Future<void> _ensureToken() async {
    if (_playerToken.isEmpty) await initToken();
  }

  @override
  Future<void> initToken() async {
    try {
      String? token = await _localStorage.getPlayerToken();

      if (token == null || token.isEmpty) {
        token = const Uuid().v4();
        await _localStorage.savePlayerToken(token);
        log.i('No token found. Generated new persistent player token: $token');
      } else {
        log.i('Player token successfully loaded: $token');
      }

      _playerToken = token;

      // Restore the saved character + loadout so they survive an app restart.
      final savedCharacter = await _localStorage.getPlayerCharacter();
      if (savedCharacter != null && savedCharacter.isNotEmpty) {
        _character = savedCharacter;
      }
      _loadout = await _localStorage.getPlayerLoadout();
    } catch (e) {
      log.e('Failed to initialize player token: $e');
    }
  }

  @override
  Future<void> connectToServer(String serverUrl) async {
    try {
      _serverUrl = serverUrl;
      // Health-check first so we surface a clear "server unreachable" error instead of a socket timeout.
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
      await _ensureToken();

      await _localStorage.savePlayerName(name);
      _wantsLobby = true;
      _lobbyName = name;
      _socketService.emit(SocketEvent.joinLobby, {
        'playerId': _playerToken,
        'name': name,
      });
      _emitLoadoutState();
    } catch (e) {
      // Surface the failure so the "Connect to Server" button can report it instead of silently appearing to have connected.
      log.e('Failed to join lobby: $e');
      rethrow;
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
      _currentLobby = null;
      _lobbyController.add(null);
    } catch (e) {
      log.e('Failed to leave lobby: $e');
    }
  }

  @override
  Future<void> startGame() async {
    log.i('Starting game...');
    // The emit is fire-and-forget — a server-side refusal comes back asynchronously on lobbyError; the only failure we can catch locally is a dead socket, so surface that.
    if (!_isConnected) {
      throw GameServerException('Not connected to the game server.');
    }
    _socketService.emit(SocketEvent.startGame, {});
  }

  @override
  Future<void> movePlayer(double dx, double dy) async {
    try {
      await _ensureToken();
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
  Future<void> attackPlayer({String? kind}) async {
    try {
      await _ensureToken();
      // Server cooldown-gates this; spamming the button is harmless.
      final payload = <String, dynamic>{'playerId': _playerToken};
      if (kind != null) payload['kind'] = kind;
      _socketService.emit(SocketEvent.playerAttack, payload);
    } catch (e) {
      log.e('Failed to emit attack: $e');
    }
  }

  @override
  Future<void> activatePowerup(String type) async {
    try {
      _socketService.emit(SocketEvent.activatePowerup, {
        'playerId': _playerToken,
        'type': type,
      });
    } catch (e) {
      log.e('Failed to activate powerup: $e');
    }
  }

  @override
  Future<void> selectCharacter(String character) async {
    try {
      _character = character;
      await _localStorage.savePlayerCharacter(character);
      _socketService.emit(SocketEvent.selectCharacter, {
        'playerId': _playerToken,
        'character': character,
      });
    } catch (e) {
      log.e('Failed to select character: $e');
    }
  }

  @override
  Future<void> setLoadout(List<String> items) async {
    try {
      _loadout = List<String>.from(items);
      await _localStorage.savePlayerLoadout(_loadout);
      _socketService.emit(SocketEvent.setLoadout, {
        'playerId': _playerToken,
        'items': _loadout,
      });
    } catch (e) {
      log.e('Failed to set loadout: $e');
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

  @override
  Future<void> selectTeam(String team) async {
    try {
      log.i('Selecting team: $team...');
      _socketService.emit(SocketEvent.selectTeam, {
        'playerId': _playerToken,
        'team': team,
      });
    } catch (e) {
      log.e('Failed to select team: $e');
    }
  }
}
