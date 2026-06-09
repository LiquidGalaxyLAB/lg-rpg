import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:lg_rpg_controller/core/constant/log_service.dart';
import '../../domain/entities/connection_entity.dart';

class LocalStorageDataSource {
  final log = LogService();
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  static const _keyIp = 'lg_ip';
  static const _keyUsername = 'lg_username';
  static const _keyPassword = 'lg_password';
  static const _keyPort = 'lg_port';
  static const _keyScreens = 'lg_screens';
  static const _keyPlayerToken = 'player_token';
  static const _keyPlayerName = 'player_name';

  Future<void> saveSettings(ConnectionEntity connection) async {
    await _storage.write(key: _keyIp, value: connection.ip);
    await _storage.write(key: _keyUsername, value: connection.username);
    await _storage.write(key: _keyPassword, value: connection.password);
    await _storage.write(key: _keyPort, value: connection.port.toString());
    await _storage.write(
        key: _keyScreens, value: connection.screenNumber.toString());
  }

  Future<ConnectionEntity?> loadSettings() async {
    final ip = await _storage.read(key: _keyIp);
    final username = await _storage.read(key: _keyUsername);
    final password = await _storage.read(key: _keyPassword);
    final portStr = await _storage.read(key: _keyPort);
    final screensStr = await _storage.read(key: _keyScreens);

    if (ip != null && username != null && portStr != null) {
      return ConnectionEntity(
        ip: ip,
        username: username,
        password: password ?? '',
        port: int.parse(portStr),
        screenNumber: screensStr != null ? int.parse(screensStr) : 3,
      );
    }
    return null;
  }

  Future<void> clearSettings() async {
    await _storage.delete(key: _keyIp);
    await _storage.delete(key: _keyUsername);
    await _storage.delete(key: _keyPassword);
    await _storage.delete(key: _keyPort);
    await _storage.delete(key: _keyScreens);
  }

  Future<void> savePlayerToken(String token) async {
    await _storage.write(key: _keyPlayerToken, value: token);
  }

  Future<String?> getPlayerToken() async {
    return await _storage.read(key: _keyPlayerToken);
  }

  Future<void> savePlayerName(String name) async {
    await _storage.write(key: _keyPlayerName, value: name);
  }

  Future<String?> getPlayerName() async {
    return await _storage.read(key: _keyPlayerName);
  }
}
