import {
  DIAGNOSTIC_CHANNEL_NAME,
  DIAGNOSTIC_EVENT_LIMIT,
  DIAGNOSTIC_SCHEMA_VERSION,
  createDiagnosticsReport
} from "./diagnostics.js";

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
  const channel = new BroadcastChannel(DIAGNOSTIC_CHANNEL_NAME);
  channel.addEventListener("message", (message) => {
    if (message.data?.kind !== "diagnostic-event") return;
    receiveEvent(message.data.event);
  });
} catch {
  summary.textContent = "BroadcastChannel is unavailable in this browser.";
}

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
