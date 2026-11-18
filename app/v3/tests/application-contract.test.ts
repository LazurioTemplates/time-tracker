import { describe, expect, test } from "bun:test";
import { withHealth } from "@lazurio/module-kit";
import {
  gatewayRequest,
  hostedEnvironment,
  localEnvironment,
  TEST_ORIGIN,
} from "@lazurio/module-kit/tools/testing";
import { createMemoryStore } from "../src/data/memory-store.ts";
import { createApi } from "../src/server/api.ts";
import { mayWriteOf, viewerOf } from "../src/server/viewer.ts";
import { NOW, POLICY, sampleData } from "./support/seed.ts";

/**
 * The contract of a ready Application (Module Standard, Applications of an
 * Organization; docs/module-readiness.md): who came only through `appAccess`,
 * no role grants nothing, one writer rule (`dataWriter` of the module kit) and
 * a deep health. The requests are the Application host's gateway's, built by
 * `@lazurio/module-kit/tools/testing`.
 */

type Env = Record<string, string | undefined>;

function api(env: Env) {
  const store = createMemoryStore(sampleData(), { policy: POLICY, now: () => NOW });
  const handle = createApi(store, {
    allowedOrigins: new Set([TEST_ORIGIN]),
    viewer: (request) => {
      const saved = { ...process.env };
      Object.assign(process.env, env);
      try {
        return viewerOf(request);
      } finally {
        for (const key of Object.keys(env)) if (!(key in saved)) delete process.env[key];
        Object.assign(process.env, saved);
      }
    },
    mayWrite: (request) => mayWriteOf(request, env),
    policy: POLICY,
    organization: "Example",
    language: "en",
    now: () => NOW,
  });
  return { handle, store };
}

const write = (
  caller: Parameters<typeof gatewayRequest>[1] extends infer O
    ? O extends { caller?: infer C }
      ? C
      : never
    : never,
) =>
  gatewayRequest("/api/clients", {
    caller,
    origin: TEST_ORIGIN,
    body: { name: "Contract client" },
  });

describe("the Application's writer rule", () => {
  test("on the application host, true writes", async () => {
    const { handle } = api(hostedEnvironment({ writer: true }));
    const response = await handle(write({ role: "admin" }));
    expect(response.status).toBe(201);
  });

  test("on the application host, false refuses every change before the store", async () => {
    const { handle } = api(hostedEnvironment({ writer: false }));
    const response = await handle(write({ role: "admin" }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("data_read_only");
  });

  test("any value other than true refuses", async () => {
    const { handle } = api(hostedEnvironment({ extra: { LAZURIO_RUNTIME_DATA_WRITER: "TRUE" } }));
    const response = await handle(write({ role: "admin" }));
    expect(response.status).toBe(409);
  });

  test("without the variable, a person who has only the application cannot write", async () => {
    const env = { ...hostedEnvironment(), LAZURIO_RUNTIME_DATA_WRITER: undefined };
    const { handle } = api(env);
    const response = await handle(write({ role: "admin" }));
    expect(response.status).toBe(409);
  });

  test("without the variable, the Environment's own entry writes (development version)", async () => {
    const env = { ...hostedEnvironment(), LAZURIO_RUNTIME_DATA_WRITER: undefined };
    const { handle } = api(env);
    const response = await handle(write({ role: "environment" }));
    expect(response.status).toBe(201);
  });

  test("reading never needs the writer", async () => {
    const { handle } = api(hostedEnvironment({ writer: false }));
    const response = await handle(gatewayRequest("/api/catalog", { caller: { role: "user" } }));
    expect(response.status).toBe(200);
  });
});

describe("who came", () => {
  test("a request through the gateway without a role gets nothing", async () => {
    const { handle } = api(hostedEnvironment({ writer: true }));
    const read = await handle(gatewayRequest("/api/entries", { caller: { role: "none" } }));
    expect(read.status).toBe(403);
    const change = await handle(write({ role: "none" }));
    expect(change.status).toBe(403);
  });

  test("a local entry in a development version is an Application Admin without a name", async () => {
    const env = localEnvironment();
    const request = new Request("http://127.0.0.1:43100/api/session");
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      expect(viewerOf(request).viewer.role).toBe("admin");
      expect(mayWriteOf(request, env)).toBe(true);
    } finally {
      for (const key of Object.keys(env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
  });
});

describe("deep health", () => {
  test("health answers 503 until the data are open, then 200", async () => {
    let open = false;
    const health = withHealth(
      () => new Response("app"),
      "/healthz",
      () => open,
    );
    expect((await health(new Request(`${TEST_ORIGIN}/healthz`))).status).toBe(503);
    open = true;
    expect((await health(new Request(`${TEST_ORIGIN}/healthz`))).status).toBe(200);
  });

  test("the App's health reads the store's availability", async () => {
    const store = createMemoryStore(sampleData(), { policy: POLICY, now: () => NOW });
    expect((await store.available()).ok).toBe(true);
  });
});
