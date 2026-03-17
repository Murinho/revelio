import { ContestSnapshot } from "../domain/types";
import { Panel } from "./Panel";

interface TimerPanelProps {
  snapshot: ContestSnapshot;
}

export function TimerPanel({ snapshot }: TimerPanelProps) {
  return (
    <Panel title="Contest Timer">
      <div className="timer-panel">
        <div className="timer-panel__clock" aria-label="Contest duration">
          {snapshot.durationLabel}
        </div>
        <p className="timer-panel__freeze">{snapshot.freezeLabel}</p>
        <p className="timer-panel__phase">{snapshot.phase}</p>
      </div>
    </Panel>
  );
}
