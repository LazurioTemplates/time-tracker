# Extending Time Tracker

An Organization that adopted Time Tracker owns its copy and changes it
freely. Two things keep the copy healthy: changes within the App generation
stay behind the storage port, and the code moves only along the planned steps
below. Lazurio Marketplace templates allow exactly two kinds of change to
their stack: a **generation move** (the data layer changes) and a **stack
profile release** (tool versions change). Anything else is a patch release
with a security fix.

## Changes within generation v3

- **A new field or record rule.** Change the Zod schema in
  `app/v3/src/domain/`; the TypeScript type follows by itself. Add a new field
  as nullable or optional so existing records stay valid, or ship a migration
  of the data in the same release. Run `bun run schema:export` and copy the
  regenerated `templates/data-repo/schemas/` into the Organization's data
  repository in a pull request of its own.
- **A rule across records** belongs to `app/v3/src/domain/rules.ts`, checked
  in the store's write (`entryRefusal`, `projectRefusal`) and in the data check
  (`checkRules`), with a test.
- **A new operation on the data** is a method of the storage port
  (`app/v3/src/data/store.ts`) named by the domain (`archiveClient`, not
  `moveFile`), implemented in every store and covered by
  `tests/store-contract.ts`. The server and the UI call only the port.
- **A new page or action** is a React component in `app/v3/src/ui/` calling
  only the HTTP API (`app/v3/src/ui/api.ts`), with its WebMCP tool in
  `app/v3/src/ui/webmcp.ts` when people and agents do it often.
- **Words.** Every text people read is a message in
  `app/v3/src/language/messages.ts`, written in Czech and in English; the tests
  refuse one without the other.
- **The Organization's settings** live in `app/v3/src/instance/settings.ts`:
  its display name, its language, the time zone its days are counted in, how
  long a forgotten timer runs, its working days and its public holidays (`cz`
  or none). Another country's holidays are one function beside
  `czechHolidays` in `app/v3/src/domain/calendar.ts`.
- **Candidates** an Organization may want and the template leaves out: hourly
  rates and amounts in the export, display names for payroll keyed by subject,
  approval of a person's month, budgets per project. Each is a field or a
  collection behind the port, not a change of the generation.

Run `bun run check` and `bun run build` in `app/v3` before every pull request.

## Taking a template release

Later releases of the template arrive as merges, never as copies, rebases or
squashes. The release that was adopted is an ancestor of the Organization's
`main` ([`adoption.md`](adoption.md)), so Git knows what the Organization
changed and what the template changed.

```bash
git fetch https://github.com/LazurioTemplates/time-tracker.git "refs/tags/<tag>"
test "$(git rev-parse 'FETCH_HEAD^{commit}')" = "<commit from the release notes or registry>"
git switch -c take-<tag> origin/main
git merge --no-ff <commit>
```

- Resolve conflicts hunk by hunk. The Organization's identity
  (`lazurio.module.json`, the `lazurio.runtime` ids,
  `config/data-repository.json`, `src/instance/settings.ts`, its `AGENTS.md`
  section) stays the Organization's; the rest usually takes the template's
  side.
- Read the release's `CHANGELOG.md` section: when the schemas changed, the data
  repository gets the regenerated `schemas/` (and any migration) in a pull
  request of its own, merged together with the Module's.
- `bun install --frozen-lockfile && bun run check && bun run build`, then a
  pull request. Merging it is the person's Publication.

## The design system

The look is the package `design-system` of
[`LazurioTemplates/design-system`](https://github.com/LazurioTemplates/design-system),
a Git dependency on a released tag in `app/v3/package.json`:

```json
"design-system": "github:LazurioTemplates/design-system#v2.0.0"
```

`bun.lock` records the tag and the `sha512` of what was installed, and
`bun install --frozen-lockfile` installs exactly that. The App imports
`design-system/styles.css` once (`app/v3/src/ui/main.tsx`) and its components
from `design-system/react`; `app/v3/src/ui/styles.css` adds only the App's own
layout and parts with no component of the design system, in `tt-` classes
over the `--ds-*` tokens. `tests/design-system.test.ts` holds this: a released
tag, no copy and no import by a path, no literal colour and no rule on a class
of the design system.

- **A newer release** of the design system is a new tag in that line:
  `bun install`, `bun run check`, `bun run build`, a look at every page in
  both languages and on a phone, and the release's `CHANGELOG.md` for what the
  App must change. A template release does this for the template; an
  Organization takes it with that release or on its own.
- **The Organization's own design system.** An Organization that adopted the
  design system template and released its own changes only the dependency, to
  its private repository over SSH, which works with the Environment's key:

  ```json
  "design-system": "git+ssh://git@github.com/<Organization>/design-system.git#v<version>"
  ```

  The imports stay the same, because both packages are named `design-system`.
  A new brand is a new release of the Organization's design system and a new
  pin here.
- **Known limitation: CI with a private design system.** The module's GitHub
  Actions cannot install a private `git+ssh` dependency without read access to
  that repository (for example a read-only deploy key as a secret and an SSH
  agent step). How Lazurio sets that up for modules is open in
  [Lazurio/LazurioPlatform#915](https://github.com/Lazurio/LazurioPlatform/issues/915);
  until then such a module's CI fails at `bun install` while it passes on the
  Environment. Setting up access is the Organization's Admin's work, never
  the agent's own keys or secrets.

The App never reads another repository at run time and never imports the
design system by a relative path.

## Stack profile releases

The template follows the stack profile `app-data@2026.11`
([`app-data`](https://github.com/Lazurio/LazurioPlatform/blob/main/docs/stack-profiles.md#app-data),
release 2026.11): exact versions of Bun, TypeScript, Vite, React, Biome, Zod,
repository-db and module-kit (`app/v3/package.json`). A **stack profile
release** moves those versions together, for example `app-data@2026.11` to
`app-data@2027.05`: one template release that updates `packageManager`, the
exact versions, `bun.lock`, the CI's Bun and, if the formatter changed,
reformats once. Organizations take it by merging its tag like any other
release. Between profile releases only patch versions with a security fix
change.

One deviation from release 2026.11: the profile names `@lazurio/module-kit`
v0.2.0, and Time Tracker depends on v0.3.0, the minor release that added
`appAccess` (decision 0231), because deciding who may see and change which
entries needs it. Everything else in module-kit is unchanged. The next profile
release is expected to name v0.3.0 or later.

Planned profile releases already known: Vite+ is reconsidered when it
supports Bun as a runtime and its formatter reaches 1.0; Biome's YAML and
Markdown formatting stays off until a profile release turns it on.

## The move to generation v4 (Dolt)

Generation v4 keeps the data in a Dolt database in the Organization's services
Environment instead of a Git data repository. Time entries are a good
candidate: they are many writes by many people, personal data that must be
deletable, and reports want queries rather than reading every file. The move
is planned, reviewed and reversible:

1. **A new App beside the old one.** Create `app/v4/` from `app/v3/`:
   `src/domain/`, `src/server/`, `src/ui/`, `src/language/` and
   `tests/store-contract.ts` are copied unchanged. Add
   `src/data/dolt-store.ts`, the storage port over Dolt (Kysely 0.29.8 and
   mysql2 3.24.6 per the profile `app-database`), and SQL migrations derived
   from the Zod schemas. Clients, projects and entries are flat records with a
   stable id, so they map to three tables.
2. **Draft & Publish stays the same for people.** A draft is the Environment's
   working set or branch, publishing is `DOLT_COMMIT` with the author and a
   summary, the review comes from Dolt's diff tables, and the card is fed the
   same view model. This mapping is to be proven on a prototype.
3. **The same tests.** `tests/store-contract.ts` runs against Dolt in CI with a
   pinned `dolt sql-server`. A store that passes the suite replaces the v3
   store without a change to the server or the UI.
4. **Moving the data.** `bun run migrate:v3-to-v4` reads every record through
   the v3 store, validates it with the same Zod schemas, writes it to Dolt and
   makes one `DOLT_COMMIT` naming the source commit of the v3 data, with counts
   and a round trip of every record as proof.
5. **Switching.** `lazurio.module.json` lists both Apps; `default_app` moves to
   `app/v4/package.json` only on the decision of the Organization's Steward or
   the person. `app/v3` stays as the way back; a Module keeps at most two
   generations.

Do not confuse the two meanings of "v4": the App generation `app/v4` (Dolt)
and a repository-db data branch named `v4`. Write "App generation" and "data
branch". A Dolt database outside one server is a connection setting of
`app/v4`, not a generation `app/v5`.
