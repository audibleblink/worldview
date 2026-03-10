/**
 * WorldView - SolidJS Entry Point
 * 
 * Minimal entry point to verify SolidJS is working.
 * This will be expanded in Phase 1+ to include CesiumProvider and full app.
 */

import { render } from "solid-js/web";

/**
 * Minimal App component to verify SolidJS rendering
 */
function App() {
  return (
    <div style={{ 
      display: "flex", 
      "justify-content": "center", 
      "align-items": "center",
      height: "100vh",
      "font-family": "monospace",
      "font-size": "2rem",
      color: "#00ff00",
      "background-color": "#0a0a0a",
    }}>
      <h1>WorldView</h1>
    </div>
  );
}

// Mount to #app container
const container = document.getElementById("app");
if (container) {
  // Clear existing content before mounting SolidJS
  container.innerHTML = "";
  render(() => <App />, container);
} else {
  console.error("WorldView: #app container not found");
}
