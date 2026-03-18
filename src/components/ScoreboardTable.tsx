import { ProblemMeta, TeamStanding } from "../domain/types";
import { formatPenalty } from "../utils/format";
import { ProblemCell } from "./ProblemCell";

interface ScoreboardTableProps {
  problems: ProblemMeta[];
  teams: TeamStanding[];
}

export function ScoreboardTable({ problems, teams }: ScoreboardTableProps) {
  function getRankCellClass(rank: number) {
    if (rank === 1) {
      return "scoreboard-table__cell--rank-first";
    }

    if (rank === 2) {
      return "scoreboard-table__cell--rank-second";
    }

    if (rank === 3) {
      return "scoreboard-table__cell--rank-third";
    }

    return "";
  }

  return (
    <div className="scoreboard-shell">
      <div className="scoreboard-scroll">
        <table className="scoreboard-table">
          <thead>
            <tr>
              <th className="scoreboard-table__head scoreboard-table__head--rank">#</th>
              <th className="scoreboard-table__head scoreboard-table__head--team">Team</th>
              <th className="scoreboard-table__head scoreboard-table__head--score">Score</th>
              {problems.map((problem) => (
                <th
                  className="scoreboard-table__head scoreboard-table__head--problem"
                  key={problem.id}
                >
                  {problem.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => (
              <tr key={team.id} className="scoreboard-table__row">
                <td
                  className={`scoreboard-table__cell scoreboard-table__cell--rank ${getRankCellClass(
                    team.rank
                  )}`.trim()}
                >
                  <span className="rank-value">{team.rank}</span>
                </td>
                <td className="scoreboard-table__cell scoreboard-table__cell--team">
                  <div className="team-cell">
                    <strong className="team-cell__name">
                      [{team.organization}] {team.name}
                    </strong>
                  </div>
                </td>
                <td className="scoreboard-table__cell scoreboard-table__cell--score">
                  <div className="score-cell">
                    <strong className="score-cell__solved">{team.solved}</strong>
                    <span className="score-cell__penalty">{formatPenalty(team.penalty)}</span>
                  </div>
                </td>
                {team.problems.map((cell, index) => (
                  <td
                    className="scoreboard-table__cell scoreboard-table__cell--problem"
                    key={`${team.id}-${cell.problemId}`}
                  >
                    <ProblemCell cell={cell} problem={problems[index]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
