# Time Tracker data

The records of the Organization's Time Tracker: clients, projects and time
entries. This repository is managed by
[repository-db](https://github.com/Lazurio/repository-db) on branch `v3` and
is checked out as `db/` of the Time Tracker Module. The App writes every
change as a draft; publishing it makes one commit here.

| Directory | Record | Schema |
| --- | --- | --- |
| `data/clients/<id>.yaml` | a client | `schemas/clients.schema.json` (`time-tracker.client.v1`) |
| `data/projects/<id>.yaml` | a project | `schemas/projects.schema.json` (`time-tracker.project.v1`) |
| `data/entries/<id>.yaml` | a time entry | `schemas/entries.schema.json` (`time-tracker.entry.v1`) |

The schemas are generated from the Zod schemas of the Module
(`bun run schema:export` in its `app/v3`); never edit them here. `bun
scripts/validate.ts` checks every record before each publish and in CI.

The time entries are personal data of the people who recorded them: who
worked when and on what. Keep this repository private and give it only to the
Teams the Organization decides.
