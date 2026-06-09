import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lg_rpg_controller/data/datasources/socket_service.dart';
import 'package:lg_rpg_controller/data/repositories/game_server_repository_impl.dart';
import 'package:lg_rpg_controller/domain/repositories/game_server_repository.dart';
import 'package:lg_rpg_controller/domain/services/socket_service_interface.dart';
import '../../data/datasources/local_storage_source.dart';
import '../../data/datasources/ssh_service.dart';
import '../../data/datasources/permission_service_impl.dart';
import '../../data/repositories/lg_repository_impl.dart';
import '../../domain/repositories/lg_repository.dart';

import '../../domain/services/ssh_service_interface.dart';
import '../../domain/services/permission_service_interface.dart';

// ─────────────────────────────────────────────────────────────
// DATA SOURCE PROVIDERS (Composition Root)
// ─────────────────────────────────────────────────────────────

final sshServiceProvider = Provider<ISshService>((ref) {
  return SshService();
});

final permissionServiceProvider = Provider<IPermissionService>((ref) {
  return PermissionServiceImpl();
});

final localStorageProvider = Provider<LocalStorageDataSource>((ref) {
  return LocalStorageDataSource();
});

final socketServiceProvider = Provider<ISocketService>((ref) {
  return SocketService();
});

// ─────────────────────────────────────────────────────────────
// REPOSITORY IMPLEMENTATION PROVIDERS
// ─────────────────────────────────────────────────────────────

final lgRepositoryProvider = Provider<LGRepository>((ref) {
  final sshService = ref.watch(sshServiceProvider);
  final storageService = ref.watch(localStorageProvider);
  return LgRepositoryImpl(sshService, storageService);
});

final gameServerRepositoryProvider = Provider<GameServerRepository>((ref) {
  final socketService = ref.watch(socketServiceProvider);
  final storageService = ref.watch(localStorageProvider);
  return GameServerRepositoryImpl(storageService, socketService);
});
