import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/data/datasources/socket_service.dart';
import 'package:lg_rpg_controller/data/repositories/game_server_repository_impl.dart';
import 'package:lg_rpg_controller/domain/repositories/game_server_repository.dart';
import 'package:lg_rpg_controller/domain/services/socket_service_interface.dart';
import '../../data/datasources/local_storage_source.dart';
import '../../data/datasources/nominatim_source.dart';
import '../../data/datasources/ssh_service.dart';
import '../../data/repositories/lg_repository_impl.dart';
import '../../data/repositories/place_repository_impl.dart';
import '../../domain/repositories/lg_repository.dart';
import '../../domain/repositories/place_repository.dart';

import '../../domain/services/ssh_service_interface.dart';

// Data source providers

final sshServiceProvider = Provider<ISshService>((ref) {
  return SshService();
});

final localStorageProvider = Provider<LocalStorageDataSource>((ref) {
  return LocalStorageDataSource();
});

final socketServiceProvider = Provider<ISocketService>((ref) {
  return SocketService();
});

final nominatimSourceProvider = Provider<NominatimSource>((ref) {
  return NominatimSource();
});

// Repository providers

final lgRepositoryProvider = Provider<LGRepository>((ref) {
  final sshService = ref.watch(sshServiceProvider);
  final storageService = ref.watch(localStorageProvider);
  return LgRepositoryImpl(sshService, storageService);
});

final placeRepositoryProvider = Provider<PlaceRepository>((ref) {
  return PlaceRepositoryImpl(ref.watch(nominatimSourceProvider));
});

final gameServerRepositoryProvider = Provider<GameServerRepository>((ref) {
  final socketService = ref.watch(socketServiceProvider);
  final storageService = ref.watch(localStorageProvider);
  return GameServerRepositoryImpl(storageService, socketService);
});
