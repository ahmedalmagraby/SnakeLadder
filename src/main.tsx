import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

/**
 * (P3) Last-resort handlers.
 *
 * A rejected promise or an uncaught error outside React's tree (a WebRTC
 * callback, an audio-context failure, a worker message) is otherwise invisible:
 * the app keeps running with a silently broken subsystem. Log both with a
 * prefix so they are greppable in a bug report.
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Snake & Ladder] Unhandled promise rejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[Snake & Ladder] Uncaught error:', event.error ?? event.message);
});

const container = document.getElementById("root");
if (!container) {
  throw new Error('Root container #root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
