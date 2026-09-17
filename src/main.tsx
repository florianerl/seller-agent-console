import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { watchInstallability } from "./pwa/install";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

root.dataset["build"] = __BUILD_ID__;

// Before render, not in an effect: Chrome fires beforeinstallprompt once and
// early, and a listener attached after the first paint can miss it entirely.
watchInstallability();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
