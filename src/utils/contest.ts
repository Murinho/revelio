import { ContestSnapshot, RevealQueueEntry, TeamStanding } from "../domain/types";

export function getNextRevealCandidate(teams: TeamStanding[]): TeamStanding | null {
  const candidates = teams.filter(
    (team) => !team.marked && team.pendingProblemLabels.length > 0
  );

  if (candidates.length === 0) {
    return null;
  }

  return candidates[candidates.length - 1];
}

export function getSelectedTeam(
  teams: TeamStanding[],
  selectedTeamId: string | null
): TeamStanding | null {
  if (!selectedTeamId) {
    return null;
  }

  return teams.find((team) => team.id === selectedTeamId) ?? null;
}

export function buildRevealSummary(snapshot: ContestSnapshot): string {
  const markedTeams = snapshot.teams.filter((team) => team.marked).length;
  const remainingTeams = snapshot.teams.length - markedTeams;
  return `${remainingTeams} teams still have frozen attempts to reveal`;
}

export function getQueuePreview(queue: RevealQueueEntry[]): RevealQueueEntry[] {
  return queue.filter((entry) => !entry.marked).slice().reverse().slice(0, 5);
}
