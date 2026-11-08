# Changelog

## Unreleased

## 0.1.0 (draft, not released yet)

The first release of Time Tracker as a template of the Lazurio Marketplace,
on the App generation `app/v3` and the stack profile `app-data@2026.11`.

### For people

- A timer per person on a project, started and stopped in the App; time
  written by hand with a day, a start and an end; a forgotten timer ends by
  itself ten hours after its start, is counted only up to then everywhere and
  is flagged until someone sets its real end.
- Entries of the week by day, every entry with filters by period, person,
  client and project, and a dialog to correct or delete an entry. An edit
  keeps every time it does not change to the millisecond; a time the clocks
  skip is refused, one they repeat asks which occurrence is meant and keeps
  the choice in view, and an interval across the repeated hour is counted
  between its chosen moments.
- Projects and clients, invoiced or the Organization's own work, archived
  without losing their history.
- The overview of a week or a month: hours in total, to invoice and of the
  Organization's own work (projects without a client), per day, project,
  client and person, and the
  working days without an entry (weekends and Czech public holidays left out).
- CSV of every entry and of the hours by client, project and person, as Czech
  (`;`, decimal comma) or English (`,`, decimal point) spreadsheets open it.
- Draft & Publish: the changed records named in the App's language, publish
  all, return one record or all, finish a send, take colleagues' work, and a
  data check.
- Czech and English everywhere, by the instance's language; Czech by default.

### For Organizations and agents

- **Who came, from Lazurio.** `appAccess` of `@lazurio/module-kit` v0.3.0,
  read on the server for every request (decisions 0196 and 0231): an
  application user reads and changes only their own entries; an application
  admin every entry, the projects, the clients and the draft; without a
  statement nothing but the session answer.
- **Data through the engine.** Three repository-db collections (`clients`,
  `projects`, `entries`) whose shape is Zod only, behind the storage port
  `app/v3/src/data/store.ts` with its shared test suite, passed by the
  repository-db store and a memory store.
- **Data repository template** (`templates/data-repo/`) with the generated
  JSON Schemas and a validator without dependencies, which repository-db runs
  before every publish; fictional example records in Czech and English
  (`app/v3/seed/cs`, `app/v3/seed/en`).
- **Design system** `LazurioTemplates/design-system` v1.0.0, merged with its
  history as `app/v3/design-system`; the App reads its tokens and stylesheet
  from there and takes later releases by merging their tags.
- **For agents:** the skills `record-time`, `timesheet-for-invoicing` and
  `find-missing-days`, and WebMCP tools for the main actions; none publishes
  or deletes.
- **One gate:** `bun run check` runs the type check, Biome, the tests, the
  validation of the example records and the staleness check of the generated
  schemas; CI runs it with `bun run build` on Linux and the check on Windows.
- **Module Standard:** one App package (`app/v3`), one Bun server for `dev`
  and `start`, the built version from `main` (`build_script`, `build_output`,
  `start_script`), health `/healthz`, writes only as JSON from the App's own
  origin, no `.env` file.
- Documents: `docs/adoption.md`, `docs/extending.md`, `docs/data.md`,
  `docs/access.md`, and Marketplace screenshots in `docs/screenshots/cs/` and
  `docs/screenshots/en/`.
