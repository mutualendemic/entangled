const HIDE_DELAY_MS = 180;

let activeLoads = 0;
let hideTimer = 0;

function getIndicator(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#global-loading-indicator");
}

export function beginPageLoad(): () => void {
  activeLoads += 1;
  window.clearTimeout(hideTimer);
  const indicator = getIndicator();
  if (indicator) {
    indicator.hidden = false;
    indicator.setAttribute("aria-busy", "true");
  }

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeLoads = Math.max(0, activeLoads - 1);
    if (activeLoads !== 0) return;

    hideTimer = window.setTimeout(() => {
      if (activeLoads !== 0) return;
      const currentIndicator = getIndicator();
      if (currentIndicator) {
        currentIndicator.hidden = true;
        currentIndicator.setAttribute("aria-busy", "false");
      }
    }, HIDE_DELAY_MS);
  };
}
