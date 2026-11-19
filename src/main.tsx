import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadInitialState } from "./bootstrap";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("Missing #root element");
const root = createRoot(container);

try {
  const initial = await loadInitialState();
  root.render(
    <StrictMode>
      <App initial={initial} />
    </StrictMode>,
  );
} catch (error) {
  // No silent fallback to local mode: a broken server must be visible.
  root.render(
    <div className="notice" role="alert">
      Could not load data from the server: {(error as Error).message}
    </div>,
  );
}
