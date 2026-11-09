# Time Tracker: rules for agents

This repository is Time Tracker, the public upstream
`LazurioTemplates/time-tracker` and a template of the Lazurio Marketplace
(MIT, fictional data only). Read [`README.md`](README.md) first. Everything
written in this repository is English, every change is a worktree, a branch
and a pull request, and merging is a Publication on the instruction of a
maintainer with live GitHub rights on this repository.

An Organization that adopted this template keeps this file and adds its own
section at the end ("This Organization's copy"): who reviews, where its data
lives, its language, what it changed. See [`docs/adoption.md`](docs/adoption.md).
In that copy, review and merge follow the Organization's own `AGENTS.md` and
the live rights of its people.

## What belongs here

- The App code, its Zod schemas, the generated JSON Schemas, the data
  repository template, the skills and the documentation.
- Fictional records only, in `app/v3/seed/cs/`, `app/v3/seed/en/` and the
  tests: the invented company "Example", fictional people with international
  usernames (`alexmorgan`), no real Organization, person, credential, local
  host path or private link. The Organization identity stays the visibly
  generic placeholders (`REPLACE-WITH-ORG-NAME`, `replace-with-org-slug-…`,
  `Organization`).
- An Organization's real time entries live in its own data repository
  (`<Organization>/time-tracker-data`, branch `v3`, mounted as `db/`), never
  here. They are personal data: never copy them into an issue, a pull request,
  a chat or another repository.

## How the code is cut

- `app/v3/src/domain/` holds the Zod schemas, the only definition of the
  shape of the data, and pure logic. Types come from `z.infer`; never write a
  second TypeScript type of a record.
- `app/v3/src/data/store.ts` is the storage port. The server and the UI know
  only the port; the port enforces the rules across records inside its write.
  No YAML path, file read or Git term crosses it.
- `app/v3/src/data/repository-db-store.ts` implements it with
  `@lazurio/repository-db`: reads through `host.read`, writes through
  `host.run` and the engine's collections with the base revision. Never run
  Git on the data checkout, never keep a second write queue or poll loop.
- `app/v3/tests/store-contract.ts` is the shared suite of the port. A change of
  the port's behaviour changes the suite, and every implementation passes it.
- Who may do what is decided in `app/v3/src/server/api.ts` from `appAccess`
  of `@lazurio/module-kit`, for every request ([`docs/access.md`](docs/access.md)).
  Never take a name, a subject or a role from the browser, the operating
  system, Git or the Environment's assignee.
- Every text people read is in `app/v3/src/language/messages.ts`, in Czech
  and in English with the same keys; the tests refuse a Czech word in the
  code or a message missing in one language. Never mix the languages on one
  screen.
- The look is the package `design-system` at a released tag
  (`app/v3/package.json`): `design-system/styles.css` once in `main.tsx` and
  the components of `design-system/react`. Never copy its files, import it by
  a path or restyle its components; a newer release is a new tag in the
  dependency ([`docs/extending.md`](docs/extending.md)). The App's own styles
  are `tt-` classes over its `--ds-*` tokens, without a literal colour, for
  what the design system has no component for.
- After a change of a schema, run `bun run schema:export` and commit the
  regenerated `templates/data-repo/schemas/` in the same pull request.

## Working with an Organization's time entries

Use the skills in `.agents/skills/` (the same files in `.claude/skills/`):

- `record-time`: write a person's time from their own description;
- `timesheet-for-invoicing`: prepare a timesheet of a period for invoicing or payroll;
- `find-missing-days`: find the working days a person recorded nothing.

Work through the App's HTTP API on its loopback address, or through its
WebMCP tools in the Environment browser; never edit the files of `db/`. A
request from inside the Environment is an application admin without a name:
name the person you write for, from the people Time Tracker knows. Saves are
drafts; publishing the draft is a Publication into the Organization's data,
only on the person's instruction. Sending a timesheet, a reminder or an
invoice is the person's too: prepare it and show it.

## Before a pull request

- `cd app/v3 && bun install --frozen-lockfile && bun run check && bun run build`.
- A change people see: check it in a browser with `bun run dev:demo` (and
  `--lang en`, `--as user`), on a desktop and a phone width. Never publish an
  Organization's data while testing.
- Versions are exact (no `^` or `~`). A new version of a tool is a release of
  the stack profile ([`docs/extending.md`](docs/extending.md)), not a drive-by
  change.
- Add a `CHANGELOG.md` entry under "Unreleased".

## Releases

A release is an annotated tag `v<semver>` and a GitHub Release, created only
on the user's instruction. The release version is independent of the App
generation `app/v3`. The Marketplace registry records the full commit of the
tag.
