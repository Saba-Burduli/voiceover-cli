import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { PID_FILE } from "./recorder.js";

const LAUNCH_FILE = "recorder.launching";
/** How long a just-opened window counts as running before its recorder writes a pid. */
const LAUNCH_GRACE_MS = 15_000;

export type LaunchResult =
  | { status: "already-running" }
  | { status: "opened"; command: string }
  | { status: "manual"; command: string; reason: string };

export function recorderRunning(dir: string): boolean {
  try {
    const pid = Number(fs.readFileSync(path.join(dir, PID_FILE), "utf8"));
    process.kill(pid, 0);
    return true;
  } catch {}
  try {
    return Date.now() - fs.statSync(path.join(dir, LAUNCH_FILE)).mtimeMs < LAUNCH_GRACE_MS;
  } catch {
    return false;
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const appleQuote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** The shell command that starts the recorder for `dir` with this same build of voiceover. */
export function recorderCommand(dir: string): string {
  const entry = fs.realpathSync(process.argv[1]);
  return `node ${shellQuote(entry)} record --dir ${shellQuote(dir)}`;
}

/** Open a Terminal window running the recorder, unless one is already running for `dir`. */
export function openRecorder(dir: string): LaunchResult {
  if (recorderRunning(dir)) return { status: "already-running" };
  const command = recorderCommand(dir);
  if (process.platform !== "darwin") {
    return { status: "manual", command, reason: "Automatic window opening is only supported on macOS." };
  }
  const res = spawnSync(
    "osascript",
    ["-e", 'tell application "Terminal"', "-e", `do script ${appleQuote(command)}`, "-e", "activate", "-e", "end tell"],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    return { status: "manual", command, reason: `Could not open Terminal: ${res.stderr.trim()}` };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, LAUNCH_FILE), new Date().toISOString());
  return { status: "opened", command };
}
