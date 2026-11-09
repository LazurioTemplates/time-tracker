import { EmptyState } from "design-system/react";
import { useEffect, useState } from "react";
import type { RuleIssue } from "../../domain/rules.ts";
import { api } from "../api.ts";
import { DraftCard } from "../components/DraftCard.tsx";
import { PageHeader } from "../components/Layout.tsx";
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
      <section className="tt-page">
        <PageHeader title={t.draft.title} />
        <EmptyState title={t.draft.onlyAdmin} icon="lock" headingLevel={2} />
      </section>
    );

  return (
    <section className="tt-page">
      <PageHeader title={t.draft.title} description={t.draft.subtitle} />
      <DraftCard />
      <article className="ds-card tt-form">
        <h2 className="ds-type-title">{t.draft.check}</h2>
        {issues === null ? (
          <p className="ds-type-meta">{t.draft.checkUnavailable}</p>
        ) : issues.length === 0 ? (
          <p className="ds-type-body-sm tt-ok">{t.draft.checkOk}</p>
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
