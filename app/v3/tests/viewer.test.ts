import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GATEWAY_HEADERS } from "@lazurio/module-kit";
import { viewerOf } from "../src/server/viewer.ts";
import { ALEX } from "./support/seed.ts";

// The App's role comes only from Lazurio's statement (`appAccess` of
// module-kit). These requests use the gateway's transport the way module-kit
// documents it for a Module's own tests.
const HOST = "time-tracker.example.lazurio.test";
const env = {
  LAZURIO_RUNTIME_LISTENER_APP_HOST: "127.0.0.1",
  LAZURIO_RUNTIME_LISTENER_APP_PORT: "24905",
  LAZURIO_RUNTIME_LISTENER_APP_EXTERNAL_ORIGIN: `https://${HOST}`,
};
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const [key, value] of Object.entries(env)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved))
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
});

const request = (headers: Record<string, string>, host = HOST) =>
  new Request(`https://${host}/api/session`, { headers: { host, ...headers } });

describe("the viewer comes from Lazurio", () => {
  test("an application user with a person", () => {
    const { viewer, entry } = viewerOf(
      request({
        [GATEWAY_HEADERS.entry]: "app",
        [GATEWAY_HEADERS.appRole]: "user",
        [GATEWAY_HEADERS.subject]: ALEX,
        [GATEWAY_HEADERS.username]: "alexmorgan",
      }),
    );
    expect(entry).toBe("app");
    expect(viewer).toEqual({ role: "user", person: { subject: ALEX, username: "alexmorgan" } });
  });

  test("the whole Environment is an application admin", () => {
    const { viewer } = viewerOf(
      request({ [GATEWAY_HEADERS.entry]: "environment", [GATEWAY_HEADERS.subject]: ALEX }),
    );
    expect(viewer).toEqual({ role: "admin", person: { subject: ALEX, username: null } });
  });

  test("through the gateway without a statement there is no role, whatever the browser says", () => {
    expect(viewerOf(request({})).viewer.role).toBeNull();
    expect(
      viewerOf(request({ [GATEWAY_HEADERS.appRole]: "admin", "x-user": "alexmorgan" })).viewer.role,
    ).toBeNull();
  });

  test("a request to loopback is the Environment's own: an admin without a name", () => {
    expect(viewerOf(request({}, "127.0.0.1:24905")).viewer).toEqual({
      role: "admin",
      person: null,
    });
  });
});
