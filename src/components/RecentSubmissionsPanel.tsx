import { RecentSubmission } from "../domain/types";
import { Panel } from "./Panel";

interface RecentSubmissionsPanelProps {
  submissions: RecentSubmission[];
}

export function RecentSubmissionsPanel({
  submissions
}: RecentSubmissionsPanelProps) {
  return (
    <Panel title="Latest Submissions" eyebrow="Frozen feed">
      <ul className="submission-list">
        {submissions.map((submission) => (
          <li className="submission-list__item" key={submission.id}>
            <span className="submission-list__minute">{submission.contestMinute}</span>
            <div className="submission-list__body">
              <p className="submission-list__team">{submission.teamName}</p>
              <p className="submission-list__summary">
                Problem {submission.problemLabel} • {submission.summary}
              </p>
            </div>
            <span
              className={`submission-list__badge submission-list__badge--${submission.kind}`}
            >
              {submission.problemLabel}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
