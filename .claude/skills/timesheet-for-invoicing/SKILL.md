---
name: timesheet-for-invoicing
description: "Prepare a timesheet of a period from Time Tracker for invoicing a client or for payroll: hours by client, project and person, checked for gaps and forgotten timers, as a CSV and a short summary. Use when someone asks what to invoice or how many hours someone worked in a period."
---

# Prepare a timesheet for invoicing or payroll

You prepare the numbers and the file. Invoicing, paying or sending anything
stays with the person.

## 1. Agree the period and the scope

Ask only for what the request did not say: the period (a month or `from`–`to`
days), the client (for an invoice) or the person (for payroll), and whether
only invoiced projects count (an invoice: yes; payroll: all work).

## 2. Read the App

Use the App's loopback address as in the skill `record-time`, or its WebMCP
tools `get_time_report` and `find_time_entries`.

- `GET /api/report?period=month&day=<any day of the month>[&person=<subject>]`
  gives the month's totals, hours to invoice, by day, project, client and
  person, and the working days without an entry.
- `GET /api/entries?from=<from>&to=<to>[&client=<id>|own][&person=<subject>]`
  gives the entries themselves, newest first, as the App counts them: a
  forgotten timer ends at its automatic stop.

## 3. Check before anyone invoices

Point out, with the entries' days and people, everything that makes the
numbers uncertain:

- entries still running, or stopped automatically and never corrected
  (`autoStoppedAt` set and `endedAt` equal to it): their end is a guess;
- working days without an entry for the people involved (`missing` of the
  report; see the skill `find-missing-days`);
- entries on an archived project or with an empty note when the client wants
  descriptions;
- unpublished changes (`pending` of an entry): they are real in this
  Environment but not yet in the Organization's data repository.

Corrections go back to the people themselves, or to an application admin.

## 4. Produce the file

Download the CSV the App produces, with the same filter:

```bash
curl -sS -o ~/Documents/<task>/timesheet-<from>-<to>.csv \
  "http://127.0.0.1:<port>/api/export?kind=summary&from=<from>&to=<to>&client=<client id>"
```

`kind=summary` has hours by client, project and person; `kind=entries` every
entry. Keep the file in `~/Documents/<task>/`, never in this repository or in
the data repository. The CSV follows the App's language (Czech: `;` and a
decimal comma; English: `,` and a decimal point). Hours are not rounded;
rounding for an invoice is the Organization's rule, so apply one only when
the person names it and say which.

## 5. Hand over

Give the person the totals (hours, of which to invoice) per client and
project, the open questions from step 3 and a link to the file
(`lazurio files link <path>`). Do not create or send an invoice, an e-mail or
a payroll record; prepare the text if asked and show it word for word first.
