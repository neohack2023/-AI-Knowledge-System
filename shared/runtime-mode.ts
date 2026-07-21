export const runtimeModes = [
  "IDLE",
  "SIMULATION",
  "LIVE",
  "REPLAY",
  "BLOCKED",
  "FAILED",
] as const;

export type RuntimeMode = (typeof runtimeModes)[number];

export type RuntimeModePresentation = {
  traceLabel: string;
  pathLabel: string;
  factLabel: "SNAPSHOT" | "SIMULATION" | "LIVE" | "REPLAY" | "BLOCKED" | "FAILED";
};

export const runtimeModePresentation: Record<RuntimeMode, RuntimeModePresentation> = {
  IDLE: {
    traceLabel: "IDLE TRACE",
    pathLabel: "IDLE WORKFLOW MAP",
    factLabel: "SNAPSHOT",
  },
  SIMULATION: {
    traceLabel: "SIMULATION TRACE",
    pathLabel: "SIMULATED WORKFLOW PATH",
    factLabel: "SIMULATION",
  },
  LIVE: {
    traceLabel: "LIVE TRACE",
    pathLabel: "LIVE WORKFLOW PATH",
    factLabel: "LIVE",
  },
  REPLAY: {
    traceLabel: "REPLAY TRACE",
    pathLabel: "REPLAYED WORKFLOW PATH",
    factLabel: "REPLAY",
  },
  BLOCKED: {
    traceLabel: "BLOCKED TRACE",
    pathLabel: "BLOCKED WORKFLOW PATH",
    factLabel: "BLOCKED",
  },
  FAILED: {
    traceLabel: "FAILED TRACE",
    pathLabel: "FAILED WORKFLOW PATH",
    factLabel: "FAILED",
  },
};
