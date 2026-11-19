import {
  ProblemMeta,
  RecentSubmission,
  SolvedProblemCell,
  TeamStanding
} from "../domain/types";
import { Panel } from "./Panel";
import { SolvedProblemCell as SolvedSubmissionCell } from "./SolvedProblemCell";
import { truncateTeamLabel } from "../utils/format";
import { useSubmissionMotion } from "../hooks/useSubmissionMotion";

interface RecentSubmissionsPanelProps {
  firstToSolveTwinkleMinute?: number | null;
  problems: ProblemMeta[];
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

function getSubmissionCellClass(submission: RecentSubmission) {
  switch (submission.status) {
    case "accepted":
      return "problem-cell--solved";
    case "rejected":
      return "problem-cell--failed";
    case "compilation-error":
      return "problem-cell--failed";
    case "pending":
    default:
      return "problem-cell--pending";
  }
}

export function RecentSubmissionsPanel({
  firstToSolveTwinkleMinute = null,
  problems,
  submissions,
  teams
}: RecentSubmissionsPanelProps) {
  const rowElementsRef = useSubmissionMotion();
  const teamByName = new Map(teams.map((team) => [team.name, team]));
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const problemByLabel = new Map(problems.map((problem) => [problem.label, problem]));

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
    <Panel title="Last Submissions">
      <ul className="submission-list">
        {submissions.map((submission, index) => {
          const team =
            (submission.teamId ? teamById.get(submission.teamId) : undefined) ??
            teamByName.get(submission.teamName);
          const pendingCell = getPendingCellParts(submission.summary);
          const rankCellClass = getRankCellClass(team?.rank);
          const submissionCellClass = getSubmissionCellClass(submission);
          const solvedCell = team
            ? getSolvedProblemCell(team, submission.problemLabel)
            : null;
          const problem = problemByLabel.get(submission.problemLabel);
          const teamLabel = team
            ? team.organization
              ? `[${team.organization}] ${team.name}`
              : team.name
            : submission.teamName;

          return (
            <li
              className="submission-list__row"
              key={submission.id}
              style={{ zIndex: submissions.length - index }}
              ref={(element) => {
                if (element) rowElementsRef.current.set(submission.id, element);
                else rowElementsRef.current.delete(submission.id);
              }}
            >
              <span
                className={`submission-list__cell submission-list__cell--rank submission-list__rank ${rankCellClass}`.trim()}
              >
                {team ? team.rank : submission.contestMinute}
              </span>
              <div className="submission-list__cell submission-list__cell--team submission-list__details">
                <p className="submission-list__team" title={teamLabel}>
                  {truncateTeamLabel(teamLabel)}
                </p>
                {team?.members && team.members.length > 0 ? (
                  <p className="submission-list__team-meta">
                    {team.members.join(" / ")}
                  </p>
                ) : null}
              </div>
              <span className="submission-list__cell submission-list__cell--problem submission-list__problem">
                {submission.problemLabel}
              </span>
              <div className="submission-list__cell submission-list__attempts">
                {submission.status === "accepted" && solvedCell && problem ? (
                  <SolvedSubmissionCell
                    cell={solvedCell}
                    problem={problem}
                    firstToSolveTwinkleMinute={firstToSolveTwinkleMinute}
                    bottomLabel={solvedCell.penalty}
                    verdictLabel="accepted"
                  />
                ) : (
                  <div className={`problem-cell ${submissionCellClass}`}>
                    <span className="problem-cell__main">{pendingCell.main}</span>
                    <span className="problem-cell__bottom">{pendingCell.bottom}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function getSolvedProblemCell(
  team: TeamStanding,
  problemLabel: string
): SolvedProblemCell | null {
  const cell = team.problems.find(
    (problemCell) => problemCell.problemLabel === problemLabel
  );

  return cell?.kind === "solved" ? cell : null;
}
