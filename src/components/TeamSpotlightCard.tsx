import { TeamStanding } from "../domain/types";
import { formatMovement } from "../utils/format";
import { Panel } from "./Panel";

interface TeamSpotlightCardProps {
  team: TeamStanding | null;
}

export function TeamSpotlightCard({ team }: TeamSpotlightCardProps) {
  if (!team) {
    return (
      <Panel title="Team Spotlight" eyebrow="Reveal candidate">
        <p className="empty-state">All teams are marked. The reveal is complete.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Team Spotlight" eyebrow="Reveal candidate">
      <div className="spotlight-card">
        <div className="spotlight-card__header">
          <div>
            <p className="spotlight-card__org">{team.organization}</p>
            <h3 className="spotlight-card__name">{team.name}</h3>
          </div>
          <div className="spotlight-card__score">
            <strong>{team.solved}</strong>
            <span>{team.penalty}</span>
          </div>
        </div>

        <div className="spotlight-card__stats">
          <div className="spotlight-stat">
            <span className="spotlight-stat__label">Current rank</span>
            <strong className="spotlight-stat__value">#{team.rank}</strong>
          </div>
          <div className="spotlight-stat">
            <span className="spotlight-stat__label">Projected move</span>
            <strong className="spotlight-stat__value">{formatMovement(team.movement)}</strong>
          </div>
        </div>

        <div className="spotlight-card__pending">
          <span className="spotlight-card__pending-label">Pending problems</span>
          <div className="spotlight-card__chips">
            {team.pendingProblemLabels.length === 0 ? (
              <span className="problem-chip problem-chip--done">Marked</span>
            ) : (
              team.pendingProblemLabels.map((label) => (
                <span className="problem-chip" key={label}>
                  {label}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
