import { createContext, useContext } from "react";
import type { Language, Messages } from "../language/messages.ts";
import { ApiError, type Catalog, type KnownPerson, type Session, type StoredEntry } from "./api.ts";
import type { formats } from "./format.ts";

export interface AppState {
  session: Session;
  catalog: Catalog;
  people: KnownPerson[];
  /** The server's clock, ticking every second. */
  now: number;
  /** Today in the Organization's time zone. */
  today: string;
  /** Grows with every change of the data; pages load again when it does. */
  version: number;
  /** Load the catalog and the people again and tell every page. */
  changed: () => Promise<void>;
  /** Open an entry in the edit dialog. */
  edit: (entry: StoredEntry) => void;
  language: Language;
  t: Messages;
  fmt: ReturnType<typeof formats>;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp outside the App");
  return state;
}

/** A refusal as the person reads it: the App's own words for a known code. */
export function errorText(t: Messages, error: unknown): string {
  if (error instanceof ApiError) return t.errors[error.code] ?? error.message;
  return t.errors.unexpected ?? String(error);
}

/** A person as text: the username Lazurio stated, or a short form of the subject. */
export function personLabel(t: Messages, subject: string, name: string | null): string {
  return name ?? t.noName(subject);
}
