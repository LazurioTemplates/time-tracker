import { Button, Select, TextField } from "design-system/react";
import { type FormEvent, useState } from "react";
import { changeWallTime, type Occurrence, resolveInterval } from "../../domain/interval.ts";
import { api, newId } from "../api.ts";
import { errorText, personLabel, useApp } from "../context.ts";
import { Notice, ProjectSelect } from "./common.tsx";
import { TimeCheck } from "./TimeCheck.tsx";

/**
 * Time written by hand: a day, from, to, project and what was done. An
 * application admin may write it for another person the App already knows;
 * from inside the Environment (no person) choosing the person is required.
 */
export function ManualEntry({ defaultProject }: { defaultProject: string }) {
  const { session, people, today, changed, t, language } = useApp();
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
    <form className="ds-card tt-form tt-manual" onSubmit={(event) => void submit(event)}>
      <div>
        <h2 className="ds-type-title">{t.manual.title}</h2>
        <p className="ds-type-meta">{t.manual.subtitle}</p>
      </div>
      {admin && (choices.length > 1 || !self) ? (
        <Select
          id="manual-person"
          label={t.manual.forWhom}
          locale={language}
          required
          value={form.person}
          onChange={(e) => setForm({ ...form, person: e.target.value })}
          {...(self ? {} : { placeholder: t.manual.choosePerson })}
          options={choices.map((row) => ({
            value: row.person,
            label:
              row.person === self?.subject ? t.manual.me : personLabel(t, row.person, row.name),
          }))}
        />
      ) : null}
      <TextField
        id="manual-day"
        type="date"
        label={t.field.day}
        locale={language}
        required
        max={today}
        value={form.day}
        onChange={(e) => setForm(changeWallTime(form, "day", e.target.value))}
      />
      <div className="tt-row tt-row--2">
        <TextField
          id="manual-from"
          type="time"
          label={t.field.from}
          locale={language}
          required
          value={form.from}
          onChange={(e) => setForm(changeWallTime(form, "from", e.target.value))}
        />
        <TextField
          id="manual-to"
          type="time"
          label={t.field.to}
          locale={language}
          required
          value={form.to}
          onChange={(e) => setForm(changeWallTime(form, "to", e.target.value))}
        />
      </div>
      <TimeCheck
        id="manual"
        result={times}
        chosen={{ from: form.fromOccurrence, to: form.toOccurrence }}
        onChoose={(field, value) =>
          setForm({ ...form, [field === "from" ? "fromOccurrence" : "toOccurrence"]: value })
        }
      />
      <ProjectSelect
        id="manual-project"
        value={project}
        placeholder={t.manual.chooseProject}
        onChange={(value) => setForm({ ...form, project: value })}
      />
      <TextField
        id="manual-note"
        label={t.field.note}
        locale={language}
        optional
        maxLength={500}
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {saved ? <Notice tone="ok">{t.manual.saved}</Notice> : null}
      <Button
        type="submit"
        variant="primary"
        block
        busy={busy}
        locale={language}
        disabled={!project || !times.ok}
      >
        {t.manual.save}
      </Button>
    </form>
  );
}
