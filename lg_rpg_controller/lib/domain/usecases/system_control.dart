import '../repositories/lg_repository.dart';

/// Use case for rebooting all LG machines
class RebootLgUseCase {
  final LGRepository repository;
  RebootLgUseCase(this.repository);

  Future<bool> call() => repository.rebootAll();
}

/// Use case for relaunching Google Earth on all machines
class RelaunchLgUseCase {
  final LGRepository repository;
  RelaunchLgUseCase(this.repository);

  Future<void> call() => repository.relaunch();
}

/// Use case for shutting down all LG machines
class ShutdownLgUseCase {
  final LGRepository repository;
  ShutdownLgUseCase(this.repository);

  Future<bool> call() => repository.shutdownAll();
}

/// Use case for cleaning navigation query
class ClearNavigationUseCase {
  final LGRepository repository;
  ClearNavigationUseCase(this.repository);

  Future<void> call() => repository.clearNavigation();
}

/// Use case for cleaning all KML content
class CleanAllKmlUseCase {
  final LGRepository repository;
  CleanAllKmlUseCase(this.repository);

  Future<void> call() => repository.cleanAllKml();
}

/// Use case for sending app logo to screen
class SendLogoUseCase {
  final LGRepository repository;
  SendLogoUseCase(this.repository);

  Future<void> call() => repository.sendLogo();
}

/// Use case for clearing logo from screen
class CleanLogoUseCase {
  final LGRepository repository;
  CleanLogoUseCase(this.repository);

  Future<void> call() => repository.cleanLogo();
}
