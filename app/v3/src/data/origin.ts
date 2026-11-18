import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The channel a change came by (Module Standard, One data port: author and
 * channel): the interface (`ui`), the page's tools (`webmcp`) or an agent's
 * command line (`cli`, the `record-time` skill's request). The person comes
 * with each write as its `actor`.
 */
export type Channel = "ui" | "mcp" | "webmcp" | "import" | "cli";

const CHANNELS: readonly Channel[] = ["ui", "mcp", "webmcp", "import", "cli"];

/** The channel a request states in its header; null when it states none it knows. */
export function channelOf(stated: string | null): Channel | null {
  return CHANNELS.find((channel) => channel === stated) ?? null;
}

const CHANNEL = new AsyncLocalStorage<{ channel: Channel | null }>();

/** Runs `operation` with `channel` (null: not stated) as the channel of every change it makes. */
export function withChannel<T>(channel: Channel | null, operation: () => T): T {
  return CHANNEL.run({ channel }, operation);
}

/** The channel of the change being made; null where nobody stated one. */
export function currentChannel(): Channel | null {
  return CHANNEL.getStore()?.channel ?? null;
}

/** How repository-db records a change's origin: kind and source. */
export function originOf(app: string): { kind: "app" | "agent" | "unknown"; source: string } {
  const channel = currentChannel();
  if (channel === null) return { kind: "unknown", source: app };
  const agent = channel === "mcp" || channel === "webmcp" || channel === "cli";
  return { kind: agent ? "agent" : "app", source: `${app}/${channel}` };
}
