---
name: find-missing-days
description: "Find the working days on which people recorded no time in Time Tracker, for a week or a month, and prepare a short reminder for each person. Use before invoicing or payroll, or when asked who forgot to record their time."
---

# Find the missing days

A missing day is a working day before today on which a person recorded no
entry. Weekends and the Organization's public holidays are no working days
(`app/v3/src/instance/settings.ts`); today is not missing yet.

## 1. Read the report

Use the App's loopback address as in the skill `record-time`, or the WebMCP
tool `get_time_report`.

- `GET /api/report?period=week&day=<a day of the week>` or `period=month`:
  `missing` lists every person Time Tracker knows with their missing days of
  the period. `&person=<subject>` narrows it to one person.
- A person who has never recorded anything is not known to the App and
  cannot appear in `missing`. If the Organization expects someone who is not
  in `GET /api/people`, say so.

## 2. Make sense of it

A missing day is not always a mistake: holidays, sick days, part-time days
and work outside the Organization's projects leave no entry. Do not judge
it. List the days per person, in the person's language, and say which
period you checked.

## 3. Prepare reminders, never send them

For each person with missing days, prepare one short message in the App's
language: the period, the days, and how to add the time (the App's page
"Dnes" / "Today", "Zapsat čas ručně" / "Write time by hand"). Show every
message to the user word for word, with its channel and recipient. Sending
is the user's decision and follows the Environment's rules for messages;
until they approve the exact text, nothing is sent.

When a person tells you what they did on a missing day, record it with the
skill `record-time`.
