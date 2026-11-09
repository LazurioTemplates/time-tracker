import { Button, Dialog, TextArea, TextField } from "design-system/react";
import { type FormEvent, useState } from "react";
import { localDay, localTime } from "../../domain/calendar.ts";
import { changeWallTime, type Occurrence, resolveInterval } from "../../domain/interval.ts";
import { effective, needsEndCheck } from "../../domain/time.ts";
import { api, type StoredEntry } from "../api.ts";
import { errorText, personLabel, useApp } from "../context.ts";
import { Notice, ProjectSelect } from "./common.tsx";
import { TimeCheck } from "./TimeCheck.tsx";

/**
 * Corrects one entry in the design system's Dialog: day, start, end, project
 * and description. A running timer keeps running when the end stays empty.
 * Deleting asks once more.
 */
export function EntryDialog({ entry, onClose }: { entry: StoredEntry; onClose: () => void }) {
  const { session, now, changed, t, language } = useApp();
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
  const checked = resolveInterval(times, tz, value);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const footer = confirmDelete ? (
    <>
      <span className="ds-type-body-sm tt-grow">{t.dialog.confirmDelete}</span>
      <Button onClick={() => setConfirmDelete(false)}>{t.dialog.keep}</Button>
      <Button
        variant="danger"
        icon="trash"
        busy={busy}
        locale={language}
        onClick={() => void act(() => api.deleteEntry(entry.id, entry.revision))}
      >
        {t.dialog.yesDelete}
      </Button>
    </>
  ) : (
    <>
      <Button
        variant="quiet"
        icon="trash"
        className="tt-push-left"
        disabled={busy}
        onClick={() => setConfirmDelete(true)}
      >
        {t.dialog.delete}
      </Button>
      <Button onClick={onClose}>{t.dialog.cancel}</Button>
      <Button
        type="submit"
        form="entry-form"
        variant="primary"
        busy={busy}
        locale={language}
        disabled={!checked.ok}
      >
        {t.dialog.save}
      </Button>
    </>
  );

  return (
    <Dialog
      id="entry-dialog"
      open
      size="lg"
      title={t.dialog.title}
      description={personLabel(t, value.person, value.personName)}
      onClose={onClose}
      locale={language}
      footer={footer}
    >
      <form id="entry-form" className="tt-form" onSubmit={save}>
        {needsEndCheck(entry.value, now, session.policy) ? (
          <Notice tone="warning" title={t.dialog.autoStoppedTitle}>
            {t.dialog.autoStoppedText(session.policy.timerLimitHours)}
          </Notice>
        ) : null}
        <div className="tt-row tt-row--3">
          <TextField
            id="edit-day"
            type="date"
            label={t.field.day}
            locale={language}
            required
            value={form.day}
            onChange={(e) => setForm(changeWallTime(form, "day", e.target.value))}
          />
          <TextField
            id="edit-from"
            type="time"
            label={t.field.from}
            locale={language}
            required
            value={form.from}
            onChange={(e) => setForm(changeWallTime(form, "from", e.target.value))}
          />
          <TextField
            id="edit-to"
            type="time"
            label={t.field.to}
            {...(running ? { hint: t.field.stillRunning } : {})}
            locale={language}
            required={!running}
            value={form.to}
            onChange={(e) => setForm(changeWallTime(form, "to", e.target.value))}
          />
        </div>
        {form.to || running ? (
          <TimeCheck
            id="edit"
            result={checked}
            chosen={{ from: form.fromOccurrence, to: form.toOccurrence }}
            onChoose={(field, choice) =>
              setForm({ ...form, [field === "from" ? "fromOccurrence" : "toOccurrence"]: choice })
            }
          />
        ) : null}
        <ProjectSelect
          id="edit-project"
          value={form.project}
          keep={entry.value.project}
          onChange={(project) => setForm({ ...form, project })}
        />
        <TextArea
          id="edit-note"
          label={t.field.note}
          locale={language}
          optional
          rows={2}
          maxLength={500}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
      </form>
    </Dialog>
  );
}
