import { useEffect, useState } from "react";
import type { RuleIssue } from "../../domain/rules.ts";
import { api } from "../api.ts";
import { DraftCard } from "../components/DraftCard.tsx";
import { useApp } from "../context.ts";

/**
 * Draft & Publish, the application admin's: every changed record, publishing
 * the whole draft as one change of the Organization's data repository or
 * returning it, and the data check.
 */
export function DraftPage() {
  const { session, version, t } = useApp();
  const [issues, setIssues] = useState<RuleIssue[] | null>(null);
  const admin = session.viewer.role === "admin";

  useEffect(() => {
    if (!admin || version < 0) return;
    api.check().then(setIssues, () => setIssues(null));
  }, [admin, version]);

  if (!admin)
    return (
      <section>
        <h1>{t.draft.title}</h1>
        <p>{t.draft.onlyAdmin}</p>
      </section>
    );

  return (
    <section>
      <header className="page-header">
        <div>
          <h1>{t.draft.title}</h1>
          <p>{t.draft.subtitle}</p>
        </div>
      </header>
      <DraftCard />
      <article className="card">
        <h2 className="tt-card-title">{t.draft.check}</h2>
        {issues === null ? (
          <p className="tt-muted">{t.draft.checkUnavailable}</p>
        ) : issues.length === 0 ? (
          <p className="tt-ok">{t.draft.checkOk}</p>
        ) : (
          <ul className="tt-issues">
            {issues.map((issue) => (
              <li key={`${issue.record}:${issue.message}`}>
                <code>{issue.record}</code> {issue.message}
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
