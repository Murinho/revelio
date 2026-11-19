export function formatPenalty(value: number): string {
  return value.toString();
}

export function truncateTeamLabel(label: string): string {
  const characters = Array.from(label);
  return characters.length > 50 ? `${characters.slice(0, 47).join("")}...` : label;
}
