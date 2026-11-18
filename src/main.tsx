import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadInitialState } from "./bootstrap";
import "./styles.css";

const initial = await loadInitialState();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App initial={initial} />
  </StrictMode>,
);
