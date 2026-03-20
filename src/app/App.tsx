import { useEffect, useMemo, useState } from "react";
import { ContestSetupScreen } from "../components/ContestSetupScreen";
import { RecentSubmissionsPanel } from "../components/RecentSubmissionsPanel";
import { ScoreboardTable } from "../components/ScoreboardTable";
import { TimerPanel } from "../components/TimerPanel";
import {
  AppRoute,
  CREATE_CONTEST_PATH,
  SCOREBOARD_PREVIEW_CONTEST_ID,
  buildScoreboardPath,
  extractContestIdFromContestUrl,
  parseAppRoute
} from "./routes";
import {
  createConfiguredContestPreview,
  createDefaultContestConfiguration,
  formatUtcSummary
} from "../domain/contestConfiguration";
import { useContestSnapshot } from "../hooks/useContestSnapshot";
import "./App.css";

export function App() {
  const { snapshot, loading, error } = useContestSnapshot();
  const [route, setRoute] = useState<AppRoute>(() =>
    parseAppRoute(window.location.pathname)
  );
  const [configuration, setConfiguration] = useState(() =>
    createDefaultContestConfiguration()
  );
  const previewSnapshot = useMemo(
    () =>
      snapshot
        ? createConfiguredContestPreview(snapshot, configuration)
        : null,
    [snapshot, configuration]
  );
  const shareableScoreboardPath = useMemo(() => {
    const configuredContestId = extractContestIdFromContestUrl(
      configuration.contestUrl
    );

    if (configuredContestId) {
      return buildScoreboardPath(configuredContestId);
    }

    if (route.screen === "scoreboard") {
      return buildScoreboardPath(route.contestId);
    }

    return buildScoreboardPath(SCOREBOARD_PREVIEW_CONTEST_ID);
  }, [configuration.contestUrl, route]);

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
            onClick={() => navigate(CREATE_CONTEST_PATH)}
          >
            Go to Create Contest
          </button>
        </div>
      </main>
    );
  }

  if (route.screen === "setup") {
    return (
      <main className="app">
        <div className="app__backdrop" />
        <ContestSetupScreen
          configuration={configuration}
          shareableScoreboardPath={shareableScoreboardPath}
          isScoreboardLoading={loading}
          scoreboardError={error}
          onChange={setConfiguration}
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
            onClick={() => navigate(CREATE_CONTEST_PATH)}
          >
            Back to Create Contest
          </button>
        </div>
      </main>
    );
  }

  if (error || !previewSnapshot) {
    return (
      <main className="app app--loading">
        <div className="app__backdrop" />
        <div className="loading-card loading-card--error">
          <h1>Unable to load the contest</h1>
          <p>{error ?? "Missing contest snapshot."}</p>
          <button
            className="secondary-button"
            onClick={() => navigate(CREATE_CONTEST_PATH)}
          >
            Back to Create Contest
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
          <button
            className="secondary-button"
            onClick={() => navigate(CREATE_CONTEST_PATH)}
          >
            Back to Create Contest
          </button>

          <div className="scoreboard-toolbar__summary">
            <span className="scoreboard-toolbar__chip">Contest {route.contestId}</span>
            <span className="scoreboard-toolbar__chip">
              {configuration.problems.length} problems
            </span>
            <span className="scoreboard-toolbar__chip">
              {formatUtcSummary(configuration.startAtUtc)}
            </span>
          </div>
        </header>

        <div className="app__layout">
          <aside className="app__sidebar">
            <TimerPanel snapshot={previewSnapshot} />
            <RecentSubmissionsPanel
              submissions={previewSnapshot.recentSubmissions}
              teams={previewSnapshot.teams}
            />
          </aside>
          <section className="app__main">
            <header className="scoreboard-header">
              <div>
                <p className="scoreboard-header__eyebrow">{previewSnapshot.contestName}</p>
                <h1 className="scoreboard-header__title">{previewSnapshot.regionName}</h1>
              </div>
            </header>

            <ScoreboardTable
              problems={previewSnapshot.problems}
              teams={previewSnapshot.teams}
            />

            <footer className="scoreboard-footer">
              <span>{previewSnapshot.freezeLabel}</span>
              <span>{previewSnapshot.updatedAtLabel}</span>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
