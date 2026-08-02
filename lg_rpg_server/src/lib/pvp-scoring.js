// Returns the real scoring interval, bounded by the round deadline so a delayed loop cannot award control time after the match should have ended.
export function captureScoringInterval(now, lastUpdateAt, roundEndsAt = 0) {
  const effectiveNow = roundEndsAt > 0 ? Math.min(now, roundEndsAt) : now;
  return {
    effectiveNow,
    elapsedMs: Math.max(0, effectiveNow - lastUpdateAt),
  };
}
