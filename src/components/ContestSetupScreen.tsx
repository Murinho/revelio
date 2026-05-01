import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  ContestConfiguration,
  MAX_PROBLEM_COUNT,
  formatFreezeWindowLabel,
  formatLocalStartSummary,
  formatLocalUtcOffset,
  resizeContestProblems,
  toLocalStartDateTimeInputValue,
  toUtcStartDateTimeInputValue
} from "../domain/contestConfiguration";
import { Panel } from "./Panel";
import "./ContestSetupScreen.css";

interface ContestSetupScreenProps {
  configuration: ContestConfiguration;
  shareableScoreboardPath: string;
  isScoreboardLoading: boolean;
  scoreboardError: string | null;
  onChange: (nextConfiguration: ContestConfiguration) => void;
  onBack: () => void;
  onProceed: () => void;
}

const problemCountOptions = Array.from(
  { length: MAX_PROBLEM_COUNT },
  (_, index) => index + 1
);

export function ContestSetupScreen({
  configuration,
  shareableScoreboardPath,
  isScoreboardLoading,
  scoreboardError,
  onChange,
  onBack,
  onProceed
}: ContestSetupScreenProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const problemCount = configuration.problems.length;
  const hasCredentials =
    configuration.codeforces.apiKey.trim().length > 0 &&
    configuration.codeforces.apiSecret.trim().length > 0;
  const hasContestUrl = configuration.contestUrl.trim().length > 0;
  const shareableScoreboardUrl = `${window.location.origin}${shareableScoreboardPath}`;
  const localStartAt = toLocalStartDateTimeInputValue(configuration.startAtUtc);
  const localUtcOffset = formatLocalUtcOffset(configuration.startAtUtc);
  const scoreboardStatus = scoreboardError
    ? "The contest feed could not be loaded from Codeforces. Double-check the URL or fall back to the mock preview for layout work."
    : isScoreboardLoading
      ? "The scoreboard is loading live Codeforces standings and submissions. You can keep adjusting the setup while it finishes."
      : hasContestUrl
        ? hasCredentials
          ? "The scoreboard will use signed Codeforces contest data behind this URL and apply your freeze window and balloon colors."
          : "Enter Codeforces API credentials to load the live standings and submissions behind this URL."
        : "The scoreboard preview is ready with mock data and will reflect your contest title, timing, problem count, and balloon palette.";

  function updateField<K extends keyof ContestConfiguration>(
    field: K,
    value: ContestConfiguration[K]
  ) {
    onChange({
      ...configuration,
      [field]: value
    });
  }

  function handleProblemCountChange(nextCount: number) {
    onChange({
      ...configuration,
      problems: resizeContestProblems(configuration.problems, nextCount)
    });
  }

  function handleDurationChange(nextDurationMinutes: number) {
    const safeDurationMinutes = Math.max(1, nextDurationMinutes);

    onChange({
      ...configuration,
      durationMinutes: safeDurationMinutes,
      freezeDurationMinutes: Math.min(
        configuration.freezeDurationMinutes,
        safeDurationMinutes
      )
    });
  }

  function handleProblemColorChange(index: number, balloonColor: string) {
    onChange({
      ...configuration,
      problems: configuration.problems.map((problem, problemIndex) =>
        problemIndex === index
          ? {
              ...problem,
              balloonColor
            }
          : problem
      )
    });
  }

  function handleApiKeyChange(apiKey: string) {
    onChange({
      ...configuration,
      codeforces: {
        ...configuration.codeforces,
        apiKey
      }
    });
  }

  function handleApiSecretChange(apiSecret: string) {
    onChange({
      ...configuration,
      codeforces: {
        ...configuration.codeforces,
        apiSecret
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onProceed();
  }

  async function handleCopyScoreboardUrl() {
    try {
      await navigator.clipboard.writeText(shareableScoreboardUrl);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 1800);
  }

  return (
    <div className="setup-layout">
      <aside className="setup-sidebar">
        <section className="panel setup-hero-panel">
          <div className="panel__content setup-hero-panel__content">
            <span className="setup-hero-panel__badge">Contest Control Room</span>
            <div className="setup-hero-panel__logo">R</div>
            <p className="setup-hero-panel__eyebrow">Revelio</p>
            <h1 className="setup-hero-panel__title">Create Contest</h1>
            <p className="setup-hero-panel__description">
              Configure the contest identity, local timing, balloon palette, and
              Codeforces credentials from one polished launch surface.
            </p>

            <div className="setup-hero-panel__stats">
              <article className="setup-stat-card">
                <span className="setup-stat-card__label">Problems</span>
                <strong className="setup-stat-card__value">{problemCount}</strong>
              </article>
              <article className="setup-stat-card">
                <span className="setup-stat-card__label">Duration</span>
                <strong className="setup-stat-card__value">
                  {configuration.durationMinutes} min
                </strong>
              </article>
              <article className="setup-stat-card">
                <span className="setup-stat-card__label">Freeze</span>
                <strong className="setup-stat-card__value">
                  {configuration.freezeDurationMinutes} min
                </strong>
              </article>
            </div>
          </div>
        </section>

        <Panel title="Launch Summary" eyebrow="Preview" className="setup-panel">
          <div className="setup-summary-list">
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Contest</span>
              <strong className="setup-summary-row__value">
                {configuration.contestName.trim() || "Untitled contest"}
              </strong>
            </div>
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Start</span>
              <strong className="setup-summary-row__value">
                {formatLocalStartSummary(configuration.startAtUtc)}
              </strong>
            </div>
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Freeze</span>
              <strong className="setup-summary-row__value">
                {formatFreezeWindowLabel(configuration.freezeDurationMinutes)}
              </strong>
            </div>
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Contest URL</span>
              <strong className="setup-summary-row__value">
                {configuration.contestUrl.trim() || "Not provided yet"}
              </strong>
            </div>
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Shareable Scoreboard</span>
              <div className="setup-summary-row__actions">
                <strong className="setup-summary-row__value setup-summary-row__value--mono">
                  {shareableScoreboardUrl}
                </strong>
                <button
                  className="secondary-button setup-copy-button"
                  type="button"
                  onClick={handleCopyScoreboardUrl}
                  aria-label={
                    copyState === "copied"
                      ? "Scoreboard URL copied"
                      : copyState === "error"
                        ? "Retry copying scoreboard URL"
                        : "Copy scoreboard URL"
                  }
                  title={
                    copyState === "copied"
                      ? "Copied"
                      : copyState === "error"
                        ? "Retry"
                        : "Copy URL"
                  }
                >
                  <svg
                    className="setup-copy-button__icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M9 9.75A2.25 2.25 0 0 1 11.25 7.5h7.5A2.25 2.25 0 0 1 21 9.75v9A2.25 2.25 0 0 1 18.75 21h-7.5A2.25 2.25 0 0 1 9 18.75v-9Z"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.7"
                    />
                    <path
                      d="M15 7.5V5.25A2.25 2.25 0 0 0 12.75 3h-7.5A2.25 2.25 0 0 0 3 5.25v9A2.25 2.25 0 0 0 5.25 16.5H9"
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.7"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div className="setup-summary-row">
              <span className="setup-summary-row__label">Codeforces Access</span>
              <strong className="setup-summary-row__value">
                {hasCredentials ? "Configured" : "Awaiting credentials"}
              </strong>
            </div>
          </div>
        </Panel>
      </aside>

      <section className="setup-main">
        <div className="setup-header__actions">
          <button className="secondary-button" type="button" onClick={onBack}>
            Back to Main Menu
          </button>
        </div>

        <form className="setup-form" onSubmit={handleSubmit}>
          <div className="setup-form__grid">
            <Panel title="Contest Profile" eyebrow="Identity" className="setup-panel">
              <div className="setup-fields">
                <label className="setup-field setup-field--full">
                  <span className="setup-field__label">Name of the contest</span>
                  <input
                    className="setup-input"
                    type="text"
                    value={configuration.contestName}
                    onChange={(event) => updateField("contestName", event.target.value)}
                    placeholder="Revelio Invitational"
                  />
                </label>

                <label className="setup-field setup-field--full">
                  <span className="setup-field__label">URL of the contest</span>
                  <input
                    className="setup-input"
                    type="url"
                    value={configuration.contestUrl}
                    onChange={(event) => updateField("contestUrl", event.target.value)}
                    placeholder="https://codeforces.com/gym/106416"
                    autoComplete="off"
                  />
                </label>
              </div>
            </Panel>

            <Panel title="Schedule & Rules" eyebrow="Timing" className="setup-panel">
              <div className="setup-fields">
                <label className="setup-field setup-field--full">
                  <span className="setup-field__label">
                    Start date and time of the contest
                  </span>
                  <span className="setup-field__hint">
                    Use your local timezone. Revelio stores the converted UTC time for
                    backend and API timestamps.
                  </span>
                  <div className="setup-input-wrap">
                    <input
                      className="setup-input"
                      type="datetime-local"
                      value={localStartAt}
                      onChange={(event) =>
                        updateField(
                          "startAtUtc",
                          toUtcStartDateTimeInputValue(event.target.value)
                        )
                      }
                    />
                    <span className="setup-input-wrap__badge">{localUtcOffset}</span>
                  </div>
                </label>

                <label className="setup-field">
                  <span className="setup-field__label">Duration</span>
                  <span className="setup-field__hint">Contest duration in minutes.</span>
                  <input
                    className="setup-input"
                    type="number"
                    min={1}
                    value={configuration.durationMinutes}
                    onChange={(event) =>
                      handleDurationChange(
                        Number.parseInt(event.target.value || "0", 10) || 1
                      )
                    }
                  />
                </label>

                <label className="setup-field">
                  <span className="setup-field__label">Freezing Time</span>
                  <span className="setup-field__hint">Minutes hidden at the end.</span>
                  <input
                    className="setup-input"
                    type="number"
                    min={0}
                    max={configuration.durationMinutes}
                    value={configuration.freezeDurationMinutes}
                    onChange={(event) =>
                      updateField(
                        "freezeDurationMinutes",
                        Math.max(0, Number.parseInt(event.target.value || "0", 10) || 0)
                      )
                    }
                  />
                </label>

                <label className="setup-field">
                  <span className="setup-field__label">Amount of Problems</span>
                  <span className="setup-field__hint">Controls the balloon palette below.</span>
                  <select
                    className="setup-input"
                    value={problemCount}
                    onChange={(event) =>
                      handleProblemCountChange(Number.parseInt(event.target.value, 10))
                    }
                  >
                    {problemCountOptions.map((option) => (
                      <option key={option} value={option}>
                        {option} problems
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Panel>

            <Panel
              title="Problem Balloons"
              eyebrow="Palette"
              className="setup-panel setup-panel--wide"
            >
              <div className="setup-problem-grid">
                {configuration.problems.map((problem, index) => (
                  <label className="problem-palette-card" key={problem.id}>
                    <span className="problem-palette-card__preview">
                      <span
                        className="balloon balloon--round"
                        style={
                          { "--balloon-color": problem.balloonColor } as CSSProperties
                        }
                      />
                      <span className="problem-palette-card__balloon-label balloon__text">
                        {problem.label}
                      </span>
                    </span>

                    <span className="problem-palette-card__meta">
                      <span className="problem-palette-card__title">
                        Problem {problem.label}
                      </span>
                      <span className="problem-palette-card__hex">
                        {problem.balloonColor.toUpperCase()}
                      </span>
                    </span>

                    <input
                      className="problem-palette-card__picker"
                      type="color"
                      value={problem.balloonColor}
                      onChange={(event) =>
                        handleProblemColorChange(index, event.target.value)
                      }
                      aria-label={`Select balloon color for problem ${problem.label}`}
                    />
                  </label>
                ))}
              </div>
            </Panel>

            <Panel
              title="Codeforces Access"
              eyebrow="Private Mashup"
              className="setup-panel"
            >
              <div className="setup-fields">
                <label className="setup-field setup-field--full">
                  <span className="setup-field__label">API Key</span>
                  <input
                    className="setup-input setup-input--token"
                    type="text"
                    value={configuration.codeforces.apiKey}
                    onChange={(event) => handleApiKeyChange(event.target.value)}
                    placeholder="Enter the Codeforces API key"
                    autoComplete="off"
                  />
                </label>

                <label className="setup-field setup-field--full">
                  <span className="setup-field__label">API Secret</span>
                  <input
                    className="setup-input setup-input--token"
                    type="password"
                    value={configuration.codeforces.apiSecret}
                    onChange={(event) => handleApiSecretChange(event.target.value)}
                    placeholder="Enter the Codeforces API secret"
                    autoComplete="off"
                  />
                </label>
              </div>
            </Panel>
          </div>

          <section className="panel setup-submit-panel">
            <div className="setup-submit-panel__content">
              <div className="setup-submit-panel__copy">
                <p className="setup-submit-panel__eyebrow">Next Step</p>
                <h3 className="setup-submit-panel__title">
                  Proceed to the scoreboard window
                </h3>
                <p className="setup-submit-panel__description">
                  {scoreboardStatus}
                </p>
              </div>

              <button className="setup-submit-panel__button" type="submit">
                {isScoreboardLoading
                  ? "Open Scoreboard When Ready"
                  : "Proceed to Scoreboard"}
              </button>
            </div>
          </section>
        </form>
      </section>
    </div>
  );
}
