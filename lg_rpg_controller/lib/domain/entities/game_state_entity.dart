class GameStateEntity {
  final int hp;
  final int maxHp;
  final int elapsedMs;
  final int durationMs;

  final String? team;

  const GameStateEntity({
    required this.hp,
    required this.maxHp,
    required this.elapsedMs,
    required this.durationMs,
    this.team,
  });
}
