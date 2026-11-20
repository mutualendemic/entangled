import "./style.css";
import { mountApp } from "./app";
import { beginPageLoad } from "./services/loading";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("App root not found");
}

const finishInitialLoad = beginPageLoad();
void mountApp(root).finally(finishInitialLoad);