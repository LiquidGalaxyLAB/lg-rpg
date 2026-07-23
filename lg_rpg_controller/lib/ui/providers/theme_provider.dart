import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/data/datasources/local_storage_source.dart';

/// The saved light/dark preference. Defaults to dark.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final LocalStorageDataSource _storage;

  ThemeModeNotifier(this._storage) : super(ThemeMode.dark) {
    _restore();
  }

  Future<void> _restore() async {
    final saved = await _storage.getThemeMode();
    if (saved == null) return;
    state = ThemeMode.values.firstWhere(
      (m) => m.name == saved,
      orElse: () => ThemeMode.dark,
    );
  }

  Future<void> set(ThemeMode mode) async {
    if (mode == state) return;
    state = mode;
    await _storage.saveThemeMode(mode.name);
  }
}

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.watch(localStorageProvider));
});
