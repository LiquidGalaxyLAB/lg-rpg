/// This player's own live match snapshot, distilled from the server's
/// `gameState` broadcast. Drives the on-controller HUD (HP + countdown).
class GameStateEntity {
  final int hp;
  final int maxHp;
  final int elapsedMs;
  final int durationMs;

  const GameStateEntity({
    required this.hp,
    required this.maxHp,
    required this.elapsedMs,
    required this.durationMs,
  });
}
