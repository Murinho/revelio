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

  return (
    <Panel title="Ultimas Submisiones" eyebrow="Frozen feed">
      <ul className="submission-list">
        {submissions.map((submission) => {
          const team = teamByName.get(submission.teamName);
          const pendingCell = getPendingCellParts(submission.summary);

          return (
            <li className="submission-list__row" key={submission.id}>
              <span className="submission-list__rank">
                {team ? team.rank : submission.contestMinute}
              </span>
              <div className="submission-list__details">
                <p className="submission-list__team">
                  {team ? `[${team.organization}] ${team.name}` : submission.teamName}
                </p>
              </div>
              <span className="submission-list__problem">{submission.problemLabel}</span>
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
