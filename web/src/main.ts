import "./style.css";
import { mountApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("App root not found");
}

void mountApp(root);