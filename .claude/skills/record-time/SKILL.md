---
name: record-time
description: "Write a person's working time into Time Tracker from their own description (\"yesterday three hours on the website, this morning the Studio campaign\"), as draft entries the person checks. Use for time written for or with a person, not for timers they run themselves."
---

# Record a person's time from their description

Time Tracker keeps who worked when and on what. You turn a person's words
into entries, show them, and save them as drafts. You never guess a person,
a project or a time, and you never publish.

## 1. Find the App and who you are to it

- Read the Module's `AGENTS.md` (its "This Organization's copy" section names
  the language and the data repository).
- The App's address for an agent is its loopback listener: `http://127.0.0.1:<port>`,
  the `port` of the lease `main` in `lazurio.module.json`. Start it with
  `lazurio module start <Organization>/time-tracker --json` when it does not
  run. In the Environment browser you may use its WebMCP tools instead
  (`agent-browser webmcp list`): `list_projects`, `find_time_entries`,
  `add_time_entry`.
- `GET /api/session`: `viewer.role` is `admin` and `viewer.person` is `null`
  from the loopback address. You act as the Environment, so you must name the
  person every entry is for.

## 2. Find the person

- `GET /api/people` lists the people Time Tracker knows, by subject and
  username. Match the person who described the work, by what they told you or
  the user confirms. A Lazurio username is not a guess from a GitHub login, an
  e-mail or the operating-system account.
- A person Time Tracker does not know yet records their first entry
  themselves in the App (a timer or time by hand). Say so and stop for them.

## 3. Turn the description into entries

- `GET /api/catalog` gives the projects (and their clients) by id. Map each
  piece of work to one project that is not archived. When two projects fit,
  or none does, ask; never create a project for it (that is the application
  admin's decision, on the Projects page).
- Every entry needs a day (`YYYY-MM-DD`), a start and an end (`HH:MM`) in the
  Organization's time zone, and a short note in the person's words. Relative
  days ("yesterday", "on Monday") are relative to today in that time zone.
- A duration without times ("three hours") needs a start: ask, or propose one
  that does not overlap the person's other entries of that day
  (`GET /api/entries?person=<subject>&from=<day>&to=<day>`) and say that you
  chose it.
- Show the person the entries as a short table (day, from–to, project, note,
  hours) in their language and wait for their "yes".

## 4. Save them as drafts

For each confirmed entry:

```bash
curl -sS -X POST "http://127.0.0.1:<port>/api/entries" \
  -H "content-type: application/json" -H "origin: http://127.0.0.1:<port>" \
  -d '{"id":"<new lowercase UUID>","person":"<subject>","project":"<project id>","day":"2026-11-05","from":"09:00","to":"12:00","note":"Home page design"}'
```

- `201` returns the saved entry. A refusal names its reason in the App's
  language: `entry_overlap` (another entry of the person covers that time),
  `timer_running` (the person's timer runs then), `invalid_record` (an
  archived project, a time in the future, an unknown person). Tell the person
  and correct with them; never force a save around a rule.
- Use a new UUID per entry; repeating a request with the same id is refused,
  so a retry never duplicates time.

## 5. Hand over

Say which entries you saved, that they are drafts in this Environment, and
that an application admin publishes them on the Draft page ("Koncept a
publikování" / "Draft and publish"). Publishing is a Publication into the
Organization's data: only on the person's instruction.
