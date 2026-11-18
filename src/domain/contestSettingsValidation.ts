import {
  calculateContestEndDate,
  CODEFORCES_SCOREBOARD_PARTICIPANT_TYPES,
  type ContestConfiguration,
  parseUtcDateTimeInputValue
} from "./contestConfiguration";

export type ContestSettingsErrors = Partial<Record<
  "contestName" | "contestUrl" | "duration" | "freeze" | "start" | "participants",
  string
>>;

export function validateContestSettings(
  configuration: ContestConfiguration,
  duration: string,
  freeze: string
): ContestSettingsErrors {
  const errors: ContestSettingsErrors = {};

  if (!configuration.contestName.trim()) {
    errors.contestName = "Enter a contest name.";
  }

  try {
    const url = new URL(configuration.contestUrl.trim());
    if (!/^https?:\/\//i.test(configuration.contestUrl.trim()) ||
        !/^https?:$/.test(url.protocol) || !url.hostname) {
      throw new Error("Invalid contest URL");
    }
  } catch {
    errors.contestUrl = "Enter a valid contest URL starting with http:// or https://.";
  }

  const durationMinutes = Number(duration);
  const freezeMinutes = Number(freeze);
  if (!/^\d+$/.test(duration) || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0) {
    errors.duration = "Duration must be a positive whole number of minutes.";
  }
  if (!/^\d+$/.test(freeze) || !Number.isSafeInteger(freezeMinutes) || freezeMinutes < 0) {
    errors.freeze = "Freezing time must be a non-negative whole number of minutes.";
  } else if (!errors.duration && freezeMinutes > durationMinutes) {
    errors.freeze = "Freezing time cannot exceed the contest duration.";
  }

  if (!parseUtcDateTimeInputValue(configuration.startAtUtc)) {
    errors.start = "Choose a valid contest start date and time.";
  } else if (!errors.duration) {
    const endDate = calculateContestEndDate(configuration.startAtUtc, durationMinutes);
    if (!endDate || !Number.isFinite(endDate.getTime())) {
      errors.duration = "Choose a duration that produces a valid contest end date.";
    }
  }

  if (!CODEFORCES_SCOREBOARD_PARTICIPANT_TYPES.some((type) =>
    configuration.includedParticipantTypes.includes(type)
  )) {
    errors.participants = "Select at least one scoreboard participant type.";
  }

  return errors;
}
