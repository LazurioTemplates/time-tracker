/**
 * The two ways a module may depend on the design system (design system
 * docs/adoption.md "Adding it to a module"; this template's
 * docs/extending.md "The design system"), always at a released tag:
 *
 * - a template of the Marketplace: `github:<owner>/design-system#v<semver>`;
 * - a module of an Organization with its own, private design system:
 *   `git+ssh://git@github.com/<owner>/design-system.git#v<semver>`.
 *
 * Never a branch, a bare commit, `file:`, a path or another transport.
 */
export type DesignSystemPin = Readonly<{
  form: "github" | "git+ssh";
  owner: string;
  tag: string;
}>;

const OWNER = "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})";
const RELEASE = "v(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const GITHUB = new RegExp(`^github:(${OWNER})/design-system#(${RELEASE})$`);
const SSH = new RegExp(
  `^git\\+ssh://git@github\\.com/(${OWNER})/design-system\\.git#(${RELEASE})$`,
);

/** The pin of a `package.json` dependency, or why it is not one of the two forms. */
export function parsePin(value: unknown): DesignSystemPin | string {
  if (typeof value !== "string") return "the App has no design-system dependency";
  const github = GITHUB.exec(value);
  if (github?.[1] && github[2]) return { form: "github", owner: github[1], tag: github[2] };
  const ssh = SSH.exec(value);
  if (ssh?.[1] && ssh[2]) return { form: "git+ssh", owner: ssh[1], tag: ssh[2] };
  return `${value} is neither github:<owner>/design-system#v<semver> nor git+ssh://git@github.com/<owner>/design-system.git#v<semver>`;
}

/** `bun.lock` is JSON with trailing commas. */
function parseLock(text: string): Record<string, unknown> {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, "$1")) as Record<string, unknown>;
}

/**
 * Problems of a module's `package.json` and `bun.lock` with the design system;
 * empty when the dependency is one of the two forms at a released tag and the
 * lock records exactly that dependency, resolved:
 *
 * - `github:`: Bun downloads the tag's tarball and records the tag's object and
 *   the tarball's `sha512`;
 * - `git+ssh`: Bun clones over SSH and records the full commit of the tag.
 */
export function designSystemProblems(packageJsonText: string, lockText: string): string[] {
  const manifest = JSON.parse(packageJsonText) as { dependencies?: Record<string, unknown> };
  const value = manifest.dependencies?.["design-system"];
  const pin = parsePin(value);
  if (typeof pin === "string") return [pin];
  let lock: Record<string, unknown>;
  try {
    lock = parseLock(lockText);
  } catch {
    return ["bun.lock is not readable"];
  }
  const workspaces = lock.workspaces as Record<string, { dependencies?: Record<string, string> }>;
  const declared = workspaces?.[""]?.dependencies?.["design-system"];
  if (declared !== value)
    return [
      `bun.lock records ${String(declared)} for design-system, package.json ${String(value)}`,
    ];
  const entry = (lock.packages as Record<string, unknown[]> | undefined)?.["design-system"];
  const resolved = entry?.[0];
  const integrity = entry?.at(-1);
  if (typeof resolved !== "string") return ["bun.lock has not resolved design-system"];
  const owner = pin.owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (pin.form === "github") {
    if (
      !new RegExp(`^design-system@github:${owner}/design-system#[0-9a-f]{7,40}$`, "i").test(
        resolved,
      )
    )
      return [`bun.lock resolves design-system to ${resolved}, not ${pin.owner}'s tag`];
    if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(integrity))
      return ["bun.lock records no sha512 of the design system's tarball"];
    return [];
  }
  const ssh = new RegExp(
    `^design-system@git\\+ssh://git@github\\.com/${owner}/design-system\\.git#([0-9a-f]{40})$`,
    "i",
  ).exec(resolved);
  if (!ssh)
    return [`bun.lock resolves design-system to ${resolved}, not a commit of ${pin.owner}'s tag`];
  if (integrity !== ssh[1])
    return ["bun.lock records another commit than it resolved for design-system"];
  return [];
}
