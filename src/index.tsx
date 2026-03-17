import { render } from "solid-js/web";
import { App } from "./App";

const container = document.getElementById("app");
if (container) {
  container.innerHTML = "";
  render(() => <App />, container);
} else {
  console.error("WorldView: #app container not found");
}
