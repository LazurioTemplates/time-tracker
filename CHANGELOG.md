# Changelog

## Unreleased

## 0.2.0 — 2026-11-18

Ready as an Application of an Organization (Lazurio decision 0249, Module
Standard `MS-19`), on the stack profile `app-data@2026.12`.

### For people

- A copy that may not write says so on every page and offers no change: no
  timer, no manual entry, no editing, no project or client changes and no
  draft action. Its WebMCP tools only read.

### For whoever runs it

- Every change records who made it and by which channel (Module Standard, One
  data port): the person's subject and the channel the caller states in the
  `x-lazurio-channel` header: `ui` (the interface), `webmcp` (the page's
  tools) or `cli` (an agent's direct request, as the `record-time` skill
  sends it). A draft records them
  through repository-db's `recordOrigin` (an agent's channel as `agent`), a
  publication as `Repository-Db-Actor` and `Repository-Db-Source:
  time-tracker-v3/<channel>`; a request that states no channel is `unknown`,
  source `time-tracker-v3`, never guessed. The origin is a hint: a failure to
  record it never fails a saved write.
- `@lazurio/module-kit` v0.4.0 (profile release `2026.12`).
- One writer rule through the module kit's `dataWriter`: on an Application
  host only `LAZURIO_RUNTIME_DATA_WRITER=true` writes, and any other value
  refuses every change with `data_read_only` before it reaches the store.
  Without the variable the App follows the module kit (the Module Standard
  keeps that case open), except that a runtime stating
  `LAZURIO_RUNTIME_DEPLOYMENT=production` never writes without `true`, from
  any entry. A copy that may not write changes no record and never fetches,
  pulls or publishes, not even on a read; it reads its draft status from the
  checkout, and watches the checkout so an open page hears when the host
  updates the replica. Every request that may not write gets the store as a read-only
  view (`readOnly` of the storage port), so a change is refused at the port
  too. `/api/session` tells the page `mayWrite` for the request.
- Deep health: `/healthz` answers 503 until the data checkout is open, then
  200.
- Contract tests (`tests/application-contract.test.ts`) over the module kit's
  testing helpers: the writer rule, no role grants nothing, a local entry, deep
  health.

## 0.1.0 — 2026-11-09

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
- **Design system** as the package `design-system` of
  `LazurioTemplates/design-system` at the released tag v2.0.0
  (`github:LazurioTemplates/design-system#v2.0.0`, locked in `bun.lock`): its
  styles once and its React components (Button, fields, Select, Table, Card,
  Dialog, Nav, Badge, Alert, EmptyState, Logo); the App's own layout uses its
  `--ds-*` tokens only. An Organization with its own design system changes
  that one dependency to `git+ssh://git@github.com/<Organization>/design-system.git#v<version>`;
  the check accepts both forms, always at a released tag and locked. The subtree of 1.0.0 that an earlier draft of this
  release carried is gone; its history stays in Git and nothing of it is
  imported.
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
