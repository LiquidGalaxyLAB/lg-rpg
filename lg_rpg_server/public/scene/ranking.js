const byKillsThenName = (a, b) =>
  Number(b.kills || 0) - Number(a.kills || 0)
  || String(a.name || '').localeCompare(String(b.name || ''));

// PvP is ordered by the team score. When the teams are tied there is no leading team, so fall back to the player tie-breaker instead of always preferring Blue.
export function rankPlayers(players, scores = {}, isPvp = false) {
  const list = [...(players || [])];
  if (!isPvp) return list.sort(byKillsThenName);

  const teamAScore = Number(scores.teamA || 0);
  const teamBScore = Number(scores.teamB || 0);
  if (teamAScore === teamBScore) return list.sort(byKillsThenName);

  const teamOrder = teamAScore > teamBScore
    ? { teamA: 0, teamB: 1 }
    : { teamA: 1, teamB: 0 };
  return list.sort((a, b) =>
    (teamOrder[a.team] ?? 2) - (teamOrder[b.team] ?? 2)
    || byKillsThenName(a, b));
}
