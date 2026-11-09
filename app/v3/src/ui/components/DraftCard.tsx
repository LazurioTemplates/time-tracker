import { type DraftPanelInput, deriveDraftPanel } from "@lazurio/repository-db";
import { Badge, Button } from "design-system/react";
import { useCallback, useEffect, useState } from "react";
import { api, subscribe } from "../api.ts";
import { errorText, useApp } from "../context.ts";
import { Notice } from "./common.tsx";

/**
 * The Draft & Publish card. What the card may offer is the engine's
 * (`deriveDraftPanel` of repository-db: the state, the records, which actions
 * are open); the words are the App's, in its language, because the engine's
 * own card speaks Czech only. The records are worded by the App's review
 * adapter. Conflicts are resolved by an agent or a developer, never here.
 */

/** The engine marks a value that is not there with a dash. */
const shown = (value: string) => value !== "" && value !== "—";

const TONE = {
  published: "success",
  draft: "warning",
  sending: "info",
  remote: "info",
  conflict: "danger",
  unavailable: "danger",
} as const;

export function DraftCard() {
  const { changed, t, language } = useApp();
  const [card, setCard] = useState<DraftPanelInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      setCard(await api.draft());
    } catch (caught) {
      setError(errorText(t, caught));
    }
  }, [t]);

  useEffect(() => {
    void load();
    return subscribe(() => void load());
  }, [load]);

  if (!card)
    return error ? (
      <Notice tone="error">{error}</Notice>
    ) : (
      <p className="ds-type-meta">{t.loading}</p>
    );
  const model = deriveDraftPanel(card);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setConfirm(false);
      await changed();
      await load();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  };
  const perform = (kind: string) => {
    if (kind === "publish") return run(() => api.publish(model.revision));
    if (kind === "discard_draft") return setConfirm(true);
    if (kind === "finish_send") return run(() => api.finishSend(model.pendingHead ?? ""));
    if (kind === "pull") return run(() => api.pull());
  };
  const actions = model.actions.filter((action) => t.draftCard.action[action.kind]);

  return (
    <section className="ds-card tt-draft" aria-labelledby="draft-state">
      <p className="tt-draft__state" id="draft-state">
        <Badge tone={TONE[model.tone]}>{t.draftCard.headline[model.tone]}</Badge>
      </p>
      {model.records.length > 0 ? (
        <p className="ds-type-body-sm">{t.draftCard.wholeDraft}</p>
      ) : null}
      {model.conflict ? (
        <Notice tone="error" title={t.draftCard.conflictHelp}>
          {model.conflict.handoff ? (
            <pre className="tt-handoff">{model.conflict.handoff}</pre>
          ) : null}
        </Notice>
      ) : null}
      {model.records.length === 0 ? (
        <p className="ds-type-meta">{t.draftCard.nothing}</p>
      ) : (
        <ul className="tt-draft__records">
          {model.records.map((record) => (
            <li key={record.id} className="tt-draft__record">
              <div className="tt-draft__head">
                <Badge icon={false}>{record.typeLabel}</Badge>
                <strong>{record.label}</strong>
                <span className="ds-type-meta">{record.summary}</span>
                <span className="tt-grow" />
                {record.href ? (
                  <Button variant="quiet" size="sm" href={record.href}>
                    {t.draftCard.open}
                  </Button>
                ) : null}
                {record.revertSupported ? (
                  <Button
                    variant="quiet"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api.discard({ kind: "record", path: record.technicalPath }, model.revision),
                      )
                    }
                  >
                    {t.draftCard.returnRecord}
                  </Button>
                ) : null}
              </div>
              {record.fields.length > 0 ? (
                <dl className="tt-draft__fields">
                  {record.fields.map((field) => (
                    <div key={field.fieldPath}>
                      <dt>{field.label}</dt>
                      <dd>
                        {shown(field.before) ? <del>{field.before}</del> : null}
                        {shown(field.before) && shown(field.after) ? " → " : null}
                        {shown(field.after) ? <ins>{field.after}</ins> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="tt-actions">
        {confirm ? (
          <>
            <span className="ds-type-body-sm">{t.draftCard.confirmDiscard}</span>
            <Button onClick={() => setConfirm(false)}>{t.draftCard.keep}</Button>
            <Button
              variant="danger"
              busy={busy}
              locale={language}
              onClick={() => void run(() => api.discard({ kind: "draft" }, model.revision))}
            >
              {t.draftCard.yesDiscard}
            </Button>
          </>
        ) : (
          actions.map((action) => (
            <Button
              key={action.kind}
              // The one primary action is publishing; returning everything turns
              // red only in its confirmation.
              variant={action.kind === "publish" ? "primary" : "secondary"}
              busy={busy && action.kind === "publish"}
              locale={language}
              disabled={busy || !action.enabled}
              onClick={() => void perform(action.kind)}
            >
              {t.draftCard.action[action.kind]}
            </Button>
          ))
        )}
      </div>
    </section>
  );
}
