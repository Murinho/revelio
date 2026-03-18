import { RecentSubmission, TeamStanding } from "../domain/types";
import { Panel } from "./Panel";

interface RecentSubmissionsPanelProps {
  submissions: RecentSubmission[];
  teams: TeamStanding[];
}

function getPendingCellParts(summary: string) {
  const [main, bottom] = summary.split(" ");

  return {
    main: main ?? "?",
    bottom: bottom ?? "+0"
  };
}

export function RecentSubmissionsPanel({
  submissions,
  teams
}: RecentSubmissionsPanelProps) {
  const teamByName = new Map(teams.map((team) => [team.name, team]));

  function getRankCellClass(rank: number | undefined) {
    if (rank === 1) {
      return "submission-list__cell--rank-first";
    }

    if (rank === 2) {
      return "submission-list__cell--rank-second";
    }

    if (rank === 3) {
      return "submission-list__cell--rank-third";
    }

    return "";
  }

  return (
    <Panel title="Ultimas Submisiones" eyebrow="Frozen feed">
      <ul className="submission-list">
        {submissions.map((submission) => {
          const team = teamByName.get(submission.teamName);
          const pendingCell = getPendingCellParts(submission.summary);
          const rankCellClass = getRankCellClass(team?.rank);

          return (
            <li className="submission-list__row" key={submission.id}>
              <span
                className={`submission-list__cell submission-list__cell--rank ${rankCellClass}`.trim()}
              >
                {team ? team.rank : submission.contestMinute}
              </span>
              <div className="submission-list__cell submission-list__cell--team submission-list__details">
                <p className="submission-list__team">
                  {team ? `[${team.organization}] ${team.name}` : submission.teamName}
                </p>
              </div>
              <span className="submission-list__cell submission-list__cell--problem submission-list__problem">
                {submission.problemLabel}
              </span>
              <div className="submission-list__attempts">
                <div className="problem-cell problem-cell--pending">
                  <span className="problem-cell__main">{pendingCell.main}</span>
                  <span className="problem-cell__bottom">{pendingCell.bottom}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
