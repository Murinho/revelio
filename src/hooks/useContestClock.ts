import { useEffect, useMemo, useState } from "react";
import {
  ContestConfiguration,
  parseUtcDateTimeInputValue
} from "../domain/contestConfiguration";

export type ContestClockPhase = "standby" | "play" | "frozen" | "complete";

export interface ContestClock {
  elapsedSeconds: number;
  elapsedMinutes: number;
  durationSeconds: number;
  freezeDurationSeconds: number;
  phase: ContestClockPhase;
  phaseLabel: string;
  timeLabel: string;
}

const CLOCK_TICK_MS = 1000;

export function useContestClock(
  configuration: ContestConfiguration | null
): ContestClock {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());

    if (!configuration) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, CLOCK_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [configuration]);

  return useMemo(
    () => buildContestClock(configuration, nowMs),
    [configuration, nowMs]
  );
}

export function buildContestClock(
  configuration: ContestConfiguration | null,
  nowMs: number
): ContestClock {
  if (!configuration) {
    return createEmptyContestClock();
  }

  const durationSeconds = Math.max(
    1,
    Math.floor(configuration.durationMinutes * 60)
  );
  const freezeDurationSeconds = Math.min(
    durationSeconds,
    Math.max(0, Math.floor(configuration.freezeDurationMinutes * 60))
  );
  const startAt = parseUtcDateTimeInputValue(configuration.startAtUtc);

  if (!startAt) {
    return {
      elapsedSeconds: 0,
      elapsedMinutes: 0,
      durationSeconds,
      freezeDurationSeconds,
      phase: "standby",
      phaseLabel: "standby mode",
      timeLabel: formatClockSeconds(0)
    };
  }

  const rawElapsedSeconds = Math.floor((nowMs - startAt.getTime()) / 1000);
  const elapsedSeconds = clamp(rawElapsedSeconds, 0, durationSeconds);
  const phase = getContestClockPhase(
    rawElapsedSeconds,
    durationSeconds,
    freezeDurationSeconds
  );

  return {
    elapsedSeconds,
    elapsedMinutes: Math.floor(elapsedSeconds / 60),
    durationSeconds,
    freezeDurationSeconds,
    phase,
    phaseLabel: formatContestClockPhase(phase),
    timeLabel: formatClockSeconds(elapsedSeconds)
  };
}

function getContestClockPhase(
  rawElapsedSeconds: number,
  durationSeconds: number,
  freezeDurationSeconds: number
): ContestClockPhase {
  if (rawElapsedSeconds < 0) {
    return "standby";
  }

  if (rawElapsedSeconds >= durationSeconds) {
    return "complete";
  }

  const freezeStartSeconds = durationSeconds - freezeDurationSeconds;

  if (freezeDurationSeconds > 0 && rawElapsedSeconds >= freezeStartSeconds) {
    return "frozen";
  }

  return "play";
}

function formatContestClockPhase(phase: ContestClockPhase): string {
  switch (phase) {
    case "standby":
      return "standby mode";
    case "play":
      return "play mode";
    case "frozen":
      return "freeze mode";
    case "complete":
      return "complete";
  }
}

function formatClockSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function createEmptyContestClock(): ContestClock {
  return {
    elapsedSeconds: 0,
    elapsedMinutes: 0,
    durationSeconds: 1,
    freezeDurationSeconds: 0,
    phase: "standby",
    phaseLabel: "standby mode",
    timeLabel: formatClockSeconds(0)
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
