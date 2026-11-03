#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pc from "./colors.js";
import { duration, hasCommand, missingTools } from "./audio.js";
import { readManifest, syncManifest } from "./manifest.js";
import { runMcpServer, VERSION } from "./mcp.js";
import { runRecorder } from "./recorder.js";
import { readScript } from "./script.js";

const DEFAULT_DIR = ".voiceover";

const HELP = `voiceover ${VERSION}: record demo voiceovers line by line. Claude sends the lines over MCP.

Usage: voiceover [command] [options]

Commands:
  record   Record the lines Claude sent, one take at a time (default)
             -d, --dir <dir>      voiceover folder (default .voiceover)
             -g, --gap <seconds>  silence between lines in the merged file (default 0.4)
             --redo <lineId>      re-record a line that is already done
  mcp      Run the MCP server Claude connects to (stdio)
  status   Show which lines are recorded
  doctor   Check that SoX is installed and the microphone records

Options:
  -V, --version  print the version
  -h, --help     show this help`;

type Opts = { dir: string; gap: string; redo?: string };

function parseArgs(argv: string[]): { command: string; opts: Opts } {
  const opts: Opts = { dir: DEFAULT_DIR, gap: "0.4" };
  let command = "record";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "-d" || arg === "--dir") opts.dir = value();
    else if (arg === "-g" || arg === "--gap") opts.gap = value();
    else if (arg === "--redo") opts.redo = value();
    else if (arg === "-h" || arg === "--help") command = "help";
    else if (arg === "-V" || arg === "--version") command = "version";
    else if (!arg.startsWith("-") && i === 0) command = arg;
    else throw new Error(`Unknown argument: ${arg}\n\n${HELP}`);
  }
  return { command, opts };
}

function status(opts: Opts) {
  const script = readScript(opts.dir);
  if (!script) return console.log(pc.dim("No script yet."));
  const manifest = syncManifest(script, readManifest(opts.dir));
  console.log(pc.bold(manifest.title));
  for (const l of manifest.lines) {
    const mark = l.status === "done" ? pc.green("✓") : l.status === "skipped" ? pc.yellow("–") : pc.dim("○");
    const secs = l.durationSec ? pc.dim(` ${l.durationSec.toFixed(1)}s`) : "";
    console.log(`${mark} ${pc.dim(l.lineId.padEnd(28))} ${l.text}${secs}`);
  }
  if (manifest.merged) console.log(`\nmerged: ${path.join(opts.dir, manifest.merged.file)}`);
}

function doctor() {
  const missing = missingTools();
  const ok = (label: string) => console.log(`${pc.green("✓")} ${label}`);
  const bad = (label: string) => console.log(`${pc.red("✗")} ${label}`);
  if (missing.length) {
    bad(`missing ${missing.join(", ")} — install with: brew install sox`);
    process.exitCode = 1;
    return;
  }
  ok("SoX installed");
  ok(hasCommand("afplay") ? "playback via afplay" : "playback via sox play");
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "voiceover-")), "mic.wav");
  const res = spawnSync("rec", ["-q", "-c", "1", "-r", "48000", tmp, "trim", "0", "1"], { encoding: "utf8", timeout: 5000 });
  if (res.status === 0 && fs.existsSync(tmp)) {
    ok(`microphone recorded ${duration(tmp).toFixed(1)}s test clip`);
  } else {
    bad(`microphone test failed${res.stderr ? `: ${res.stderr.trim()}` : ""}`);
    console.log(pc.dim("  On macOS, allow your terminal app under System Settings → Privacy & Security → Microphone."));
    process.exitCode = 1;
  }
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "record": {
      const gap = Number.parseFloat(opts.gap);
      if (!Number.isFinite(gap) || gap < 0) throw new Error("--gap must be a number of seconds ≥ 0");
      return runRecorder({ dir: opts.dir, gap, redo: opts.redo });
    }
    case "mcp":
      return runMcpServer({ dir: opts.dir });
    case "status":
      return status(opts);
    case "doctor":
      return doctor();
    case "version":
      return console.log(VERSION);
    case "help":
      return console.log(HELP);
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((err: unknown) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
