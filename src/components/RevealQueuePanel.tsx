import { RevealQueueEntry } from "../domain/types";
import { Panel } from "./Panel";

interface RevealQueuePanelProps {
  entries: RevealQueueEntry[];
}

export function RevealQueuePanel({ entries }: RevealQueuePanelProps) {
  return (
    <Panel title="Reveal Queue" eyebrow="Bottom-up order">
      <ul className="queue-list">
        {entries.map((entry) => (
          <li className="queue-list__item" key={entry.teamId}>
            <div>
              <p className="queue-list__team">{entry.teamName}</p>
              <p className="queue-list__meta">
                Rank {entry.currentRank} • Next {entry.nextProblemLabel ?? "done"}
              </p>
            </div>
            <span className="queue-list__count">{entry.pendingCount}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
