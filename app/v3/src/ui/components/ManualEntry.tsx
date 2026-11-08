import { type FormEvent, useState } from "react";
import { type Occurrence, resolveInterval } from "../../domain/interval.ts";
import { api, newId } from "../api.ts";
import { errorText, personLabel, useApp } from "../context.ts";
import { Notice, ProjectOptions } from "./common.tsx";
import { TimeCheck } from "./TimeCheck.tsx";

/**
 * Time written by hand: a day, from, to, project and what was done. An
 * application admin may write it for another person the App already knows;
 * from inside the Environment (no person) choosing the person is required.
 */
export function ManualEntry({ defaultProject }: { defaultProject: string }) {
  const { session, people, today, changed, t } = useApp();
  const self = session.viewer.person;
  const admin = session.viewer.role === "admin";
  const [form, setForm] = useState({
    person: self?.subject ?? "",
    day: today,
    from: "09:00",
    to: "10:00",
    // Empty until the person picks one: the default follows their last project.
    project: "",
    note: "",
    fromOccurrence: undefined as Occurrence | undefined,
    toOccurrence: undefined as Occurrence | undefined,
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const choices = [
    ...(self ? [{ person: self.subject, name: self.username }] : []),
    ...people.filter((row) => row.person !== self?.subject),
  ];
  const project = form.project || defaultProject;
  const times = resolveInterval(form, session.policy.timeZone);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.addEntry({
        id: newId(),
        ...(form.person && form.person !== self?.subject ? { person: form.person } : {}),
        project,
        day: form.day,
        from: form.from,
        to: form.to,
        ...(form.fromOccurrence ? { fromOccurrence: form.fromOccurrence } : {}),
        ...(form.toOccurrence ? { toOccurrence: form.toOccurrence } : {}),
        note: form.note,
      });
      setSaved(true);
      setForm({ ...form, note: "" });
      await changed();
    } catch (caught) {
      setError(errorText(t, caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card tt-manual" onSubmit={(event) => void submit(event)}>
      <h2 className="tt-card-title">{t.manual.title}</h2>
      <p className="tt-muted">{t.manual.subtitle}</p>
      {admin && (choices.length > 1 || !self) ? (
        <div className="field">
          <label htmlFor="manual-person">{t.manual.forWhom}</label>
          <select
            id="manual-person"
            required
            value={form.person}
            onChange={(e) => setForm({ ...form, person: e.target.value })}
          >
            {self ? null : <option value="">{t.manual.choosePerson}</option>}
            {choices.map((row) => (
              <option key={row.person} value={row.person}>
                {row.person === self?.subject ? t.manual.me : personLabel(t, row.person, row.name)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="manual-day">{t.field.day}</label>
        <input
          id="manual-day"
          type="date"
          required
          max={today}
          value={form.day}
          onChange={(e) => setForm({ ...form, day: e.target.value })}
        />
      </div>
      <div className="tt-field-row tt-field-row-2">
        <div className="field">
          <label htmlFor="manual-from">{t.field.from}</label>
          <input
            id="manual-from"
            type="time"
            required
            value={form.from}
            onChange={(e) => setForm({ ...form, from: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="manual-to">{t.field.to}</label>
          <input
            id="manual-to"
            type="time"
            required
            value={form.to}
            onChange={(e) => setForm({ ...form, to: e.target.value })}
          />
        </div>
      </div>
      <TimeCheck
        id="manual"
        result={times}
        occurrences={{ from: form.fromOccurrence, to: form.toOccurrence }}
        onChoose={(field, value) =>
          setForm({ ...form, [field === "from" ? "fromOccurrence" : "toOccurrence"]: value })
        }
      />
      <div className="field">
        <label htmlFor="manual-project">{t.field.project}</label>
        <select
          id="manual-project"
          required
          value={project}
          onChange={(e) => setForm({ ...form, project: e.target.value })}
        >
          <option value="" disabled>
            {t.manual.chooseProject}
          </option>
          <ProjectOptions />
        </select>
      </div>
      <div className="field">
        <label htmlFor="manual-note">
          {t.field.note} <span className="optional">{t.field.optional}</span>
        </label>
        <input
          id="manual-note"
          maxLength={500}
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="ok">{t.manual.saved}</Notice> : null}
      <button
        type="submit"
        className="btn btn-primary tt-wide"
        disabled={busy || !project || !times.ok}
      >
        {busy ? t.saving : t.manual.save}
      </button>
    </form>
  );
}
