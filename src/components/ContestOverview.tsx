import { ContestSnapshot, TeamStanding } from "../domain/types";
import { buildRevealSummary } from "../utils/contest";
import { Panel } from "./Panel";

interface ContestOverviewProps {
  snapshot: ContestSnapshot;
  highlightedTeam: TeamStanding | null;
  onFocusNextTeam: () => void;
  isAutoRevealEnabled: boolean;
  onToggleAutoReveal: () => void;
}

export function ContestOverview({
  snapshot,
  highlightedTeam,
  onFocusNextTeam,
  isAutoRevealEnabled,
  onToggleAutoReveal
}: ContestOverviewProps) {
  const solvedTotal = snapshot.teams.reduce((sum, team) => sum + team.solved, 0);

  return (
    <Panel
      title={snapshot.regionName}
      eyebrow="ICPC Scoreboard Revelator"
      actions={
        <span className={`phase-pill phase-pill--${snapshot.phase}`}>
          {snapshot.phase}
        </span>
      }
      className="hero-panel"
    >
      <div className="hero-panel__brand">
        <div className="hero-panel__logo">R</div>
        <div className="hero-panel__clock">{snapshot.durationLabel}</div>
        <p className="hero-panel__freeze">{snapshot.freezeLabel}</p>
      </div>

      <div className="hero-panel__metrics">
        <div className="metric-card">
          <span className="metric-card__label">Problems</span>
          <strong className="metric-card__value">{snapshot.problems.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Teams</span>
          <strong className="metric-card__value">{snapshot.teams.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-card__label">Solved</span>
          <strong className="metric-card__value">{solvedTotal}</strong>
        </div>
      </div>

      <p className="hero-panel__summary">{buildRevealSummary(snapshot)}</p>

      <div className="hero-panel__controls">
        <button className="action-button action-button--primary" onClick={onFocusNextTeam}>
          Focus Next Team
        </button>
        <button className="action-button action-button--ghost" onClick={onToggleAutoReveal}>
          {isAutoRevealEnabled ? "Pause Demo Flow" : "Start Demo Flow"}
        </button>
      </div>

      {highlightedTeam ? (
        <div className="hero-panel__focus">
          <span className="hero-panel__focus-label">Focused Team</span>
          <strong className="hero-panel__focus-name">
            [{highlightedTeam.organization}] {highlightedTeam.name}
          </strong>
          <span className="hero-panel__focus-meta">
            Rank {highlightedTeam.rank} • {highlightedTeam.pendingProblemLabels.length} frozen
            problems
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
