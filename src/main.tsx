import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

root.dataset["build"] = __BUILD_ID__;

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
