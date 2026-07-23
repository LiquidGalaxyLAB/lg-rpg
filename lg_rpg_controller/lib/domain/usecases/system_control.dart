import '../repositories/lg_repository.dart';

/// Reboots all LG machines, patching the slaves' KML refresh first: slaves read their KML once at Earth startup unless patched, and the patch only lands on the next Earth start — which is exactly what a reboot is.
class RebootLgUseCase {
  final LGRepository repository;
  RebootLgUseCase(this.repository);

  Future<bool> call() async {
    await repository.setRefresh();
    return repository.rebootAll();
  }
}

class RelaunchLgUseCase {
  final LGRepository repository;
  RelaunchLgUseCase(this.repository);

  Future<void> call() => repository.relaunch();
}

class ShutdownLgUseCase {
  final LGRepository repository;
  ShutdownLgUseCase(this.repository);

  Future<bool> call() => repository.shutdownAll();
}

/// Clears all KML content, logo included.
class CleanAllKmlUseCase {
  final LGRepository repository;
  CleanAllKmlUseCase(this.repository);

  Future<void> call() => repository.cleanAllKml();
}

class SendLogoUseCase {
  final LGRepository repository;
  SendLogoUseCase(this.repository);

  Future<void> call() => repository.sendLogo();
}
