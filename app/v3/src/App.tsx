import { greeting } from "./greeting.ts";

const TITLE = "Time Tracker";
const MODULE = "time-tracker";
const ORGANIZATION = "REPLACE-WITH-ORG-NAME";

export function App() {
  return (
    <main>
      <h1>{greeting(TITLE)}</h1>
      <p>
        Modul {MODULE} Organizace {ORGANIZATION} běží podle Lazurio Module Standardu.
      </p>
    </main>
  );
}
