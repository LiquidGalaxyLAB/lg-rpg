import '../entities/fly_to_entity.dart';
import '../repositories/lg_repository.dart';

/// Use case for connecting to Liquid Galaxy via SSH
class ConnectToLgUseCase {
  final LGRepository repository;
  ConnectToLgUseCase(this.repository);

  Future<void> call(String ip, String username, String password, int port) {
    return repository.connect(ip, username, password, port);
  }
}

/// Use case for flying to a location on Liquid Galaxy
class FlyToLocationUseCase {
  final LGRepository repository;
  FlyToLocationUseCase(this.repository);

  Future<void> call(double lat, double lng) async {
    await repository.flyTo(
      FlyToEntity(
        latitude: lat,
        longitude: lng,
        altitude: 0,
        range: 1000,
        tilt: 45,
        heading: 0,
      ),
    );
  }
}

/// Use case for disconnecting from Liquid Galaxy
class DisconnectFromLgUseCase {
  final LGRepository repository;
  DisconnectFromLgUseCase(this.repository);

  Future<void> call() async {
    await repository.disconnect();
  }
}
