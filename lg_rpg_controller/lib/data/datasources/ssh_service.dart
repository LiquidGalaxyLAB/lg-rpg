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

  static const _connectTimeout = Duration(seconds: 15);
  static const _authTimeout = Duration(seconds: 10);
  static const _commandOpenTimeout = Duration(seconds: 5);
  static const _commandDoneTimeout = Duration(seconds: 5);

  // Callback for when connection is lost
  @override
  void Function()? onConnectionLost;

  // Store credentials for reconnection (runtime only, not persistent)
  String? _ip;
  String? _password;
  String? _user;
  int? _port;

  bool get _hasCredentials =>
      _ip != null && _password != null && _user != null && _port != null;

  /// Returns true if the SSH client is connected and healthy.
  @override
  bool get isConnected =>
      _isHealthy && _client != null && !_client!.isClosed && _hasCredentials;

  /// Exposes the password for system commands (relaunch, reboot, etc.)
  @override
  String? get password => _password;

  /// Exposes the username for system commands
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
    await _establishConnection(generation);
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
    } catch (e) {
      _client = null;
      _isHealthy = false;
      log.e('SSH Connect Error: $e');
      rethrow;
    }
  }

  /// Start periodic health check every 5 seconds
  void _startHealthCheck() {
    _healthCheckTimer?.cancel();
    _healthCheckTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _checkHealth();
    });
  }

  /// Stop health check timer
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
      }
    } catch (e) {
      log.e('SSH Health Check Failed: $e');
      _handleConnectionLost(generation, client);
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

  @override
  Future<String?> execute(String cmd) async {
    if (!_hasCredentials) {
      throw Exception('SSH not connected. Please connect first.');
    }

    for (int attempt = 0; attempt < 2; attempt++) {
      try {
        if (_client == null || _client!.isClosed) {
          await _establishConnection(_connectionGeneration);
        }

        // Use execute() for proper command execution on LG
        final session = await _client!.execute(cmd);

        final stdoutBuffer = StringBuffer();
        final stdoutSub = session.stdout.listen(
          (data) => stdoutBuffer.write(utf8.decode(data, allowMalformed: true)),
        );

        await session.done; // Wait for command to complete
        await stdoutSub
            .asFuture<void>()
            .timeout(const Duration(seconds: 2), onTimeout: () {});
        await stdoutSub.cancel();

        _isHealthy = true; // Command succeeded, connection is healthy
        return stdoutBuffer.toString();
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

  /// Upload content to remote path via SFTP.
  /// Used for uploading KML files to /var/www/html/
  @override
  Future<void> uploadViaSftp(String content, String remotePath) async {
    if (!_hasCredentials) {
      throw Exception('SSH not connected. Please connect first.');
    }

    try {
      if (_client == null || _client!.isClosed) {
        await _establishConnection(_connectionGeneration);
      }

      final sftp = await _client!.sftp();

      // Open file for writing (create if not exists, truncate if exists)
      final file = await sftp.open(
        remotePath,
        mode: SftpFileOpenMode.create |
            SftpFileOpenMode.truncate |
            SftpFileOpenMode.write,
      );

      // Write content as bytes
      final bytes = Uint8List.fromList(content.codeUnits);
      await file.write(Stream.fromIterable([bytes]));
      await file.close();

      _isHealthy = true;
      log.i('SFTP Upload successful: $remotePath');
    } catch (e) {
      log.e('SFTP Upload Error: $e');
      _isHealthy = false;
      rethrow;
    }
  }

  /// Upload binary data (e.g., images) to remote path via SFTP.
  /// Used for uploading logo images to /var/www/html/
  @override
  Future<void> uploadBytesViaSftp(Uint8List bytes, String remotePath) async {
    if (!_hasCredentials) {
      throw Exception('SSH not connected. Please connect first.');
    }

    try {
      if (_client == null || _client!.isClosed) {
        await _establishConnection(_connectionGeneration);
      }

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
      log.i('SFTP Binary Upload successful: $remotePath');
    } catch (e) {
      log.e('SFTP Binary Upload Error: $e');
      _isHealthy = false;
      rethrow;
    }
  }

  /// Dispose method to clean up resources
  @override
  void dispose() {
    _stopHealthCheck();
    _closeClient();
  }
}
