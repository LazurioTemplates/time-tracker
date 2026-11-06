import {
  parseYaml,
  REVIEW_SURFACE_CONTRACT_VERSION,
  type ResourceChangeKind,
  type ReviewableResource,
  type ReviewFieldSummary,
  type ReviewInputChange,
  type ReviewSurfaceAdapter,
  type ReviewTechnicalReference,
  structuralDiff,
} from "@lazurio/repository-db";
import { localDay } from "../domain/calendar.ts";
import { COLLECTION_NAMES, type CollectionName } from "../domain/collections.ts";
import type { Policy } from "../domain/policy.ts";
import { type Language, messages } from "../language/messages.ts";

/** Bookkeeping fields every save changes, and the subject the name stands for; the review leaves them out. */
const HIDDEN = new Set(["updatedAt", "updatedBy", "person"]);
const MOMENTS = new Set(["startedAt", "endedAt", "autoStoppedAt"]);
/** The order a reviewer reads the fields in; the engine lists them by key. */
const ORDER = [
  "name",
  "client",
  "billable",
  "archived",
  "personName",
  "project",
  "startedAt",
  "endedAt",
  "autoStoppedAt",
  "note",
  "source",
];
const rank = (fieldPath: string) => {
  const index = ORDER.indexOf(fieldPath.split("/")[1] ?? "");
  return index === -1 ? ORDER.length : index;
};

/** Names the review shows instead of ids. */
export interface ReviewNames {
  clients: ReadonlyMap<string, string>;
  projects: ReadonlyMap<string, string>;
}

type Plain = Record<string, unknown>;

/** A day as people of the language write it: `6. 11. 2026` or `06/11/2026`. */
function dateText(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(Date.parse(`${day}T00:00:00Z`));
}

export function recordOfPath(path: string): { collection: CollectionName; id: string } | null {
  const match = /^data\/([a-z]+)\/([^/]+)\.yaml$/.exec(path);
  if (!match?.[1] || !match[2]) return null;
  const collection = match[1] as CollectionName;
  if (!COLLECTION_NAMES.includes(collection)) return null;
  try {
    return { collection, id: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function recordOfText(text: string | undefined): Plain | undefined {
  if (text === undefined) return undefined;
  try {
    const document = parseYaml(text) as { record?: unknown } | null;
    const record = document?.record;
    return record && typeof record === "object" && !Array.isArray(record)
      ? (record as Plain)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One changed record as a reviewer recognises it: an entry by person,
 * project and day, a project or client by its name, with the changed fields
 * named in the App's language and moments in the Organization's time zone.
 */
export function reviewResource(input: {
  collection: CollectionName;
  id: string;
  before: Plain | undefined;
  after: Plain | undefined;
  changeId: string;
  kind: ResourceChangeKind;
  technicalRefs: readonly ReviewTechnicalReference[];
  names: ReviewNames;
  policy: Policy;
  language: Language;
}): ReviewableResource {
  const { collection, id, before, after, names, policy } = input;
  const t = messages[input.language];
  const value = after ?? before ?? {};
  const moment = new Intl.DateTimeFormat(t.locale, {
    timeZone: policy.timeZone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const show = (key: string, raw: unknown, fallback: string | undefined) => {
    if (raw === undefined) return fallback;
    if (MOMENTS.has(key) && typeof raw === "string") return moment.format(Date.parse(raw));
    if (key === "project" && typeof raw === "string") return names.projects.get(raw) ?? raw;
    if (key === "client" && typeof raw === "string") return names.clients.get(raw) ?? raw;
    if (key === "client" && raw === null) return t.ownWork;
    if (typeof raw === "boolean") return raw ? t.yes : t.no;
    if (key === "source") return raw === "timer" ? t.csv.timer : t.csv.manual;
    return fallback;
  };
  const diff = structuralDiff(before ?? {}, after ?? {}, { maxFields: 16 });
  const sorted = [...diff.fields].sort((a, b) => rank(a.fieldPath) - rank(b.fieldPath));
  const fields: ReviewFieldSummary[] = sorted.flatMap((field) => {
    const key = field.fieldPath.split("/")[1] ?? "";
    if (HIDDEN.has(key)) return [];
    // A field that is empty before and after (a new entry without an automatic stop) says nothing.
    if ((before?.[key] ?? null) === null && (after?.[key] ?? null) === null) return [];
    const beforeSummary = show(key, before?.[key], field.beforeSummary);
    const afterSummary = show(key, after?.[key], field.afterSummary);
    return [
      {
        ...field,
        label: t.review.fields[key] ?? field.label,
        ...(beforeSummary === undefined ? {} : { beforeSummary }),
        ...(afterSummary === undefined ? {} : { afterSummary }),
      },
    ];
  });
  const name = typeof value.name === "string" ? value.name : id;
  const label =
    collection === "entries"
      ? [
          typeof value.personName === "string" ? value.personName : t.review.noName,
          names.projects.get(String(value.project)) ?? String(value.project),
          typeof value.startedAt === "string"
            ? dateText(localDay(value.startedAt, policy.timeZone), t.locale)
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : name;
  const kind = input.kind;
  return {
    appId: "time-tracker",
    resourceType: collection,
    stableResourceId: `${collection}:${id}`,
    label,
    routeTarget: {
      href: collection === "entries" ? "#/entries" : "#/projects",
      label: t.review.open,
    },
    changes: [
      {
        changeId: input.changeId,
        kind,
        summary:
          kind === "created"
            ? t.review.created
            : kind === "deleted"
              ? t.review.deleted
              : t.review.changed(fields.length),
        technicalRefs: [...input.technicalRefs],
        fields,
      },
    ],
    fallback: { activeLevel: "resource_adapter", steps: [] },
    metadata: { typeLabel: t.review.types[collection] },
  };
}

/** The repository-db review adapter of Time Tracker's three collections. */
export function createReviewAdapter(
  names: ReviewNames,
  policy: Policy,
  language: Language,
): ReviewSurfaceAdapter {
  return {
    id: "time-tracker-v3",
    appId: "time-tracker",
    contractVersion: REVIEW_SURFACE_CONTRACT_VERSION,
    adapterVersion: "1.0.0",
    supportedPathGlobs: COLLECTION_NAMES.map((name) => `data/${name}/*.yaml`),
    toReviewableResources(changes: readonly ReviewInputChange[]): ReviewableResource[] {
      return changes.flatMap((change) => {
        const path = change.technicalRefs[0]?.path ?? "";
        const record = recordOfPath(path);
        if (!record) return [];
        return [
          reviewResource({
            ...record,
            before: recordOfText(change.baselineText),
            after: recordOfText(change.draftText),
            changeId: change.changeId,
            kind: change.kind === "renamed" ? "modified" : change.kind,
            technicalRefs: change.technicalRefs,
            names,
            policy,
            language,
          }),
        ];
      });
    },
  };
}
