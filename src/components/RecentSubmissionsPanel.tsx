import { RecentSubmission, TeamStanding } from "../domain/types";
import { Panel } from "./Panel";

interface RecentSubmissionsPanelProps {
  submissions: RecentSubmission[];
  teams: TeamStanding[];
}

export function RecentSubmissionsPanel({
  submissions,
  teams
}: RecentSubmissionsPanelProps) {
  const teamByName = new Map(teams.map((team) => [team.name, team]));

  return (
    <Panel title="Últimas Submisiones" eyebrow="Frozen feed">
      <ul className="submission-list">
        {submissions.map((submission) => {
          const team = teamByName.get(submission.teamName);
          return (
            <li className="submission-list__row" key={submission.id}>
              <span className="submission-list__rank">
                {team ? team.rank : submission.contestMinute}
              </span>
              <div className="submission-list__details">
                <p className="submission-list__team">
                  {team ? `[${team.organization}] ${team.name}` : submission.teamName}
                </p>
                <p className="submission-list__minute">{submission.contestMinute} min</p>
              </div>
              <span className="submission-list__problem">{submission.problemLabel}</span>
              <span className="submission-list__attempts">
                {submission.summary}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
