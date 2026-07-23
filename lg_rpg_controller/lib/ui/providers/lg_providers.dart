import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/core/di/injection_container.dart';
import 'package:lg_rpg_controller/domain/usecases/connect_to_lg.dart';
import 'package:lg_rpg_controller/domain/usecases/map_control.dart';
import 'package:lg_rpg_controller/domain/usecases/system_control.dart';

export '../../core/di/injection_container.dart' show lgRepositoryProvider;

final serverRunningProvider = StateProvider<bool>((ref) => false);
final browserOpenProvider = StateProvider<bool>((ref) => false);

// ── MAP → GOOGLE EARTH ──

final flyToPointUseCaseProvider = Provider<FlyToPointUseCase>((ref) {
  return FlyToPointUseCase(ref.watch(lgRepositoryProvider));
});

final showAreaKmlUseCaseProvider = Provider<ShowAreaKmlUseCase>((ref) {
  return ShowAreaKmlUseCase(ref.watch(lgRepositoryProvider));
});

final orbitAroundUseCaseProvider = Provider<OrbitAroundUseCase>((ref) {
  return OrbitAroundUseCase(ref.watch(lgRepositoryProvider));
});

final stopOrbitUseCaseProvider = Provider<StopOrbitUseCase>((ref) {
  return StopOrbitUseCase(ref.watch(lgRepositoryProvider));
});

final searchPlacesUseCaseProvider = Provider<SearchPlacesUseCase>((ref) {
  return SearchPlacesUseCase(ref.watch(placeRepositoryProvider));
});

final connectToLgUseCaseProvider = Provider<ConnectToLgUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return ConnectToLgUseCase(repository);
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

final sendLogoUseCaseProvider = Provider<SendLogoUseCase>((ref) {
  final repository = ref.watch(lgRepositoryProvider);
  return SendLogoUseCase(repository);
});
