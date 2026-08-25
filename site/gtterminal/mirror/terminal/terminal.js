const ROUTES = Object.freeze({
  systems: "systems.html",
  artifacts: "artifacts/vanille-spatial-relief/",
  research: "research.html",
  play: "Games/Index.html",
  tools: "Lab%20tools/Index.HTML"
});

const COMMAND_HELP = "AVAILABLE: help · systems · artifacts · research · play · tools · status · clear";

const crt = document.querySelector(".crt");
const nodeState = document.querySelector("#node-state");
const systemStatus = document.querySelector("#system-status");
const output = document.querySelector("#terminal-output");
const bootLines = [...document.querySelectorAll("#boot-log li")];
const form = document.querySelector("#command-form");
const input = document.querySelector("#command-input");
const routeLinks = [...document.querySelectorAll("[data-command]")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function appendResult(message, tone = "normal") {
  const existing = output.querySelector(".command-result");
  if (existing) existing.remove();

  const result = document.createElement("p");
  result.className = "command-result";
  result.dataset.tone = tone;
  result.textContent = message;
  output.append(result);
  result.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
}

function selectRoute(command) {
  for (const link of routeLinks) {
    link.classList.toggle("is-active", link.dataset.command === command);
  }
}

function finishBoot() {
  crt.dataset.terminalState = "ready";
  nodeState.textContent = "NODE ONLINE";
  systemStatus.textContent = "NOMINAL";
  input.focus({ preventScroll: true });
}

function runBoot() {
  if (reducedMotion) {
    for (const line of bootLines) line.classList.add("is-visible");
    finishBoot();
    return;
  }

  bootLines.forEach((line, index) => {
    window.setTimeout(() => line.classList.add("is-visible"), 160 + index * 230);
  });
  window.setTimeout(finishBoot, 160 + bootLines.length * 230);
}

function executeCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase();

  if (!command) {
    appendResult(COMMAND_HELP);
    return;
  }

  if (command === "help") {
    appendResult(COMMAND_HELP);
    return;
  }

  if (command === "status") {
    appendResult("NODE ONLINE · 52-FILE MIRROR VERIFIED · POWER STABLE · PUBLIC LINK ACTIVE");
    return;
  }

  if (command === "clear") {
    const existing = output.querySelector(".command-result");
    if (existing) existing.remove();
    return;
  }

  const destination = ROUTES[command];
  if (destination) {
    selectRoute(command);
    appendResult(`ROUTING TO /${command.toUpperCase()} …`);
    window.setTimeout(() => window.location.assign(destination), reducedMotion ? 0 : 420);
    return;
  }

  appendResult(`UNKNOWN COMMAND: ${command}. TYPE "HELP".`, "fault");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  executeCommand(input.value);
  input.select();
});

for (const link of routeLinks) {
  link.addEventListener("focus", () => selectRoute(link.dataset.command));
  link.addEventListener("pointerenter", () => selectRoute(link.dataset.command));
}

window.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== input) {
    event.preventDefault();
    input.focus();
  }
  if (event.key === "Escape" && document.activeElement === input) {
    input.blur();
  }
});

runBoot();
