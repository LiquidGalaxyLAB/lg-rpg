import 'package:equatable/equatable.dart';

class GameServerEntity extends Equatable {
  final String serverUrl;
  final String statusMessage;
  final bool isConnected;
  final String playerToken;
  final String? sessionCode;

  const GameServerEntity({
    required this.serverUrl,
    required this.statusMessage,
    required this.isConnected,
    required this.playerToken,
    this.sessionCode,
  });

  GameServerEntity copyWith({
    String? serverUrl,
    String? statusMessage,
    bool? isConnected,
    String? playerToken,
    String? sessionCode,
  }) {
    return GameServerEntity(
      serverUrl: serverUrl ?? this.serverUrl,
      statusMessage: statusMessage ?? this.statusMessage,
      isConnected: isConnected ?? this.isConnected,
      playerToken: playerToken ?? this.playerToken,
      sessionCode: sessionCode ?? this.sessionCode,
    );
  }

  @override
  List<Object?> get props => [
        serverUrl,
        isConnected,
        statusMessage,
        playerToken,
        sessionCode,
      ];
}
