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
let diagnosticsChannel = null;

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
      renderEncounterControls(message.data);
      return;
    }
    if (message.data?.kind === "developer-encounter-trigger-result") {
      renderTriggerResult(message.data);
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
    return;
  }

  encounterControls.hidden = false;
  encounterStatus.textContent = "Waiting for game connection.";
  postDeveloperMessage({ kind: "developer-diagnostics-ready" });
}

function renderEncounterControls(message) {
  if (!message.developerControlsEnabled) {
    encounterControls.hidden = true;
    encounterButtons.replaceChildren();
    encounterStatus.textContent = "Developer controls are disabled.";
    return;
  }

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

function renderTriggerResult(message) {
  const labels = {
    accepted: "Encounter trigger accepted.",
    "no-running-game": "No game is actively running.",
    "active-encounter": "Another encounter is currently active.",
    "unknown-encounter": "Encounter ID is unknown.",
    "developer-controls-disabled": "Developer controls are disabled."
  };
  encounterStatus.textContent = labels[message.reason] ?? `Encounter trigger rejected: ${message.reason}.`;
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
