import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The design system is the subtree app/v3/design-system, a merged release of
// LazurioTemplates/design-system: its tokens become CSS custom properties and
// its stylesheet gives the App frame and the components. Nothing of it is
// copied here; a newer release arrives by merging its tag.
import { tokenStylesheet, tokens } from "../../design-system/app/v1/src/tokens.ts";
import "../../design-system/app/v1/src/styles/global.css";
import { App } from "./App.tsx";
import "./styles.css";

const style = document.createElement("style");
style.dataset.tokens = "design-system";
style.textContent = tokenStylesheet(tokens);
document.head.prepend(style);

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
