import type { CSSProperties } from "react";
import {
  ProblemMeta,
  RecentSubmission,
  SolvedProblemCell,
  TeamStanding
} from "../domain/types";
import { Panel } from "./Panel";

interface RecentSubmissionsPanelProps {
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
      return "problem-cell--untouched";
    case "pending":
    default:
      return "problem-cell--pending";
  }
}

export function RecentSubmissionsPanel({
  problems,
  submissions,
  teams
}: RecentSubmissionsPanelProps) {
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
        {submissions.map((submission) => {
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

          return (
            <li className="submission-list__row" key={submission.id}>
              <span
                className={`submission-list__cell submission-list__cell--rank submission-list__rank ${rankCellClass}`.trim()}
              >
                {team ? team.rank : submission.contestMinute}
              </span>
              <div className="submission-list__cell submission-list__cell--team submission-list__details">
                <p className="submission-list__team">
                  {team
                    ? team.organization
                      ? `[${team.organization}] ${team.name}`
                      : team.name
                    : submission.teamName}
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
                  <SolvedSubmissionCell cell={solvedCell} problem={problem} />
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

function SolvedSubmissionCell({
  cell,
  problem
}: {
  cell: SolvedProblemCell;
  problem: ProblemMeta;
}) {
  return (
    <div
      className={`problem-cell problem-cell--solved ${
        cell.firstToSolve ? "problem-cell--first-to-solve" : ""
      }`.trim()}
      title={`Problem ${cell.problemLabel}: accepted`}
    >
      <div
        className={`balloon ${cell.firstToSolve ? "balloon--star" : "balloon--round"}`}
        style={{ "--balloon-color": problem.color } as CSSProperties}
      />
      <span className="balloon__text balloon__text--overlay">
        +{cell.wrongAttempts > 0 ? cell.wrongAttempts : ""}
      </span>
      <span className="problem-cell__bottom problem-cell__bottom--overlay">
        {cell.penalty}
      </span>
    </div>
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
