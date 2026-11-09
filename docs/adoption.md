# Adopting Time Tracker into an Organization

This is the procedure an agent follows when a person chooses "Přidat do
Organizace" for Time Tracker in the Lazurio Marketplace, or asks for it in
Chat. It follows LazurioPlatform
[`docs/marketplace.md`](https://github.com/Lazurio/LazurioPlatform/blob/main/docs/marketplace.md)
and the [Module Standard](https://github.com/Lazurio/LazurioPlatform/blob/main/docs/module-standard.md).

The brief names three things: the **release** (tag and full commit, as the
Marketplace registry records them), the **target Organization** and the
**start**: `empty` (no clients, projects or entries) or `sample` (the
fictional example records of the release).

**Nothing is merged, published, granted or started without the person's
explicit instruction.** The agent prepares pull requests and requests; every
merge, every publish of data and every access change is the person's
Publication. Where the person's rights do not reach, the agent prepares a
request for whoever may do it and goes on with the rest.

## 1. Check rights, name, language and compatibility

Do all of this live, before showing a plan.

1. **Who acts.** `gh api user --jq .login` is the person's login. Creating an
   Organization's Module needs an active Owner of the Organization:
   `gh api orgs/<Org>/memberships/<login> --jq .role` is `admin`. Otherwise
   prepare a request for an Owner
   (`gh api "orgs/<Org>/members?role=admin" --jq '.[].login'`): an issue in the
   Organization's root repository with the plan below, assigned to them.
2. **The release.** `git ls-remote https://github.com/LazurioTemplates/time-tracker refs/tags/<tag>`
   must point to the recorded commit (for an annotated tag, its peeled `^{}`
   line). A mismatch stops the adoption.
3. **Name collision.** The slug is `time-tracker`. Look in the Organization's
   `modules.manifest.json` for a slot with that slug or path, and on GitHub
   for `<Org>/time-tracker` and `<Org>/time-tracker-data`.
   - Nothing there: go on with the slug `time-tracker`.
   - The Organization already runs this template (a Module whose history
     contains a commit of `LazurioTemplates/time-tracker`): this is an update,
     not an adoption ([`extending.md`](extending.md), "Taking a template
     release").
   - An unrelated Module or repository has the name (another time tracker of
     the Organization, for example): do not touch it. Agree another slug with
     the person (for example `timesheets`) and use it below for the Module and
     its `<slug>-data` repository.
4. **Language.** Lazurio does not pass a language to a Module's App yet. Take
   the language of the Organization's Lazurio as the Environment states it,
   the `locale` of the Folder profile (Settings → General; `profile.locale` in
   the Folder's `.lazurio/preferences.json`), `cs` or `en`, and confirm it with
   the person. It decides the App's texts, the CSV format and which example
   records the `sample` start takes.
5. **Compatibility.** The Organization's Environments run a LazurioPlatform
   release that knows `start_script` and `build_output` (v0.1.11 or newer);
   Bun 1.4.4 is fetched by Lazurio when missing. People who open the App
   through the Environment's gateway are recognised only where the gateway
   states who came (`appAccess`, decision 0231); until it does, such a visitor
   sees "Lazurio did not say who you are" and nothing else, while the App
   still works from inside the Environment ([`access.md`](access.md)). Say
   which of the two the person will see.

## 2. Show the plan and wait for confirmation

Show the person, in their language and in a few lines:

- the release (version, tag, commit) and that its code runs in the
  Organization's Environments (`bun install`, the tests, the App);
- the two private repositories that will be created, `<Org>/<slug>` and
  `<Org>/<slug>-data`, and that the second holds personal data (who worked
  when and on what);
- the Teams that get access, chosen from the Organization's real list
  (`gh api orgs/<Org>/teams --jq '.[].slug'`), never guessed;
- the language, and the start: empty, or the fictional example records;
- the pull requests that will wait for them.

Go on only after the person confirms this plan.

## 3. Create the Module

From a task worktree of the Organization's root repository:

```bash
lazurio module create <Org>/<slug> --stack vite-react --teams <team,team> --data --dry-run
lazurio module create <Org>/<slug> --stack vite-react --teams <team,team> --data --confirm <plan>
```

This creates the private Module repository with the scaffold (its App in
`app/v3`), the private data repository `<slug>-data` on branch `v3`, and
declares both slots in the root worktree. The root's pull request is the
person's to merge.

## 4. Merge the release into the Module

In a worktree of the new Module, on a branch:

```bash
git fetch https://github.com/LazurioTemplates/time-tracker.git "refs/tags/<tag>"
test "$(git rev-parse 'FETCH_HEAD^{commit}')" = "<commit>"
git merge --allow-unrelated-histories --no-ff --no-commit <commit>
```

The template was born from the same scaffold, so the two histories meet in
the same files. Resolve so that the template's tree wins everywhere except
the Organization's identity:

| File | Keep the Organization's | Take from the template |
| --- | --- | --- |
| `lazurio.module.json` | `id`, `company`, `port_leases` | `apps`, `default_app` (`app/v3/package.json`) |
| `app/v3/package.json` | `lazurio.runtime`: `id`, `company`, `module`; the `design-system` dependency when the Organization has released its own design system (`git+ssh://git@github.com/<Org>/design-system.git#v<version>`, [`extending.md`](extending.md#the-design-system)) | everything else |
| `app/v3/bun.lock` | | the template's, then `bun install` when the `design-system` dependency is the Organization's |
| `app/v3/config/data-repository.json` | the `remote` of `<Org>/<slug>-data` exactly as `db/repository-db.yaml` names it, `branch: v3` | |
| `app/v3/src/instance/settings.ts` | `organization` (its display name) and `language` (step 1) | the rest, unless the person asks for another time zone, timer limit or working week |
| `AGENTS.md` | a section "This Organization's copy" at the end: who reviews, where the data lives, the language | the rest |
| anything else | | the template's |

Delete what only the scaffold had (`app/v3/src/App.tsx`, `app/v3/src/main.tsx`, `app/v3/src/greeting*.ts`,
`app/v3/index.html`, `app/v3/seed/.gitkeep`, `.github/workflows/check.yml`).
Keep `LICENSE` and `NOTICE.md`: MIT requires the notice.

Commit the merge, then check that the release stays an ancestor; this is what
lets later releases arrive as ordinary merges:

```bash
git merge-base --is-ancestor <commit> HEAD
cd app/v3 && bun install --frozen-lockfile && bun run check && bun run build
```

With the Organization's own design system in the dependency, run `bun install`
instead of `--frozen-lockfile` once and commit `bun.lock`; `bun run check`
accepts that dependency at a released tag like the template's. Its CI cannot
install a private design system yet (Lazurio/LazurioPlatform#915): say so in
the pull request, show the check run on the Environment, and leave access for
CI to the Organization's Admin.

Push the branch and open a pull request in the Module. Do not merge it.

## 5. Prepare the data repository

In a worktree of `<Org>/<slug>-data`, on a branch from `v3`:

- copy `templates/data-repo/` of the release: `schemas/`, `scripts/`,
  `.github/`, `.gitignore`, `README.md`, `AGENTS.md` and `data/`;
- in `repository-db.yaml` keep `data_repo` as `lazurio module create` wrote it
  and take `schema`, `layout`, `generated_manifest` and `validate` from the
  template;
- for the `sample` start, also copy `app/v3/seed/<language>/` of the release
  into `data/` (its `clients/`, `projects/` and `entries/`). Tell the person
  that these are invented records to try the App, dated in the autumn of
  2026, and to return or delete them before real use;
- run `bun scripts/validate.ts` there and, with the Module's worktree pointing
  `db/` at this branch, `bun run validate:db` in `app/v3`; push and open a pull
  request into `v3`.

## 6. After the person merges

- `lazurio module start <Org>/<slug>`, open the App by its `runtime.url` and
  check the main path: start and stop a timer, write time by hand, the
  overview, an export. These saves are drafts; publishing them is a
  Publication into the Organization's data, only on the person's instruction,
  otherwise return them on the Draft page.
- **Last step: access.** Set or confirm which Teams reach the Module and its
  data the same way as for every Module, in the Organization overview
  (Přehled Organizace) of Lazurio. Who is an application admin or an
  application user of Time Tracker follows Lazurio's application roles
  (decision 0231); the Marketplace has no access list of its own. Change
  access only on the person's instruction.

## Handoff

Tell the person, with links: the root pull request (slots), the Module pull
request, the data pull request, what each waits for and who decides it, and
any request prepared for someone with more rights.
