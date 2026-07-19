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
  static const _keyCharacter = 'player_character';
  static const _keyLoadout = 'player_loadout';
  static const _keyThemeMode = 'theme_mode';

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

  /// Saved on its own key so a screen count chosen before the first successful connect (no full profile yet) still survives a restart.
  Future<void> saveScreenNumber(int screens) async {
    await _storage.write(key: _keyScreens, value: screens.toString());
  }

  Future<int?> getScreenNumber() async {
    final raw = await _storage.read(key: _keyScreens);
    return raw == null ? null : int.tryParse(raw);
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

  Future<void> savePlayerCharacter(String character) async {
    await _storage.write(key: _keyCharacter, value: character);
  }

  Future<String?> getPlayerCharacter() async {
    return await _storage.read(key: _keyCharacter);
  }

  // Stored as the ThemeMode enum name: 'system' | 'light' | 'dark'.
  Future<void> saveThemeMode(String mode) async {
    await _storage.write(key: _keyThemeMode, value: mode);
  }

  Future<String?> getThemeMode() async {
    return await _storage.read(key: _keyThemeMode);
  }

  // Loadout item ids are stored as a comma-separated string.
  Future<void> savePlayerLoadout(List<String> items) async {
    await _storage.write(key: _keyLoadout, value: items.join(','));
  }

  Future<List<String>> getPlayerLoadout() async {
    final raw = await _storage.read(key: _keyLoadout);
    if (raw == null || raw.isEmpty) return <String>[];
    return raw.split(',').where((s) => s.isNotEmpty).toList();
  }
}
