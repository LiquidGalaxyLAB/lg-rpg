class ConnectionEntity {
  final String ip;
  final String username;
  final String password;
  final int port;
  final int screenNumber;
  final bool isConnected;

  const ConnectionEntity({
    required this.ip,
    required this.username,
    required this.password,
    required this.port,
    this.screenNumber = 3,
    this.isConnected = false,
  });

  ConnectionEntity copyWith({
    String? ip,
    int? port,
    String? username,
    String? password,
    int? screenNumber,
    bool? isConnected,
  }) {
    return ConnectionEntity(
      ip: ip ?? this.ip,
      port: port ?? this.port,
      username: username ?? this.username,
      password: password ?? this.password,
      screenNumber: screenNumber ?? this.screenNumber,
      isConnected: isConnected ?? this.isConnected,
    );
  }
}
