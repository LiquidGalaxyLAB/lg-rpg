import "dart:async";
import "dart:convert";
import "dart:typed_data";
import "package:dartssh2/dartssh2.dart";
import "package:lg_rpg_controller/core/constant/log_service.dart";
import '../../domain/services/ssh_service_interface.dart';

class SshService implements ISshService {
  final log = LogService();
  SSHClient? _client;
  Timer? _healthCheckTimer;
  bool _isHealthy = false;

  int _connectionGeneration = 0;
  bool _healthCheckInProgress = false;

  /// Consecutive failed health pings; one slow ping (Wi-Fi power save, busy rig) is not a dead link — only a streak counts as a real loss.
  int _healthStrikes = 0;
  static const int _maxHealthStrikes = 3;

  static const _connectTimeout = Duration(seconds: 15);
  static const _authTimeout = Duration(seconds: 10);
  static const _commandOpenTimeout = Duration(seconds: 5);
  static const _commandDoneTimeout = Duration(seconds: 5);

  @override
  void Function()? onConnectionLost;

  // Credentials kept for reconnection (runtime only, never persisted).
  String? _ip;
  String? _password;
  String? _user;
  int? _port;

  bool get _hasCredentials =>
      _ip != null && _password != null && _user != null && _port != null;

  @override
  bool get isConnected =>
      _isHealthy && _client != null && !_client!.isClosed && _hasCredentials;

  @override
  String? get password => _password;

  @override
  String? get username => _user;

  @override
  Future<void> connect(
      String ip, String password, String user, int port) async {
    _connectionGeneration++;

    _ip = ip.trim();
    _password = password;
    _user = user.trim();
    _port = port;

    final generation = _connectionGeneration;
    try {
      await _establishConnection(generation);
    } catch (_) {
      if (generation != _connectionGeneration) rethrow;
      await _establishConnection(generation);
    }
    _startHealthCheck();
  }

  Future<void> _establishConnection(int generation) async {
    _closeClient();
    _isHealthy = false;

    try {
      final socket = await SSHSocket.connect(
        _ip!,
        _port!,
        timeout: _connectTimeout,
      );

      final client = SSHClient(
        socket,
        username: _user!,
        onPasswordRequest: () => _password!,
        keepAliveInterval: const Duration(seconds: 10),
      );

      _client = client;

      await client.authenticated.timeout(_authTimeout);

      final session =
          await client.execute('echo ok').timeout(_commandOpenTimeout);
      await session.done.timeout(_commandDoneTimeout);

      if (generation != _connectionGeneration || _client != client) {
        client.close();
        return;
      }

      _isHealthy = true;
      _healthStrikes = 0;
    } catch (e) {
      // Close, don't just drop: a timed-out handshake otherwise keeps its
      // socket open and can shadow the retry's fresh connection.
      _closeClient();
      _isHealthy = false;
      log.e('SSH Connect Error: $e');
      rethrow;
    }
  }

  void _startHealthCheck() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _checkHealth();
    });
  }

  void _stopHealthCheck() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = null;
  }

  Future<void> _checkHealth() async {
    if (_healthCheckInProgress) return;

    final generation = _connectionGeneration;
    final client = _client;

    if (client == null || !_hasCredentials) {
      _handleConnectionLost(generation, client);
      return;
    }

    _healthCheckInProgress = true;

    try {
      final session =
          await client.execute('echo "ping"').timeout(_commandOpenTimeout);
      await session.done.timeout(_commandDoneTimeout);

      if (generation == _connectionGeneration && _client == client) {
        _isHealthy = true;
        _healthStrikes = 0;
      }
    } catch (e) {
      if (generation != _connectionGeneration || _client != client) {
        return; // superseded by a newer connect/disconnect
      }
      _healthStrikes++;
      log.w('SSH health ping failed ($_healthStrikes/$_maxHealthStrikes): $e');
      if (_healthStrikes < _maxHealthStrikes) return;

      // After a full streak of silence, try one silent reconnect first (also revives sessions Android froze in the background) and only tell the UI if that fails too.
      _healthStrikes = 0;
      try {
        await _establishConnection(generation);
        log.i('SSH reconnected silently after failed health pings');
      } catch (_) {
        if (generation == _connectionGeneration) {
          _isHealthy = false;
          _closeClient();
          log.i('SSH Connection lost - notifying listeners');
          onConnectionLost?.call();
        }
      }
    } finally {
      _healthCheckInProgress = false;
    }
  }

  void _handleConnectionLost(int generation, SSHClient? failedClient) {
    if (generation != _connectionGeneration || _client != failedClient) {
      return;
    }

    if (_isHealthy) {
      _isHealthy = false;
      _closeClient();
      log.i('SSH Connection lost - notifying listeners');
      onConnectionLost?.call();
    }
  }

  @override
  Future<void> disconnect() async {
    _connectionGeneration++;
    _stopHealthCheck();
    _closeClient();
    _clearCredentials();
    _isHealthy = false;
  }

  void _closeClient() {
    try {
      _client?.close();
    } catch (_) {}
    _client = null;
  }

  void _clearCredentials() {
    _ip = null;
    _password = null;
    _user = null;
    _port = null;
  }

  /// Throws when never connected; otherwise revives a closed client in place.
  Future<void> _ensureClient() async {
    if (!_hasCredentials) {
      throw Exception('SSH not connected. Please connect first.');
    }
    if (_client == null || _client!.isClosed) {
      await _establishConnection(_connectionGeneration);
    }
  }

  @override
  Future<String?> execute(String cmd, {Duration? doneTimeout}) async {
    if (!_hasCredentials) {
      throw Exception('SSH not connected. Please connect first.');
    }
    final commandDoneTimeout = doneTimeout ?? _commandDoneTimeout;

    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        await _ensureClient();

        final SSHSession session;
        try {
          session = await _client!.execute(cmd).timeout(_commandOpenTimeout);
        } on TimeoutException {
          // Opening the channel is a handshake, not work: if the rig doesn't
          // ack it in time the socket is dead (silent Wi-Fi drop), not busy.
          // Unlike a slow command below, keeping the client here would make
          // the retry reuse the same dead socket and time out identically.
          log.w('SSH channel open timed out (attempt ${attempt + 1}): $cmd');
          _closeClient();
          _isHealthy = false;
          if (attempt == 1) {
            onConnectionLost?.call();
            rethrow;
          }
          continue;
        }

        final stdoutBuffer = StringBuffer();
        final stdoutSub = session.stdout.listen(
          (data) => stdoutBuffer.write(utf8.decode(data, allowMalformed: true)),
        );

        // Bounded like the connect and health-check paths: a command that never returns must not hang the caller and queue every later request behind it.
        await session.done.timeout(commandDoneTimeout);
        await stdoutSub
            .asFuture<void>()
            .timeout(const Duration(seconds: 2), onTimeout: () {});
        await stdoutSub.cancel();

        _isHealthy = true; // Command succeeded, connection is healthy
        _healthStrikes = 0;
        return stdoutBuffer.toString();
      } on TimeoutException {
        // A slow command is not a dead connection. Tearing down the shared
        // client here would also kill any concurrent SFTP upload or health
        // check, which is what made one heavy command stall everything else.
        log.w('SSH command timed out (attempt ${attempt + 1}): $cmd');
        if (attempt == 1) rethrow;
      } catch (e) {
        log.e('SSH Execute Error (attempt ${attempt + 1}): $e');
        _closeClient();
        _isHealthy = false;
        if (attempt == 1) {
          onConnectionLost?.call();
          rethrow;
        }
      }
    }
    return null;
  }

  /// Uploads text via SFTP; used for KML files under /var/www/html/.
  @override
  Future<void> uploadViaSftp(String content, String remotePath) =>
      uploadBytesViaSftp(Uint8List.fromList(content.codeUnits), remotePath);

  /// Uploads bytes via SFTP; used for KML and logo images under /var/www/html/.
  @override
  Future<void> uploadBytesViaSftp(Uint8List bytes, String remotePath) async {
    try {
      await _ensureClient();

      final sftp = await _client!.sftp();
      final file = await sftp.open(
        remotePath,
        mode: SftpFileOpenMode.create |
            SftpFileOpenMode.truncate |
            SftpFileOpenMode.write,
      );

      await file.write(Stream.fromIterable([bytes]));
      await file.close();

      _isHealthy = true;
      _healthStrikes = 0;
      log.i('SFTP Upload successful: $remotePath');
    } catch (e) {
      log.e('SFTP Upload Error: $e');
      _isHealthy = false;
      rethrow;
    }
  }

  @override
  void dispose() {
    _stopHealthCheck();
    _closeClient();
  }
}
