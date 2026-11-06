import { type DraftPanelInput, deriveDraftPanel } from "@lazurio/repository-db";
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
export function DraftCard() {
  const { changed, t } = useApp();
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
    return error ? <Notice tone="error">{error}</Notice> : <p className="tt-muted">{t.loading}</p>;
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
    <div className={`card tt-draft-card tt-tone-${model.tone}`}>
      <p className="tt-draft-headline">
        <span className="tt-draft-dot" aria-hidden="true" />
        {t.draftCard.headline[model.tone]}
      </p>
      {model.records.length > 0 ? <p className="tt-muted">{t.draftCard.wholeDraft}</p> : null}
      {model.conflict ? (
        <div className="notice notice-error">
          <p>{t.draftCard.conflictHelp}</p>
          {model.conflict.handoff ? (
            <pre className="tt-handoff">{model.conflict.handoff}</pre>
          ) : null}
        </div>
      ) : null}
      {model.records.length === 0 ? (
        <p className="tt-muted">{t.draftCard.nothing}</p>
      ) : (
        <ul className="tt-draft-records">
          {model.records.map((record) => (
            <li key={record.id} className="tt-draft-record">
              <div className="tt-draft-record-head">
                <span className="badge badge-draft">{record.typeLabel}</span>
                <strong>{record.label}</strong>
                <span className="tt-muted tt-small">{record.summary}</span>
                <span className="tt-grow" />
                {record.href ? (
                  <a className="btn btn-ghost btn-compact" href={record.href}>
                    {t.draftCard.open}
                  </a>
                ) : null}
                {record.revertSupported ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-compact"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        api.discard({ kind: "record", path: record.technicalPath }, model.revision),
                      )
                    }
                  >
                    {t.draftCard.returnRecord}
                  </button>
                ) : null}
              </div>
              {record.fields.length > 0 ? (
                <dl className="tt-draft-fields">
                  {record.fields.map((field) => (
                    <div key={field.fieldPath}>
                      <dt>{field.label}</dt>
                      <dd>
                        {field.before ? <del>{field.before}</del> : null}
                        {field.before && field.after ? " → " : null}
                        {field.after ? <ins>{field.after}</ins> : null}
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
      <div className="tt-draft-actions">
        {confirm ? (
          <>
            <span className="tt-muted">{t.draftCard.confirmDiscard}</span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void run(() => api.discard({ kind: "draft" }, model.revision))}
            >
              {t.draftCard.yesDiscard}
            </button>
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              {t.draftCard.keep}
            </button>
          </>
        ) : (
          actions.map((action) => (
            <button
              key={action.kind}
              type="button"
              className={`btn${action.kind === "publish" ? " btn-primary" : action.destructive ? " btn-danger" : ""}`}
              disabled={busy || !action.enabled}
              onClick={() => void perform(action.kind)}
            >
              {t.draftCard.action[action.kind]}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
