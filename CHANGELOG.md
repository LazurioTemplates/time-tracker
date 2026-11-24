# Changelog

## Unreleased

## 0.3.0 — 2026-11-24

### For whoever runs it

- **All writers at once.** With `app-data@2027.03` (`@lazurio/repository-db`
  v3.4.0) every writer of the Module's data stores a new `record.revision` on
  every write: the App, an import, an agent's script, a direct change. Take
  this release in every Environment that writes the same data before their
  writes meet. A writer that keeps or leaves out the revision makes the merge
  fail on `/record/revision`.
- The stack profile release `app-data@2027.03`: `@lazurio/module-kit` v0.6.0
  instead of v0.4.0. A runtime that states production never writes without
  `LAZURIO_RUNTIME_DATA_WRITER=true` (module-kit 0.4.1). module-kit 0.6.0
  offers an App's publication tools (`effect: "publish"`) in a production
  application too, and every audit line carries the tool's `effect`. This
  template offers no publication tool.
  Nothing in an adopted copy's own files changes; take it by merging the tag.
- `@lazurio/repository-db` v3.4.0 instead of v3.2.6, and a write revision in
  every record: each save of a client, project or entry stores a new random
  value in `record.revision` (Lazurio Module Standard, "One data port"), so a
  record saved back to an earlier content is still a new version and a stale
  edit is refused with `record_changed` instead of overwriting it. Records
  without `revision` (the seed data, everything saved before) stay valid and
  get one with their next save.
  **Before you deploy this release**, copy the regenerated
  `templates/data-repo/schemas/` into the Organization's data repository in
  a pull request of its own and merge it: the data repository's validator
  refuses a record with `revision` until its schemas allow it, so a publish
  would fail with `validation_failed`.
  Every save of a client or project also stores `updatedAt` and `updatedBy`
  (who saved it, `null` from inside the Environment), as entries already do.
  With v3.4.0 two concurrent edits of different fields of one client,
  project or entry therefore still merge, as before: the later `updatedAt`
  keeps its bookkeeping and the merged record gets the revision
  `merge-<sha256>`. The same field changed on both sides stays a conflict.

### For agents

- The tools for agents are defined once on the server
  (`app/v3/src/server/agent-tools.ts`) and offered on `/mcp` of the
  Application and to the page (`/api/agent-tools`, registered by
  `@lazurio/module-kit/webmcp`), with the same names as before. Each calls
  the App's own API, so the role, the writer rule and the revision decide as
  for a click; a copy that may not write lists only the reading tools.
  `prepare_entry_correction` stays a view tool of the page.
- `stop_timer` stops the timer of the person the API sees: in
  `bun run dev:demo` that is the demo's fictional person, so a timer started
  through the tools there stops through them too.
- `update_time_entry` refused with `record_changed` returns the entry's
  `current_revision` while the entry still exists, also when another save
  landed between the API's read and its own save.
- `get_time_report` without `day` lets the API take today in the App's time
  zone, instead of the server's UTC date, so a call around midnight no
  longer reports the previous week or month.
- The revision the port, the API and the tools hand out is still opaque
  (`sha256:` of the record's file), but it now changes with every write:
  after A → B → A the revision of the first A is stale and
  `update_time_entry` answers `record_changed` with `current_revision`. Read
  the record again and use that revision; never derive one from the content.
  The values the port hands out leave `record.revision` out.
- Changing a record's YAML by hand in the data checkout: write a new
  `record.revision` (`crypto.randomUUID()`) with every change. The port also
  notices a change that kept the old value (it hashes the whole file), but
  repository-db 3.4.0 refuses to merge such a record on `/record/revision`.
- The page handles the `AbortError` that WebMCP in Chromium answers when a
  tool is removed (Lazurio/module-kit#14): removing and refreshing the tools
  no longer raises unhandled rejections or Bun's error overlay.

## 0.2.1 — 2026-11-19

### For people

- A link to another page opens it at its top, not at the height the previous
  page was scrolled to. Another period or day of the report keeps the place.

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
