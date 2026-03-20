import { Panel } from "./Panel";
import {
  ContestTimelineBucket,
  getContestTimelineBucket,
  ManagedContest
} from "../domain/managedContest";
import {
  formatDurationClock,
  formatUtcSummary
} from "../domain/contestConfiguration";
import { buildScoreboardPath } from "../app/routes";
import "./MainMenuScreen.css";

interface MainMenuScreenProps {
  userName: string;
  contests: ManagedContest[];
  onCreateContest: () => void;
  onOpenScoreboard: (contest: ManagedContest) => void;
  onEditContest: (contest: ManagedContest) => void;
  onDeleteContest: (contest: ManagedContest) => void;
}

const SECTION_COPY: Record<
  ContestTimelineBucket,
  { eyebrow: string; title: string; description: string; statusLabel: string }
> = {
  current: {
    eyebrow: "Running Now",
    title: "Current Contests",
    description: "The contests that are live right now and ready for quick scoreboard access.",
    statusLabel: "Live"
  },
  future: {
    eyebrow: "On Deck",
    title: "Future Contests",
    description: "Upcoming events queued for launch once their start times arrive.",
    statusLabel: "Upcoming"
  },
  past: {
    eyebrow: "Archive",
    title: "Past Contests",
    description: "Recent contests you can still inspect, revisit, or reuse as templates.",
    statusLabel: "Past"
  }
};

export function MainMenuScreen({
  userName,
  contests,
  onCreateContest,
  onOpenScoreboard,
  onEditContest,
  onDeleteContest
}: MainMenuScreenProps) {
  const groupedContests = {
    current: sortContests(
      contests.filter((contest) => getContestTimelineBucket(contest) === "current"),
      "current"
    ),
    future: sortContests(
      contests.filter((contest) => getContestTimelineBucket(contest) === "future"),
      "future"
    ),
    past: sortContests(
      contests.filter((contest) => getContestTimelineBucket(contest) === "past"),
      "past"
    )
  };

  return (
    <div className="menu-layout">
      <aside className="menu-sidebar">
        <section className="panel menu-hero-panel">
          <div className="panel__content menu-hero-panel__content">
            <span className="menu-hero-panel__badge">Contest Operations Hub</span>
            <div className="menu-user-card">
              <div className="menu-user-card__avatar">{getInitials(userName)}</div>
              <div>
                <p className="menu-user-card__eyebrow">Signed in as</p>
                <h1 className="menu-user-card__name">{userName}</h1>
              </div>
            </div>

            <div className="menu-hero-panel__copy">
              <p className="menu-hero-panel__eyebrow">Revelio</p>
              <h2 className="menu-hero-panel__title">Arena Command Center</h2>
              <p className="menu-hero-panel__description">
                Launch new contests, keep live events within reach, and manage the
                scoreboard pipeline from one polished home surface.
              </p>
            </div>

            <button
              className="menu-primary-button"
              type="button"
              onClick={onCreateContest}
            >
              Create Contest
            </button>
          </div>
        </section>

        <Panel title="Control Snapshot" eyebrow="Overview" className="menu-panel">
          <div className="menu-summary-list">
            <div className="menu-summary-row">
              <span className="menu-summary-row__label">Live scoreboards</span>
              <strong className="menu-summary-row__value">
                {groupedContests.current.length === 0
                  ? "No active scoreboard right now"
                  : `${groupedContests.current.length} running contest${
                      groupedContests.current.length === 1 ? "" : "s"
                    }`}
              </strong>
            </div>
            <div className="menu-summary-row">
              <span className="menu-summary-row__label">Upcoming launches</span>
              <strong className="menu-summary-row__value">
                {groupedContests.future.length} contest
                {groupedContests.future.length === 1 ? "" : "s"} waiting in the queue
              </strong>
            </div>
            <div className="menu-summary-row">
              <span className="menu-summary-row__label">Recent archive</span>
              <strong className="menu-summary-row__value">
                {groupedContests.past.length} past contest
                {groupedContests.past.length === 1 ? "" : "s"} ready for replay
              </strong>
            </div>
          </div>
        </Panel>
      </aside>

      <section className="menu-main">
        <header className="menu-header">
          <div>
            <p className="menu-header__eyebrow">Revelio Dashboard</p>
            <h2 className="menu-header__title">Contest Management Main Menu</h2>
            <p className="menu-header__description">
              Use the lists below to jump into a scoreboard, tune settings, or retire
              a contest entry while keeping the same broadcast-style UI language as the
              preview surfaces.
            </p>
          </div>

          <div className="menu-header__chips" aria-label="Contest overview">
            <span className="menu-header__chip">
              {groupedContests.current.length} Live
            </span>
            <span className="menu-header__chip">
              {groupedContests.future.length} Future
            </span>
            <span className="menu-header__chip">{groupedContests.past.length} Past</span>
          </div>
        </header>

        <div className="menu-sections">
          <ContestSection
            bucket="current"
            contests={groupedContests.current}
            onOpenScoreboard={onOpenScoreboard}
            onEditContest={onEditContest}
            onDeleteContest={onDeleteContest}
          />
          <ContestSection
            bucket="future"
            contests={groupedContests.future}
            onOpenScoreboard={onOpenScoreboard}
            onEditContest={onEditContest}
            onDeleteContest={onDeleteContest}
          />
          <ContestSection
            bucket="past"
            contests={groupedContests.past}
            onOpenScoreboard={onOpenScoreboard}
            onEditContest={onEditContest}
            onDeleteContest={onDeleteContest}
          />
        </div>
      </section>
    </div>
  );
}

interface ContestSectionProps {
  bucket: ContestTimelineBucket;
  contests: ManagedContest[];
  onOpenScoreboard: (contest: ManagedContest) => void;
  onEditContest: (contest: ManagedContest) => void;
  onDeleteContest: (contest: ManagedContest) => void;
}

function ContestSection({
  bucket,
  contests,
  onOpenScoreboard,
  onEditContest,
  onDeleteContest
}: ContestSectionProps) {
  const sectionCopy = SECTION_COPY[bucket];

  return (
    <Panel
      title={sectionCopy.title}
      eyebrow={sectionCopy.eyebrow}
      className="menu-panel menu-panel--table"
      actions={
        <span className={`menu-section-status menu-section-status--${bucket}`}>
          <span className="menu-section-status__dot" aria-hidden="true" />
          <span>{sectionCopy.statusLabel}</span>
        </span>
      }
    >
      <div className="menu-section-copy">
        <p>{sectionCopy.description}</p>
      </div>

      <div className="menu-contest-table" role="table" aria-label={sectionCopy.title}>
        <div className="menu-contest-table__head" role="row">
          <span>Contest</span>
          <span>Duration</span>
          <span>Freeze</span>
          <span>Scoreboard URL</span>
          <span>Actions</span>
        </div>

        {contests.length > 0 ? (
          contests.map((contest) => {
            const scoreboardPath = buildScoreboardPath(contest.id);

            return (
              <article className="menu-contest-row" role="row" key={contest.id}>
                <div className="menu-contest-row__contest">
                  <strong className="menu-contest-row__name">
                    {contest.configuration.contestName}
                  </strong>
                  <span className="menu-contest-row__meta">
                    {formatUtcSummary(contest.configuration.startAtUtc)}
                  </span>
                </div>

                <span className="menu-contest-row__cell">
                  {formatDurationClock(contest.configuration.durationMinutes)}
                </span>

                <span className="menu-contest-row__cell">
                  {formatDurationClock(contest.configuration.freezeDurationMinutes)}
                </span>

                <button
                  className="menu-contest-row__link"
                  type="button"
                  onClick={() => onOpenScoreboard(contest)}
                >
                  {scoreboardPath}
                </button>

                <div className="menu-contest-row__actions">
                  <button
                    className="secondary-button menu-action-button"
                    type="button"
                    onClick={() => onEditContest(contest)}
                  >
                    Edit
                  </button>
                  <button
                    className="secondary-button menu-action-button menu-action-button--danger"
                    type="button"
                    onClick={() => onDeleteContest(contest)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="menu-empty-state">
            <p>No contests in this section yet.</p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function sortContests(
  contests: ManagedContest[],
  bucket: ContestTimelineBucket
): ManagedContest[] {
  return [...contests].sort((leftContest, rightContest) => {
    const leftStart = Date.parse(`${leftContest.configuration.startAtUtc}:00Z`);
    const rightStart = Date.parse(`${rightContest.configuration.startAtUtc}:00Z`);

    if (bucket === "past") {
      return rightStart - leftStart;
    }

    return leftStart - rightStart;
  });
}

function getInitials(userName: string): string {
  const initials = userName
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "R";
}
