/// The match result delivered to this player, so the controller can show a win/lose moment before returning Home.
class GameOverEntity {
  /// 'win', 'loss', or 'draw' (tied PvP round) for this player.
  final String outcome;
  final int survivedMs;
  final String? reason;

  const GameOverEntity({
    required this.outcome,
    required this.survivedMs,
    this.reason,
  });

  bool get isWin => outcome == 'win';
  bool get isDraw => outcome == 'draw';
}
