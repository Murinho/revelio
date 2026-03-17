export function formatPenalty(value: number): string {
  return value.toString();
}

export function formatMovement(movement?: number): string {
  if (!movement || movement === 0) {
    return "Holding";
  }

  return movement > 0 ? `+${movement} positions` : `${movement} positions`;
}
