import {
  DIAGNOSTIC_CHANNEL_NAME,
  DIAGNOSTIC_EVENT_LIMIT,
  DIAGNOSTIC_SCHEMA_VERSION,
  createDiagnosticsReport
} from "./diagnostics.js";
import { CONFIG, developerControlsEnabled } from "./config.js";

const events = [];
let droppedEventCount = 0;
let latestReport = createDiagnosticsReport(events);

const meta = document.querySelector("#diagnostic-meta");
const result = document.querySelector("#diagnostic-result");
const summary = document.querySelector("#diagnostic-summary");
const warnings = document.querySelector("#diagnostic-warnings");
const eventList = document.querySelector("#diagnostic-events");
const reportText = document.querySelector("#diagnostic-report");
const copyButton = document.querySelector("#copy-report");
const downloadButton = document.querySelector("#download-json");
const encounterControls = document.querySelector("#encounter-controls");
const encounterButtons = document.querySelector("#encounter-buttons");
const encounterStatus = document.querySelector("#encounter-trigger-status");
const swimmerTierControls = document.querySelector("#swimmer-tier-controls");
const swimmerTierButtons = document.querySelector("#swimmer-tier-buttons");
const swimmerTierStatus = document.querySelector("#swimmer-tier-status");
const returnLiveRunButton = document.querySelector("#return-live-run");
let diagnosticsChannel = null;
let latestDeveloperState = null;

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(latestReport.text);
  } catch {
    fallbackCopy(latestReport.text);
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(withoutText(latestReport), null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${latestReport.metadata.runId ?? "surf-run"}-diagnostics.json`;
  link.click();
  URL.revokeObjectURL(url);
});

try {
  diagnosticsChannel = new BroadcastChannel(DIAGNOSTIC_CHANNEL_NAME);
  diagnosticsChannel.addEventListener("message", (message) => {
    if (message.data?.kind === "diagnostic-event") {
      receiveEvent(message.data.event);
      return;
    }
    if (message.data?.kind === "developer-diagnostics-state") {
      latestDeveloperState = message.data;
      renderDeveloperControls(message.data);
      return;
    }
    if (message.data?.kind === "developer-encounter-trigger-result") {
      renderTriggerResult(message.data);
      return;
    }
    if (message.data?.kind === "developer-swimmer-tier-trigger-result") {
      renderSwimmerTierTriggerResult(message.data);
      return;
    }
    if (message.data?.kind === "developer-swimmer-tier-stop-result") {
      renderSwimmerTierStopResult(message.data);
    }
  });
} catch {
  summary.textContent = "BroadcastChannel is unavailable in this browser.";
}

setupEncounterControls();
render();

function receiveEvent(event) {
  if (event.type === "game.start") {
    events.length = 0;
    droppedEventCount = 0;
  }

  if (events.length < DIAGNOSTIC_EVENT_LIMIT) {
    events.push(event);
  } else {
    droppedEventCount += 1;
  }

  latestReport = createDiagnosticsReport(events, { droppedEventCount });
  render();
}

function render() {
  meta.textContent = `${latestReport.metadata.gameVersion} / ${DIAGNOSTIC_SCHEMA_VERSION} / ${latestReport.metadata.runId ?? "no run captured"}`;
  result.textContent = latestReport.summary.result;
  result.className = latestReport.summary.result.toLowerCase();
  summary.textContent = `${events.length} events captured, ${droppedEventCount} dropped. Final score: ${latestReport.summary.finalScore ?? "not captured"}.`;
  reportText.textContent = latestReport.text;

  warnings.replaceChildren();
  const warningLines = [...latestReport.warnings, ...latestReport.errors];
  if (!warningLines.length) {
    warnings.appendChild(listItem("None"));
  } else {
    for (const warning of warningLines.slice(-20)) {
      warnings.appendChild(listItem(warning));
    }
  }

  eventList.replaceChildren();
  for (const event of events.slice(-80).reverse()) {
    eventList.appendChild(listItem(`#${event.sequence} ${event.elapsedSeconds.toFixed(2)}s ${event.type}`));
  }
}

function setupEncounterControls() {
  if (!developerControlsEnabled(CONFIG)) {
    encounterControls.hidden = true;
    swimmerTierControls.hidden = true;
    return;
  }

  encounterControls.hidden = false;
  swimmerTierControls.hidden = false;
  encounterStatus.textContent = "Waiting for game connection.";
  swimmerTierStatus.textContent = "Waiting for game connection.";
  returnLiveRunButton.addEventListener("click", () => {
    const requestId = `swimmer-stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    swimmerTierStatus.textContent = "Requesting live run.";
    postDeveloperMessage({
      kind: "developer-swimmer-tier-stop",
      requestId
    });
  });
  postDeveloperMessage({ kind: "developer-diagnostics-ready" });
}

function renderDeveloperControls(message) {
  if (!message.developerControlsEnabled) {
    encounterControls.hidden = true;
    swimmerTierControls.hidden = true;
    encounterButtons.replaceChildren();
    swimmerTierButtons.replaceChildren();
    encounterStatus.textContent = "Developer controls are disabled.";
    swimmerTierStatus.textContent = "Developer controls are disabled.";
    return;
  }

  renderEncounterControls(message);
  renderSwimmerTierControls(message);
}

function renderEncounterControls(message) {
  encounterControls.hidden = false;
  encounterButtons.replaceChildren();
  for (const encounter of message.encounters ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Trigger ${encounter.label}`;
    button.addEventListener("click", () => {
      const requestId = `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      encounterStatus.textContent = `Requesting ${encounter.label}.`;
      postDeveloperMessage({
        kind: "developer-encounter-trigger",
        requestId,
        encounterId: encounter.id
      });
    });
    encounterButtons.appendChild(button);
  }

  if (encounterButtons.childElementCount === 0) {
    encounterStatus.textContent = "No registered encounters available.";
  } else {
    encounterStatus.textContent = "Ready.";
  }
}

function renderSwimmerTierControls(message) {
  swimmerTierControls.hidden = false;
  swimmerTierButtons.replaceChildren();
  for (const tier of message.swimmerTiers ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Play ${tier.label}`;
    button.addEventListener("click", () => {
      const requestId = `swimmer-tier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      swimmerTierStatus.textContent = `Requesting ${tier.label}.`;
      postDeveloperMessage({
        kind: "developer-swimmer-tier-trigger",
        requestId,
        tierId: tier.id
      });
    });
    swimmerTierButtons.appendChild(button);
  }

  const activeTier = (message.swimmerTiers ?? []).find((tier) => tier.id === message.activeDebugSwimmerTierId);
  if (activeTier) {
    swimmerTierStatus.textContent = `Active test: ${activeTier.label}.`;
  } else if (swimmerTierButtons.childElementCount === 0) {
    swimmerTierStatus.textContent = "No playable swimmer tiers available.";
  } else {
    swimmerTierStatus.textContent = "Live run active.";
  }
}

function renderTriggerResult(message) {
  const labels = {
    accepted: "Encounter trigger accepted.",
    "no-running-game": "No game is actively running.",
    "active-encounter": "Another encounter is currently active.",
    "active-swimmer-tier-test": "A swimmer tier test is currently active.",
    "unknown-encounter": "Encounter ID is unknown.",
    "developer-controls-disabled": "Developer controls are disabled."
  };
  encounterStatus.textContent = labels[message.reason] ?? `Encounter trigger rejected: ${message.reason}.`;
}

function renderSwimmerTierTriggerResult(message) {
  const tier = (latestDeveloperState?.swimmerTiers ?? []).find((candidate) => candidate.id === message.tierId);
  const labels = {
    accepted: tier ? `Active test: ${tier.label}.` : "Swimmer tier test accepted.",
    "developer-controls-disabled": "Developer controls are disabled.",
    "no-running-game": "No game is actively running.",
    "unknown-tier": "Swimmer tier ID is unknown.",
    "tier-not-playable": "Swimmer tier is not playable.",
    "active-encounter": "An encounter is currently active."
  };
  swimmerTierStatus.textContent = labels[message.reason] ?? `Swimmer tier trigger rejected: ${message.reason}.`;
}

function renderSwimmerTierStopResult(message) {
  const labels = {
    accepted: "Live run active.",
    "developer-controls-disabled": "Developer controls are disabled.",
    "no-running-game": "No game is actively running.",
    "live-run-active": "Live run is already active."
  };
  swimmerTierStatus.textContent = labels[message.reason] ?? `Return to live run rejected: ${message.reason}.`;
}

function postDeveloperMessage(message) {
  try {
    diagnosticsChannel?.postMessage?.(message);
  } catch {
    encounterStatus.textContent = "Unable to send developer command.";
  }
}

function listItem(text) {
  const item = document.createElement("li");
  item.textContent = text;
  return item;
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function withoutText(report) {
  const { text, ...json } = report;
  return json;
}
