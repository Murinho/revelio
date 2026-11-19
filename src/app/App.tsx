import { useEffect, useMemo, useState } from "react";
import { ContestSetupScreen } from "../components/ContestSetupScreen";
import { MainMenuScreen } from "../components/MainMenuScreen";
import { RecentSubmissionsPanel } from "../components/RecentSubmissionsPanel";
import { ScoreboardTable } from "../components/ScoreboardTable";
import { TimerPanel } from "../components/TimerPanel";
import { UnfreezeScreen } from "../components/UnfreezeScreen";
import {
  AppRoute,
  buildUnfreezePath,
  CREATE_CONTEST_PATH,
  HOME_PATH,
  buildScoreboardPath,
  parseAppRoute,
  resolveContestId
} from "./routes";
import {
  cloneContestConfiguration,
  createDefaultContestConfiguration,
  formatLocalStartSummary
} from "../domain/contestConfiguration";
import {
  createManagedContest,
  createMockManagedContests,
  ManagedContest
} from "../domain/managedContest";
import { useContestClock } from "../hooks/useContestClock";
import { useContestSnapshot } from "../hooks/useContestSnapshot";
import "./App.css";

export function App() {
  const [route, setRoute] = useState<AppRoute>(() =>
    parseAppRoute(window.location.pathname)
  );
  const [configuration, setConfiguration] = useState(() =>
    createDefaultContestConfiguration()
  );
  const [editingContestId, setEditingContestId] = useState<string | null>(null);
  const [managedContests, setManagedContests] = useState<ManagedContest[]>(() =>
    createMockManagedContests()
  );
  const targetContest =
    route.screen === "unfreeze"
      ? managedContests.find((contest) => contest.id === route.contestId) ?? null
      : null;
  const activeConfiguration =
    route.screen === "scoreboard"
      ? configuration
      : route.screen === "unfreeze"
        ? targetContest?.configuration ?? null
        : null;
  const contestClock = useContestClock(activeConfiguration);
  const { snapshot, loading, error } = useContestSnapshot(activeConfiguration, {
    elapsedSeconds: contestClock.elapsedSeconds,
    live: route.screen === "scoreboard"
  });
  const firstToSolveTwinkleMinute = getFirstToSolveTwinkleMinute(
    contestClock.elapsedSeconds,
    contestClock.phase
  );
  const shareableScoreboardPath = useMemo(() => {
    const contestId = resolveContestId({
      contestUrl: configuration.contestUrl,
      contestName: configuration.contestName,
      fallbackContestId:
        route.screen === "scoreboard" ? route.contestId : editingContestId
    });

    return buildScoreboardPath(contestId);
  }, [configuration.contestName, configuration.contestUrl, editingContestId, route]);

  useEffect(() => {
    function handlePopState() {
      setRoute(parseAppRoute(window.location.pathname));
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (window.location.pathname !== route.path) {
      window.history.replaceState(null, "", route.path);
    }
  }, [route.path]);

  function navigate(nextPath: string) {
    const nextRoute = parseAppRoute(nextPath);

    if (window.location.pathname !== nextRoute.path) {
      window.history.pushState(null, "", nextRoute.path);
    }

    setRoute(nextRoute);
  }

  function handleCreateContest() {
    setEditingContestId(null);
    setConfiguration(createDefaultContestConfiguration());
    navigate(CREATE_CONTEST_PATH);
  }

  function handleOpenScoreboard(contest: ManagedContest) {
    setEditingContestId(contest.id);
    setConfiguration(cloneContestConfiguration(contest.configuration));
    navigate(buildScoreboardPath(contest.id));
  }

  function handleOpenUnfreeze(contest: ManagedContest) {
    setEditingContestId(contest.id);
    setConfiguration(cloneContestConfiguration(contest.configuration));
    navigate(buildUnfreezePath(contest.id));
  }

  function handleEditContest(contest: ManagedContest) {
    setEditingContestId(contest.id);
    setConfiguration(cloneContestConfiguration(contest.configuration));
    navigate(CREATE_CONTEST_PATH);
  }

  function handleDeleteContest(contest: ManagedContest) {
    const shouldDelete = window.confirm(
      `Delete "${contest.configuration.contestName}" from the main menu?`
    );

    if (!shouldDelete) {
      return;
    }

    setManagedContests((currentContests) =>
      currentContests.filter((currentContest) => currentContest.id !== contest.id)
    );

    if (editingContestId === contest.id) {
      setEditingContestId(null);
    }
  }

  function handleSaveContest() {
    const contestId = resolveContestId({
      contestUrl: configuration.contestUrl,
      contestName: configuration.contestName,
      fallbackContestId: editingContestId
    });
    const nextManagedContest = createManagedContest(contestId, configuration);

    setManagedContests((currentContests) => [
      nextManagedContest,
      ...currentContests.filter(
        (currentContest) =>
          currentContest.id !== contestId &&
          currentContest.id !== editingContestId
      )
    ]);
    setEditingContestId(contestId);
  }

  if (route.screen === "not-found") {
    return (
      <main className="app app--loading">
        <div className="app__backdrop" />
        <div className="loading-card loading-card--error">
          <h1>Route not found</h1>
          <p>
            <code>{route.path}</code> does not match a Revelio window yet.
          </p>
          <button
            className="secondary-button"
            onClick={() => navigate(HOME_PATH)}
          >
            Go to Main Menu
          </button>
        </div>
      </main>
    );
  }

  if (route.screen === "home") {
    return (
      <main className="app">
        <div className="app__backdrop" />
        <MainMenuScreen
          userName="Adria"
          contests={managedContests}
          onCreateContest={handleCreateContest}
          onOpenScoreboard={handleOpenScoreboard}
          onOpenUnfreeze={handleOpenUnfreeze}
          onEditContest={handleEditContest}
          onDeleteContest={handleDeleteContest}
        />
      </main>
    );
  }

  if (route.screen === "unfreeze") {
    if (!targetContest) {
      return (
        <main className="app app--loading">
          <div className="app__backdrop" />
          <div className="loading-card loading-card--error">
            <h1>Contest not available</h1>
            <p>
              No saved contest configuration was found for <code>{route.contestId}</code>.
            </p>
            <button
              className="secondary-button"
              onClick={() => navigate(HOME_PATH)}
            >
              Back to Home
            </button>
          </div>
        </main>
      );
    }

    if (loading) {
      return (
        <main className="app app--loading">
          <div className="app__backdrop" />
          <div className="loading-card">
            <div className="loading-card__logo">R</div>
            <h1>Preparing unfreeze replay...</h1>
            <p>Loading the frozen scoreboard state and reveal queue.</p>
            <button
              className="secondary-button"
              onClick={() => navigate(HOME_PATH)}
            >
              Back to Home
            </button>
          </div>
        </main>
      );
    }

    if (error || !snapshot) {
      return (
        <main className="app app--loading">
          <div className="app__backdrop" />
          <div className="loading-card loading-card--error">
            <h1>Unable to open unfreeze replay</h1>
            <p>{error ?? "Missing contest snapshot."}</p>
            <button
              className="secondary-button"
              onClick={() => navigate(HOME_PATH)}
            >
              Back to Home
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="app app--unfreeze">
        <div className="app__backdrop" />
        <UnfreezeScreen
          snapshot={snapshot}
          onMainMenu={() => navigate(HOME_PATH)}
        />
      </main>
    );
  }

  if (route.screen === "setup") {
    return (
      <main className="app">
        <div className="app__backdrop" />
        <ContestSetupScreen
          isEditing={editingContestId !== null}
          configuration={configuration}
          shareableScoreboardPath={shareableScoreboardPath}
          onChange={setConfiguration}
          onBack={() => navigate(HOME_PATH)}
          onSave={handleSaveContest}
          onProceed={() => navigate(shareableScoreboardPath)}
        />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="app app--loading">
        <div className="app__backdrop" />
        <div className="loading-card">
          <div className="loading-card__logo">R</div>
          <h1>Loading Revelio UI...</h1>
          <p>Preparing the scoreboard preview and submission feed.</p>
          <button
            className="secondary-button"
            onClick={() => navigate(HOME_PATH)}
          >
            Back to Main Menu
          </button>
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="app app--loading">
        <div className="app__backdrop" />
        <div className="loading-card loading-card--error">
          <h1>Unable to load the contest</h1>
          <p>{error ?? "Missing contest snapshot."}</p>
          <button
            className="secondary-button"
            onClick={() => navigate(HOME_PATH)}
          >
            Back to Main Menu
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="app__backdrop" />
      <div className="app__scoreboard">
        <header className="scoreboard-toolbar">
          <div className="scoreboard-toolbar__actions">
            <button
              className="secondary-button"
              onClick={() => navigate(HOME_PATH)}
            >
              Back to Main Menu
            </button>
            <button
              className="secondary-button"
              onClick={() => navigate(CREATE_CONTEST_PATH)}
            >
              Edit Contest
            </button>
          </div>

          <div className="scoreboard-toolbar__summary">
            <span className="scoreboard-toolbar__chip">Contest {route.contestId}</span>
            <span className="scoreboard-toolbar__chip">
              {snapshot.problems.length} problems
            </span>
            <span className="scoreboard-toolbar__chip">
              {formatLocalStartSummary(configuration.startAtUtc)}
            </span>
          </div>
        </header>

        <div className="app__layout">
          <aside className="app__sidebar">
            <TimerPanel clock={contestClock} snapshot={snapshot} />
            <RecentSubmissionsPanel
              problems={snapshot.problems}
              submissions={snapshot.recentSubmissions}
              teams={snapshot.teams}
            />
          </aside>
          <section className="app__main">
            <header className="scoreboard-header">
              <div>
                <p className="scoreboard-header__eyebrow">{snapshot.contestName}</p>
                <h1 className="scoreboard-header__title">{snapshot.regionName}</h1>
              </div>
            </header>

            <ScoreboardTable
              firstToSolveTwinkleMinute={firstToSolveTwinkleMinute}
              problems={snapshot.problems}
              teams={snapshot.teams}
            />

            <footer className="scoreboard-footer">
              <span>{snapshot.freezeLabel}</span>
              <span>{snapshot.updatedAtLabel}</span>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}

function getFirstToSolveTwinkleMinute(
  elapsedSeconds: number,
  phase: ReturnType<typeof useContestClock>["phase"]
): number | null {
  const isContestRunning = phase === "play" || phase === "frozen";

  if (!isContestRunning || elapsedSeconds < 60) {
    return null;
  }

  const secondsSinceFullMinute = elapsedSeconds % 60;

  if (secondsSinceFullMinute >= 5) {
    return null;
  }

  return Math.floor(elapsedSeconds / 60);
}
