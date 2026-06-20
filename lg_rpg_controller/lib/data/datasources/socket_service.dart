import 'dart:async';
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import 'package:lg_rpg_controller/domain/services/socket_service_interface.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

class SocketService implements ISocketService {
  final log = LogService();
  io.Socket? _socket;

  // Stream to expose connection status updates
  final _connectionController = StreamController<bool>.broadcast();

  @override
  bool get isConnected => _socket?.connected ?? false;

  @override
  Stream<bool> get connectionStream => _connectionController.stream;

  @override
  Future<void> connect(String url) async {
    try {
      log.i('SocketService: Connecting to $url...');
      await disconnect(); // Reset any existing connection
      final completer = Completer<void>();

      _socket = io.io(
        url,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .enableForceNew()
            .build(),
      );

      _socket!.onConnect((_) {
        log.i('SocketService: Connected successfully');
        _connectionController.add(true);
        if (!completer.isCompleted) {
          completer.complete();
        }
      });

      _socket!.onDisconnect((reason) {
        log.w('SocketService: Disconnected (reason: $reason)');
        _connectionController.add(false);
      });

      _socket!.onConnectError((err) {
        log.e('SocketService: Connection error: $err');
        _connectionController.add(false);
        if (!completer.isCompleted) {
          completer.completeError(Exception('Socket connection error: $err'));
        }
      });

      _socket!.connect();
      await completer.future.timeout(const Duration(seconds: 10));
    } catch (e) {
      log.e('SocketService: Connect exception: $e');
      _connectionController.add(false);
      rethrow;
    }
  }

  @override
  Future<void> disconnect() async {
    if (_socket != null) {
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
      _connectionController.add(false);
      log.i('SocketService: Disconnected and resources disposed');
    }
  }

  @override
  void emit(String event, dynamic data) {
    if (_socket != null && _socket!.connected) {
      _socket!.emit(event, data);
    } else {
      log.w('SocketService: Cannot emit "$event", socket is not connected');
    }
  }

  @override
  void on(String event, Function(dynamic) callback) {
    _socket?.on(event, callback);
  }

  @override
  void off(String event) {
    _socket?.off(event);
  }
}
