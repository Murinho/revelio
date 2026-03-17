import { useEffect, useMemo, useState } from "react";
import { ContestOverview } from "../components/ContestOverview";
import { RecentSubmissionsPanel } from "../components/RecentSubmissionsPanel";
import { RevealQueuePanel } from "../components/RevealQueuePanel";
import { ScoreboardTable } from "../components/ScoreboardTable";
import { TeamSpotlightCard } from "../components/TeamSpotlightCard";
import { useContestSnapshot } from "../hooks/useContestSnapshot";
import {
  getNextRevealCandidate,
  getQueuePreview,
  getSelectedTeam
} from "../utils/contest";
import "./App.css";

export function App() {
  const { snapshot, loading, error } = useContestSnapshot();
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isAutoRevealEnabled, setIsAutoRevealEnabled] = useState(false);

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const defaultTeam = getNextRevealCandidate(snapshot.teams) ?? snapshot.teams[0] ?? null;
    if (defaultTeam && !selectedTeamId) {
      setSelectedTeamId(defaultTeam.id);
    }
  }, [snapshot, selectedTeamId]);

  useEffect(() => {
    if (!snapshot || !isAutoRevealEnabled) {
      return;
    }

    const timer = window.setInterval(() => {
      const queue = getQueuePreview(snapshot.revealQueue);
      if (queue.length === 0) {
        return;
      }

      setSelectedTeamId((currentTeamId) => {
        const currentIndex = queue.findIndex((entry) => entry.teamId === currentTeamId);
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % queue.length;
        return queue[nextIndex].teamId;
      });
    }, 3500);

    return () => window.clearInterval(timer);
  }, [snapshot, isAutoRevealEnabled]);

  const selectedTeam = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    return getSelectedTeam(snapshot.teams, selectedTeamId);
  }, [snapshot, selectedTeamId]);

  if (loading) {
    return (
      <main className="app app--loading">
        <div className="loading-card">
          <div className="loading-card__logo">R</div>
          <h1>Loading Revelio UI...</h1>
          <p>Preparing the frozen scoreboard and reveal queue.</p>
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

  const queuePreview = getQueuePreview(snapshot.revealQueue);

  return (
    <main className="app">
      <div className="app__backdrop" />
      <div className="app__layout">
        <aside className="app__sidebar">
          <ContestOverview
            snapshot={snapshot}
            highlightedTeam={selectedTeam}
            onFocusNextTeam={() =>
              setSelectedTeamId((getNextRevealCandidate(snapshot.teams) ?? snapshot.teams[0]).id)
            }
            isAutoRevealEnabled={isAutoRevealEnabled}
            onToggleAutoReveal={() => setIsAutoRevealEnabled((value) => !value)}
          />
          <RevealQueuePanel entries={queuePreview} />
          <TeamSpotlightCard team={selectedTeam} />
          <RecentSubmissionsPanel submissions={snapshot.recentSubmissions} />
        </aside>

        <section className="app__main">
          <header className="scoreboard-header">
            <div>
              <p className="scoreboard-header__eyebrow">{snapshot.contestName}</p>
              <h1 className="scoreboard-header__title">{snapshot.regionName}</h1>
            </div>
            <div className="scoreboard-header__legend">
              <span className="legend-chip legend-chip--solved">Solved</span>
              <span className="legend-chip legend-chip--pending">Frozen</span>
              <span className="legend-chip legend-chip--failed">Failed</span>
              <span className="legend-chip legend-chip--untouched">Untouched</span>
            </div>
          </header>

          <ScoreboardTable
            problems={snapshot.problems}
            teams={snapshot.teams}
            selectedTeamId={selectedTeamId}
            onSelectTeam={setSelectedTeamId}
          />

          <footer className="scoreboard-footer">
            <span>{snapshot.updatedAtLabel}</span>
            <span>Designed for a future backend-driven reveal flow.</span>
          </footer>
        </section>
      </div>
    </main>
  );
}
