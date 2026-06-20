/// The match result delivered to THIS player when the game ends, so the
/// controller can show a clear win/lose moment before returning Home.
class GameOverEntity {
  /// 'win' or 'loss' from the server's perspective for this player.
  final String outcome;
  final int survivedMs;

  const GameOverEntity({
    required this.outcome,
    required this.survivedMs,
  });

  bool get isWin => outcome == 'win';
}
