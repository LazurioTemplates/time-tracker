import { PERIODS, type Period } from "../domain/report.ts";

/** The App's pages, addressed by the URL hash so a reload keeps the page. */
export type Route =
  | { page: "today" }
  | { page: "entries" }
  | { page: "report"; period: Period; day: string | null }
  | { page: "projects" }
  | { page: "draft" }
  | { page: "not-found" };

export function parseRoute(hash: string): Route {
  const [path = "", search = ""] = hash.replace(/^#/, "").split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(search);
  if (parts.length === 0) return { page: "today" };
  if (parts.length > 1) return { page: "not-found" };
  switch (parts[0]) {
    case "entries":
      return { page: "entries" };
    case "report": {
      const period = PERIODS.find((value) => value === params.get("period")) ?? "week";
      const day = params.get("day");
      return { page: "report", period, day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null };
    }
    case "projects":
      return { page: "projects" };
    case "draft":
      return { page: "draft" };
    default:
      return { page: "not-found" };
  }
}

export function href(route: Route): string {
  switch (route.page) {
    case "today":
      return "#/";
    case "entries":
      return "#/entries";
    case "report":
      return `#/report?period=${route.period}${route.day ? `&day=${route.day}` : ""}`;
    case "projects":
      return "#/projects";
    case "draft":
      return "#/draft";
    case "not-found":
      return "#/";
  }
}
