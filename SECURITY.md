# Security

## Reporting

Report a vulnerability privately through GitHub's "Report a vulnerability"
on this repository. Do not open a public issue for it.

## What the App defends

- **Who came is Lazurio's statement.** The server reads `appAccess` of
  `@lazurio/module-kit` for every request, APIs and downloads included, and
  never caches it. A request through the Environment's gateway without a valid
  statement has no role and gets nothing but its session answer. Names,
  subjects and roles sent by the browser are never used.
- **Each person's own entries.** An application user reads, exports and
  changes only entries whose `person` is their subject; another person's
  entry answers "not found". Projects, clients, the whole draft and its
  publication are the application admin's ([`docs/access.md`](docs/access.md)).
- **Writes come only from the App itself.** Every writing request must be
  `application/json` with an `Origin` of the App's own listener (loopback or
  the hosted origin Lazurio passes). A foreign `Host` is refused.
- **The App serves one data repository.** The sync host refuses a checkout
  whose configuration names another remote or branch, or whose real path lies
  outside the Module (`boundary_violation`).
- **No Git and no paths of its own on the data.** Records are read and written
  only through repository-db, which refuses symbolic links and paths outside
  the checkout. A save names the revision it was edited from; a stale save is
  refused. Rules across records are checked inside the engine's write queue.
- **Publishing is one validated commit.** repository-db runs the data
  repository's validator before every publish.
- **CSV cannot run formulas.** A cell that a spreadsheet would read as a
  formula starts with an apostrophe.
- **No secrets.** The App declares none, reads no `.env` file and stores no
  credential.

## Out of scope

The narrowing by role protects people who have only the App. It is a service
of the Environment's operator, not isolation against them: whoever runs the
Environment can read its data checkout and reach the App's loopback port
(decision 0196). An Organization that needs per-person isolation against the
operator keeps the data in a store that verifies identity itself.
