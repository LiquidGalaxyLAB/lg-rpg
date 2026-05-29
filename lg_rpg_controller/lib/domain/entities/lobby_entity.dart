import 'package:equatable/equatable.dart';
import 'package:lg_rpg_controller/domain/entities/player_entity.dart';

class LobbyEntity extends Equatable {
  final List<PlayerEntity> players;
  final String sessionCode;
  final String hostId;
  final String selectedMode;
  final Map<String, String> pvpTeams;

  const LobbyEntity({
    required this.players,
    required this.sessionCode,
    required this.hostId,
    required this.selectedMode,
    required this.pvpTeams,
  });

  bool isHost(String playerId) => playerId == hostId;

  LobbyEntity copyWith(
      {List<PlayerEntity>? players,
      String? sessionCode,
      String? hostId,
      String? selectedMode,
      Map<String, String>? pvpTeams}) {
    return LobbyEntity(
        players: players ?? this.players,
        sessionCode: sessionCode ?? this.sessionCode,
        hostId: hostId ?? this.hostId,
        selectedMode: selectedMode ?? this.selectedMode,
        pvpTeams: pvpTeams ?? this.pvpTeams);
  }

  @override
  List<Object?> get props => [
        players,
        sessionCode,
        hostId,
        selectedMode,
        pvpTeams,
      ];
}
