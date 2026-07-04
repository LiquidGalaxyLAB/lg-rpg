import 'package:equatable/equatable.dart';

class PlayerEntity extends Equatable {
  final int coins;
  final String name;
  final String id;
  final int currentHealth;
  final Map<String, int> inventory;
  final int kills;
  final int numQuests;
  final bool isReady;
  final String? team;

  const PlayerEntity({
    required this.id,
    required this.name,
    this.coins = 0,
    this.numQuests = 0,
    this.currentHealth = 100,
    this.inventory = const {},
    this.kills = 0,
    this.isReady = false,
    this.team,
  });

  PlayerEntity copyWith(
      {int? coins,
      String? name,
      String? id,
      int? currentHealth,
      Map<String, int>? inventory,
      int? kills,
      int? numQuests,
      bool? isReady,
      String? team}) {
    return PlayerEntity(
        id: id ?? this.id,
        name: name ?? this.name,
        coins: coins ?? this.coins,
        currentHealth: currentHealth ?? this.currentHealth,
        inventory: inventory ?? this.inventory,
        kills: kills ?? this.kills,
        numQuests: numQuests ?? this.numQuests,
        isReady: isReady ?? this.isReady,
        team: team ?? this.team);
  }

  @override
  List<Object?> get props => [
        coins,
        name,
        id,
        numQuests,
        currentHealth,
        inventory,
        kills,
        isReady,
        team
      ];
}
