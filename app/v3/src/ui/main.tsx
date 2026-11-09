import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The design system is the package `design-system` at a released tag
// (package.json): its tokens, fonts, base styles and components, once.
import "design-system/styles.css";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
