# An adopted module with its Organization's own design system

What `docs/adoption.md` and `docs/extending.md` ("The design system") make of
`app/v3/package.json` and `app/v3/bun.lock` in an Organization that released
its own design system: the dependency over SSH at a released tag, and the
lock Bun 1.4.4 writes for it (the full commit of the tag). The Organization
and the commit are invented. `tests/design-system.test.ts` checks that the
template's test of the dependency accepts this.
