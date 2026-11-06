# Who may see and change what

Lazurio decides who may open Time Tracker and with which application role;
Time Tracker decides in its server what each role may do (decisions
[0196](https://github.com/Lazurio/LazurioPlatform/blob/main/docs/decision-register.md#0196--module-data-the-environments-ceiling-narrowing-in-the-app-and-a-verified-identity-that-is-not-a-key)
and [0231](https://github.com/Lazurio/LazurioPlatform/blob/main/docs/decision-register.md#0231--access-in-an-organization-owner-admin-and-members-module-access-and-maintainers-application-admins-and-users)).
The App has no sign-in, roster or key of its own.

## Where the role comes from

For every request, APIs and downloads included, the server reads `appAccess`
of `@lazurio/module-kit` (`app/v3/src/server/viewer.ts`) and never caches it:

| `appAccess` | Time Tracker's viewer |
| --- | --- |
| `environment`: the person has the whole Environment | application admin, with the person |
| `app` with `admin` | application admin, with the person |
| `app` with `user` | application user, with the person |
| `local`: from inside the Environment (an agent, a script, the person's own computer without a gateway) | application admin without a person |
| `unknown`: through the gateway without a statement | no role |

A person is remembered by their Lazurio subject (`person` of an entry) and
shown by their username (`personName`). Nothing is ever taken from the
browser, the operating system, Git or the Environment's assignee.

## What each role may do

| | application user | application admin | no role |
| --- | --- | --- | --- |
| Start and stop their own timer | yes | yes, with a person | no |
| Write time by hand | for themselves | for anyone Time Tracker knows | no |
| See, correct, delete entries | their own | everyone's | no |
| Overview and CSV exports | their own time | everyone's, or one person's | no |
| Read projects and clients | yes | yes | no |
| Keep projects and clients | no | yes | no |
| See the whole draft, publish, return, take colleagues' work | no | yes | no |
| Data check | no | yes | no |

An application user who asks for another person's entry gets "not found",
never "forbidden", so the App does not say which entries exist. An
application user's changes wait in the Environment's one shared draft until
an application admin publishes it (0196: only someone who sees the whole
draft may publish it); the user sees their own entries marked "unpublished".

An application admin without a person (from inside the Environment) has no
timer of their own: they write time by hand for a person Time Tracker already
knows from that person's own entries. A person's first entry is their own.

## Its boundary

The narrowing holds against people who have only the App. It is a service of
the Environment's operator, not isolation against them: whoever runs the
Environment can read its data checkout and reach the App's loopback port
(0196). An Organization that needs per-person isolation against the operator
keeps its time in a store that verifies identity itself.

## While the gateway does not state who came

`appAccess` is the stable contract of Lazurio, decided and released with
module-kit 0.3.0; it reaches people only on Environments whose gateway states
the person and the entry (LazurioPlatform, Module Standard, "Who came and with
which role"). Before that, a visitor through the gateway reads `unknown`, and
Time Tracker shows "Lazurio did not say who you are" and nothing else. Inside
the Environment it works as an application admin without a person. Nothing in
Time Tracker changes when the gateway gains the capability.
