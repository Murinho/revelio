import { RecentSubmissionsPanel } from "../components/RecentSubmissionsPanel";
import { ScoreboardTable } from "../components/ScoreboardTable";
import { TimerPanel } from "../components/TimerPanel";
import { useContestSnapshot } from "../hooks/useContestSnapshot";
import "./App.css";

export function App() {
  const { snapshot, loading, error } = useContestSnapshot();

  if (loading) {
    return (
      <main className="app app--loading">
        <div className="loading-card">
          <div className="loading-card__logo">R</div>
          <h1>Loading Revelio UI...</h1>
          <p>Preparing the frozen scoreboard and submission feed.</p>
        </div>
      </main>
    );
  }

  if (error || !snapshot) {
    return (
      <main className="app app--loading">
        <div className="loading-card loading-card--error">
          <h1>Unable to load the contest</h1>
          <p>{error ?? "Missing contest snapshot."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <div className="app__backdrop" />
      <div className="app__layout">
        <section className="app__main">
          <header className="scoreboard-header">
            <div>
              <p className="scoreboard-header__eyebrow">{snapshot.contestName}</p>
              <h1 className="scoreboard-header__title">{snapshot.regionName}</h1>
            </div>
          </header>

          <ScoreboardTable problems={snapshot.problems} teams={snapshot.teams} />

          <footer className="scoreboard-footer">
            <span>{snapshot.freezeLabel}</span>
            <span>{snapshot.updatedAtLabel}</span>
          </footer>
        </section>

        <aside className="app__sidebar">
          <TimerPanel snapshot={snapshot} />
          <RecentSubmissionsPanel submissions={snapshot.recentSubmissions} />
        </aside>
      </div>
    </main>
  );
}
