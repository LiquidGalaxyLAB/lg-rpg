import '../repositories/lg_repository.dart';

class ConnectToLgUseCase {
  final LGRepository repository;
  ConnectToLgUseCase(this.repository);

  Future<void> call(String ip, String username, String password, int port) {
    return repository.connect(ip, username, password, port);
  }
}

class DisconnectFromLgUseCase {
  final LGRepository repository;
  DisconnectFromLgUseCase(this.repository);

  Future<void> call() async {
    await repository.disconnect();
  }
}
