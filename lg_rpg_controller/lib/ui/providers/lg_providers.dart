import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/domain/usecases/connect_to_lg.dart';
import 'package:lg_rpg_controller/domain/usecases/system_control.dart';

export '../../core/di/injection_container.dart' show lgRepositoryProvider;

final connectToLgUseCaseProvider = Provider<ConnectToLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return ConnectToLgUseCase(repository);
});

final flyToLocationProvider = Provider<FlyToLocationUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return FlyToLocationUseCase(repository);
});

final disconnectFromLgUseCaseProvider =
    Provider<DisconnectFromLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return DisconnectFromLgUseCase(repository);
});

final rebootLgUseCaseProvider = Provider<RebootLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return RebootLgUseCase(repository);
});

final relaunchLgUseCaseProvider = Provider<RelaunchLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return RelaunchLgUseCase(repository);
});

final shutdownLgUseCaseProvider = Provider<ShutdownLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return ShutdownLgUseCase(repository);
});

final cleanKmlUseCaseProvider = Provider<CleanAllKmlUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return CleanAllKmlUseCase(repository);
});

final cleanLogoUseCaseProvider = Provider<CleanLogoUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return CleanLogoUseCase(repository);
});

final sendLogoUseCaseProvider = Provider<SendLogoUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return SendLogoUseCase(repository);
});

final launchBrowserUseCaseProvider = Provider<LaunchBrowserUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return LaunchBrowserUseCase(repository);
});
final closeBrowserUseCaseProvider = Provider<CloseBrowserUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return CloseBrowserUseCase(repository);
});
