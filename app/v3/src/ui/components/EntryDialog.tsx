import { type FormEvent, useEffect, useRef, useState } from "react";
import { localDay, localTime } from "../../domain/calendar.ts";
import { keptMoments, type Occurrence, resolveInterval } from "../../domain/interval.ts";
import { effective, needsEndCheck } from "../../domain/time.ts";
import { api, type StoredEntry } from "../api.ts";
import { errorText, personLabel, useApp } from "../context.ts";
import { Notice, ProjectOptions } from "./common.tsx";
import { TimeCheck } from "./TimeCheck.tsx";

/**
 * Corrects one entry, in the design system's dialog: day, start, end,
 * project and description. A running timer keeps running when the end stays
 * empty. Deleting asks once more.
 */
export function EntryDialog({ entry, onClose }: { entry: StoredEntry; onClose: () => void }) {
  const { session, now, changed, t } = useApp();
  const tz = session.policy.timeZone;
  const value = effective(entry.value, now, session.policy);
  const running = value.endedAt === null;
  const [form, setForm] = useState({
    day: localDay(value.startedAt, tz),
    from: localTime(value.startedAt, tz),
    to: value.endedAt ? localTime(value.endedAt, tz) : "",
    project: value.project,
    note: value.note,
    fromOccurrence: undefined as Occurrence | undefined,
    toOccurrence: undefined as Occurrence | undefined,
  });
  // The same rule as the server: times left as shown keep their stored moments.
  const times = { ...form, to: form.to === "" ? null : form.to };
  const checked = resolveInterval(times, tz, keptMoments(value, times, tz));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await changed();
      onClose();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  };

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!running && !form.to) {
      setError(t.dialog.endRequired);
      return;
    }
    void act(() =>
      api.saveEntry(entry.id, {
        revision: entry.revision,
        project: form.project,
        day: form.day,
        from: form.from,
        to: form.to || null,
        ...(form.fromOccurrence ? { fromOccurrence: form.fromOccurrence } : {}),
        ...(form.toOccurrence ? { toOccurrence: form.toOccurrence } : {}),
        note: form.note,
      }),
    );
  };

  return (
    <dialog
      ref={dialog}
      className="dialog dialog-wide"
      onClose={onClose}
      aria-labelledby="entry-dialog-title"
    >
      <form onSubmit={save}>
        <div className="dialog-header">
          <div>
            <h3 id="entry-dialog-title">{t.dialog.title}</h3>
            <p className="tt-muted">{personLabel(t, value.person, value.personName)}</p>
          </div>
        </div>
        <div className="dialog-body">
          {needsEndCheck(entry.value, now, session.policy) ? (
            <Notice tone="warning" title={t.dialog.autoStoppedTitle}>
              {t.dialog.autoStoppedText(session.policy.timerLimitHours)}
            </Notice>
          ) : null}
          <div className="tt-field-row">
            <div className="field">
              <label htmlFor="edit-day">{t.field.day}</label>
              <input
                id="edit-day"
                type="date"
                required
                value={form.day}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-from">{t.field.from}</label>
              <input
                id="edit-from"
                type="time"
                required
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-to">
                {t.field.to}{" "}
                {running ? <span className="optional">{t.field.stillRunning}</span> : null}
              </label>
              <input
                id="edit-to"
                type="time"
                required={!running}
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
              />
            </div>
          </div>
          {form.to || running ? (
            <TimeCheck
              id="edit"
              result={checked}
              occurrences={{ from: form.fromOccurrence, to: form.toOccurrence }}
              onChoose={(field, choice) =>
                setForm({ ...form, [field === "from" ? "fromOccurrence" : "toOccurrence"]: choice })
              }
            />
          ) : null}
          <div className="field">
            <label htmlFor="edit-project">{t.field.project}</label>
            <select
              id="edit-project"
              required
              value={form.project}
              onChange={(e) => setForm({ ...form, project: e.target.value })}
            >
              <ProjectOptions keep={entry.value.project} />
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-note">{t.field.note}</label>
            <textarea
              id="edit-note"
              rows={2}
              maxLength={500}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
        <div className="dialog-footer">
          {confirmDelete ? (
            <>
              <span className="tt-muted tt-grow">{t.dialog.confirmDelete}</span>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void act(() => api.deleteEntry(entry.id, entry.revision))}
              >
                {t.dialog.yesDelete}
              </button>
              <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                {t.dialog.keep}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-danger tt-push-left"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                {t.dialog.delete}
              </button>
              <button type="button" className="btn" onClick={() => dialog.current?.close()}>
                {t.dialog.cancel}
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !checked.ok}>
                {busy ? t.saving : t.dialog.save}
              </button>
            </>
          )}
        </div>
      </form>
    </dialog>
  );
}
