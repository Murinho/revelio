import { ContestSnapshot } from "../domain/types";
import { ContestClock } from "../hooks/useContestClock";
import { Panel } from "./Panel";

interface TimerPanelProps {
  clock: ContestClock;
  snapshot: ContestSnapshot;
}

export function TimerPanel({ clock, snapshot }: TimerPanelProps) {
  return (
    <Panel title="Contest Timer">
      <div className={`timer-panel timer-panel--${clock.phase}`}>
        <div className="timer-panel__mode-icon" aria-hidden="true">
          {clock.phase === "frozen" ? <FrozenIcon /> : <PlayIcon />}
        </div>
        <div className="timer-panel__clock" aria-label="Contest elapsed time">
          {clock.timeLabel}
        </div>
        <p className="timer-panel__freeze">{snapshot.freezeLabel}</p>
        <p className="timer-panel__phase">{clock.phaseLabel}</p>
      </div>
    </Panel>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 64 64" className="timer-panel__mode-svg">
      <circle
        cx="32"
        cy="32"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path d="M27 21v22l18-11-18-11Z" fill="currentColor" />
    </svg>
  );
}

function FrozenIcon() {
  return (
    <svg viewBox="0 0 64 64" className="timer-panel__mode-svg">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M32 8v48" />
        <path d="M11.2 20l41.6 24" />
        <path d="M11.2 44L52.8 20" />
        <path d="M32 8l-4.8 6.8" />
        <path d="M32 8l4.8 6.8" />
        <path d="M32 56l-4.8-6.8" />
        <path d="M32 56l4.8-6.8" />
        <path d="M11.2 20l8.2 0.6" />
        <path d="M11.2 20l3.4 7.4" />
        <path d="M52.8 44l-8.2-0.6" />
        <path d="M52.8 44l-3.4-7.4" />
        <path d="M11.2 44l3.4-7.4" />
        <path d="M11.2 44l8.2 0.6" />
        <path d="M52.8 20l-3.4 7.4" />
        <path d="M52.8 20l-8.2-0.6" />
      </g>
    </svg>
  );
}
