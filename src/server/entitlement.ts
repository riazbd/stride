// Who gets the features that will later be paid (full leaderboards, grade-adjusted
// pace, heart-rate zones, training log, fitness, monthly and yearly goals).
//
// During the free beta everyone does. Set STRIDE_BETA_UNLOCK=0 once billing
// exists; then only athletes whose `premium` flag was set by a verified payment
// (never by the client) keep them. Every server check goes through here.
export function betaUnlocked(): boolean {
  return process.env.STRIDE_BETA_UNLOCK !== "0";
}

export function hasFullAccess(athlete: { premium: boolean } | null | undefined): boolean {
  if (!athlete) return false;
  return betaUnlocked() || athlete.premium;
}
