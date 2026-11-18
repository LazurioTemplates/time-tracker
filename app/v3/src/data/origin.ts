import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The channel a change came by (Module Standard, One data port: author and
 * channel): the interface or the page's tools. The person comes with each
 * write as its `actor`.
 */
export type Channel = "ui" | "mcp" | "webmcp" | "import" | "cli";

const CHANNEL = new AsyncLocalStorage<Channel>();

/** Runs `operation` with `channel` as the channel of every change it makes. */
export function withChannel<T>(channel: Channel, operation: () => T): T {
  return CHANNEL.run(channel, operation);
}

/** The channel of the change being made; null where nobody stated one. */
export function currentChannel(): Channel | null {
  return CHANNEL.getStore() ?? null;
}

/** How repository-db records a change's origin: kind and source. */
export function originOf(app: string): { kind: "app" | "agent" | "unknown"; source: string } {
  const channel = currentChannel();
  if (channel === null) return { kind: "unknown", source: app };
  const agent = channel === "mcp" || channel === "webmcp" || channel === "cli";
  return { kind: agent ? "agent" : "app", source: `${app}/${channel}` };
}
