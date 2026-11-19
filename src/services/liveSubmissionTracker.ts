import type { ScoreboardParticipantType } from "../domain/contestConfiguration";
import {
  CodeforcesSubmission,
  getCodeforcesSubmissionVerdictStatus,
  isCodeforcesSubmissionEligible
} from "./codeforcesContestGateway";

export interface LiveSubmissionTracker {
  initialized: boolean;
  knownEligibleSubmissionIds: Set<number>;
  pendingSubmissionIds: Set<number>;
  revealedSubmissionIds: Set<number>;
  revealAtMsBySubmissionId: Map<number, number>;
}

export function createLiveSubmissionTracker(): LiveSubmissionTracker {
  return {
    initialized: false,
    knownEligibleSubmissionIds: new Set(),
    pendingSubmissionIds: new Set(),
    revealedSubmissionIds: new Set(),
    revealAtMsBySubmissionId: new Map()
  };
}

export function updateLiveSubmissionTracker(
  tracker: LiveSubmissionTracker,
  submissions: CodeforcesSubmission[],
  elapsedSeconds: number,
  includedParticipantTypes: readonly ScoreboardParticipantType[],
  durationSeconds: number,
  nowMs: number,
  random: () => number = Math.random
): void {
  for (const submission of submissions) {
    if (!isCodeforcesSubmissionEligible(
      submission, elapsedSeconds, includedParticipantTypes, durationSeconds
    )) {
      continue;
    }

    const hasFinalVerdict =
      getCodeforcesSubmissionVerdictStatus(submission.verdict) !== "pending";
    const isKnown = tracker.knownEligibleSubmissionIds.has(submission.id);
    tracker.knownEligibleSubmissionIds.add(submission.id);

    // The first successful load establishes history; only incoming submissions
    // and unfinished judging need the live suspense delay.
    if (!tracker.initialized && !isKnown && hasFinalVerdict) {
      tracker.revealedSubmissionIds.add(submission.id);
      continue;
    }

    if (tracker.revealedSubmissionIds.has(submission.id)) {
      continue;
    }

    tracker.pendingSubmissionIds.add(submission.id);
    if (!hasFinalVerdict) {
      tracker.revealAtMsBySubmissionId.delete(submission.id);
    } else if (!tracker.revealAtMsBySubmissionId.has(submission.id)) {
      // Start once, when the final verdict is first observed, not at submission
      // time. Repeated polls must not restart the countdown.
      tracker.revealAtMsBySubmissionId.set(
        submission.id, nowMs + 3_000 + Math.floor(random() * 7_001)
      );
    }
  }
  tracker.initialized = true;
}

export function revealReadyLiveSubmissions(
  tracker: LiveSubmissionTracker,
  nowMs: number
): void {
  for (const [id, revealAtMs] of tracker.revealAtMsBySubmissionId) {
    if (nowMs >= revealAtMs) {
      tracker.revealAtMsBySubmissionId.delete(id);
      tracker.pendingSubmissionIds.delete(id);
      tracker.revealedSubmissionIds.add(id);
    }
  }
}
