#!/usr/bin/env node

// src/cli.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import fs6 from "node:fs";
import os from "node:os";
import path6 from "node:path";

// src/colors.ts
var enabled = Boolean(process.stdout.isTTY);
var style = (open, close) => (s) => enabled ? `\x1B[${open}m${s}\x1B[${close}m` : s;
var pc = {
  bold: style(1, 22),
  dim: style(2, 22),
  italic: style(3, 23),
  red: style(31, 39),
  green: style(32, 39),
  yellow: style(33, 39),
  cyan: style(36, 39),
  white: style(37, 39)
};
var colors_default = pc;

// src/audio.ts
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
var SAMPLE_RATE = "48000";
function hasCommand(cmd) {
  return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
}
function missingTools() {
  return ["sox", "rec", "soxi"].filter((cmd) => !hasCommand(cmd));
}
function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}
function waitForAudio(file, child, timeoutMs = 2e3) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size > 44 || child.exitCode !== null || Date.now() - started > timeoutMs) return resolve();
      setTimeout(tick, 20);
    };
    tick();
  });
}
function startRecording(file) {
  const child = spawn("rec", ["-q", "-c", "1", "-r", SAMPLE_RATE, "-b", "16", file], {
    stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => stderr += chunk);
  const exited = waitForExit(child);
  return {
    ready: waitForAudio(file, child),
    async stop() {
      if (child.exitCode === null) child.kill("SIGINT");
      await exited;
      if (!fs.existsSync(file) || fs.statSync(file).size <= 44) {
        throw new Error(`Recording failed${stderr ? `: ${stderr.trim()}` : ""}`);
      }
    }
  };
}
function play(file) {
  const [cmd, args] = hasCommand("afplay") ? ["afplay", [file]] : ["play", ["-q", file]];
  const child = spawn(cmd, args, { stdio: "ignore" });
  const done = waitForExit(child).then(() => void 0, () => void 0);
  return {
    done,
    stop() {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  };
}
function duration(file) {
  const out = spawnSync("soxi", ["-D", file], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`soxi failed: ${out.stderr.trim()}`);
  return Number.parseFloat(out.stdout.trim());
}
function merge(files, out, gapSec) {
  if (files.length === 0) throw new Error("Nothing to merge");
  const tmp = `${out}.parts`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const parts = files.map((file, i) => {
      const part = `${tmp}/${i}.wav`;
      const pad = gapSec > 0 && i < files.length - 1 ? ["pad", "0", String(gapSec)] : [];
      const res2 = spawnSync("sox", [file, "-r", SAMPLE_RATE, "-c", "1", "-b", "16", part, ...pad], {
        encoding: "utf8"
      });
      if (res2.status !== 0) throw new Error(`sox convert failed: ${res2.stderr.trim()}`);
      return part;
    });
    const res = spawnSync("sox", [...parts, out], { encoding: "utf8" });
    if (res.status !== 0) throw new Error(`sox merge failed: ${res.stderr.trim()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// src/manifest.ts
import fs2 from "node:fs";
import path from "node:path";
var MANIFEST_FILE = "manifest.json";
function readManifest(dir) {
  const file = path.join(dir, MANIFEST_FILE);
  if (!fs2.existsSync(file)) return null;
  try {
    return JSON.parse(fs2.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function writeManifest(dir, manifest) {
  fs2.mkdirSync(dir, { recursive: true });
  manifest.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const file = path.join(dir, MANIFEST_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs2.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  fs2.renameSync(tmp, file);
}
function syncManifest(script, previous) {
  const old = new Map(previous?.lines.map((l) => [l.lineId, l]) ?? []);
  const lines = script.lines.map((line) => {
    const prev = old.get(line.id);
    if (prev && prev.text === line.text) return prev;
    return { lineId: line.id, text: line.text, file: null, durationSec: null, takes: prev?.takes ?? 0, status: "pending" };
  });
  const unchanged = previous !== null && previous.lines.length === lines.length && lines.every((l, i) => l === previous.lines[i]);
  return {
    title: script.title,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    merged: unchanged ? previous.merged : null,
    lines
  };
}

// src/mcp.ts
import path5 from "node:path";
import readline from "node:readline";

// src/launch.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import fs5 from "node:fs";
import path4 from "node:path";

// src/recorder.ts
import fs4 from "node:fs";
import path3 from "node:path";

// src/script.ts
import fs3 from "node:fs";
import path2 from "node:path";
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var optionalString = (v, name) => {
  if (v === void 0 || v === null || v === "") return void 0;
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  return v;
};
function parseScriptInput(input) {
  if (!isObject(input)) throw new Error("script must be an object");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("lines must be a non-empty array");
  const lines = input.lines.map((line, i) => {
    if (!isObject(line)) throw new Error(`lines[${i}] must be an object`);
    if (typeof line.text !== "string" || !line.text.trim()) throw new Error(`lines[${i}].text must be a non-empty string`);
    return { id: optionalString(line.id, `lines[${i}].id`), text: line.text, note: optionalString(line.note, `lines[${i}].note`) };
  });
  return { title: optionalString(input.title, "title"), lines };
}
var SCRIPT_FILE = "script.json";
function slugify(text2) {
  const slug = text2.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
  return slug || "line";
}
function normalizeScript(input) {
  const parsed = parseScriptInput(input);
  const seen = /* @__PURE__ */ new Set();
  const lines = parsed.lines.map((line, i) => {
    let id = line.id ? slugify(line.id) : `${String(i + 1).padStart(2, "0")}-${slugify(line.text)}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, text: line.text.trim(), ...line.note ? { note: line.note } : {} };
  });
  return { title: parsed.title ?? "Voiceover", lines };
}
function scriptPath(dir) {
  return path2.join(dir, SCRIPT_FILE);
}
function readScript(dir) {
  const file = scriptPath(dir);
  if (!fs3.existsSync(file)) return null;
  try {
    return normalizeScript(JSON.parse(fs3.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}
function writeScript(dir, script) {
  fs3.mkdirSync(dir, { recursive: true });
  const file = scriptPath(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs3.writeFileSync(tmp, JSON.stringify(script, null, 2) + "\n");
  fs3.renameSync(tmp, file);
  return file;
}
function waitForScript(dir) {
  fs3.mkdirSync(dir, { recursive: true });
  const existing = readScript(dir);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const check = () => {
      const script = readScript(dir);
      if (script) {
        watcher.close();
        clearInterval(poll);
        resolve(script);
      }
    };
    const watcher = fs3.watch(dir, (_event, name) => {
      if (!name || name === SCRIPT_FILE) check();
    });
    const poll = setInterval(check, 1e3);
  });
}

// src/recorder.ts
var PID_FILE = "recorder.pid";
var QuitError = class extends Error {
};
var RELOAD = "__reload";
var LAYOUT_KEYS = {
  \u10E0: "r",
  \u10E6: "r",
  \u10E1: "s",
  \u10E8: "s",
  \u10E5: "q",
  \u10DE: "p",
  \u10D9: "k",
  \u043A: "r",
  \u044B: "s",
  \u0439: "q",
  \u0437: "p",
  \u043B: "k"
};
var Keys = class {
  waiter = null;
  quitRequested = false;
  start() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (chunk) => {
      const s = chunk.toString();
      if (s === "") return this.quit();
      const key = s.toLowerCase();
      this.deliver(s === "\r" || s === "\n" ? "enter" : LAYOUT_KEYS[key] ?? key);
    });
  }
  stop() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  read(valid) {
    if (this.quitRequested) return Promise.reject(new QuitError());
    return new Promise((resolve, reject) => this.waiter = { valid, resolve, reject });
  }
  /** Deliver a synthetic key (used for script reloads). */
  deliver(key) {
    const w = this.waiter;
    if (!w || !w.valid.includes(key)) return;
    this.waiter = null;
    w.resolve(key);
  }
  quit() {
    const w = this.waiter;
    if (!w) return void (this.quitRequested = true);
    this.waiter = null;
    w.reject(new QuitError());
  }
};
var hint = (keys) => keys.map(([k, label]) => `${colors_default.bold(colors_default.cyan(k))} ${label}`).join(colors_default.dim("  \xB7  "));
function wrap(text2, width) {
  const out = [];
  let line = "";
  for (const word of text2.split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}
function render({ script, index, status: status2, keys }) {
  const line = script.lines[index];
  const next = script.lines[index + 1];
  const width = Math.min(process.stdout.columns || 80, 90) - 6;
  const out = [];
  out.push("");
  out.push(`  ${colors_default.bold(script.title)}  ${colors_default.dim(`line ${index + 1} of ${script.lines.length}`)}`);
  out.push(colors_default.dim(`  ${"\u2500".repeat(width)}`));
  out.push("");
  out.push(`  ${colors_default.dim("Say:")}`);
  out.push("");
  for (const l of wrap(line.text, width - 2)) out.push(`    ${colors_default.bold(colors_default.white(l))}`);
  out.push("");
  if (line.note) {
    for (const l of wrap(`On screen: ${line.note}`, width - 2)) out.push(`    ${colors_default.italic(colors_default.yellow(l))}`);
    out.push("");
  }
  out.push(colors_default.dim(`  ${"\u2500".repeat(width)}`));
  out.push("");
  out.push(`  ${status2}`);
  if (keys) out.push("", `  ${hint(keys)}`);
  out.push("");
  if (next) out.push(colors_default.dim(`  Next: ${wrap(next.text, width - 8)[0]}${next.text.length > width - 8 ? "\u2026" : ""}`));
  process.stdout.write("\x1B[2J\x1B[H" + out.join("\n") + "\n");
}
function renderMessage(lines) {
  process.stdout.write("\x1B[2J\x1B[H\n" + lines.map((l) => `  ${l}`).join("\n") + "\n");
}
var rel = (dir, file) => path3.relative(dir, file);
async function recordLine(ctx, index) {
  const { dir, keys, script, manifest } = ctx;
  const line = script.lines[index];
  const entry = manifest.lines[index];
  const takesDir = path3.join(dir, "takes");
  fs4.mkdirSync(takesDir, { recursive: true });
  const screen = { script, index };
  render({ ...screen, status: "Read the line above when you're ready.", keys: [["Enter", "start recording"], ["s", "skip"], ["q", "quit"]] });
  const start = await keys.read(["enter", "s", "q", RELOAD]);
  if (start === RELOAD) return "reload";
  if (start === "q") throw new QuitError();
  if (start === "s") return "skipped";
  for (; ; ) {
    entry.takes += 1;
    writeManifest(dir, manifest);
    const take = path3.join(takesDir, `${line.id}.take${entry.takes}.wav`);
    const rec = startRecording(take);
    render({ ...screen, status: colors_default.dim("Opening mic\u2026") });
    await rec.ready;
    render({ ...screen, status: `${colors_default.red("\u25CF")} ${colors_default.bold(colors_default.red("REC"))}  speak now`, keys: [["Enter", "stop"]] });
    try {
      await keys.read(["enter"]);
    } finally {
      await rec.stop();
    }
    for (; ; ) {
      const secs = duration(take).toFixed(1);
      render({
        ...screen,
        status: `${colors_default.green("\u25B6")} Playing take ${entry.takes} ${colors_default.dim(`(${secs}s)`)} \u2014 how was it?`,
        keys: [["Enter", "keep"], ["r", "redo"], ["p", "replay"], ["s", "skip"], ["q", "quit"]]
      });
      const playback = play(take);
      const key = await keys.read(["enter", "k", "r", "p", "s", "q"]).finally(() => playback.stop());
      if (key === "p") continue;
      if (key === "q") throw new QuitError();
      if (key === "s") return "skipped";
      if (key === "r") break;
      const kept = path3.join(dir, `${line.id}.wav`);
      fs4.copyFileSync(take, kept);
      entry.file = rel(dir, kept);
      entry.durationSec = Number(duration(kept).toFixed(3));
      entry.status = "done";
      manifest.merged = null;
      writeManifest(dir, manifest);
      return "kept";
    }
  }
}
function mergeAll(dir, manifest, gap) {
  const out = path3.join(dir, "voiceover.wav");
  merge(manifest.lines.map((l) => path3.join(dir, l.file)), out, gap);
  manifest.merged = { file: rel(dir, out), durationSec: Number(duration(out).toFixed(3)), gapSec: gap };
  writeManifest(dir, manifest);
  return out;
}
function load(dir) {
  const script = readScript(dir);
  if (!script) throw new Error(`Script disappeared: ${scriptPath(dir)}`);
  const manifest = syncManifest(script, readManifest(dir));
  writeManifest(dir, manifest);
  return { script, manifest };
}
function watchScript(dir, keys) {
  let last = fs4.existsSync(scriptPath(dir)) ? fs4.statSync(scriptPath(dir)).mtimeMs : 0;
  const timer = setInterval(() => {
    const file = scriptPath(dir);
    const mtime = fs4.existsSync(file) ? fs4.statSync(file).mtimeMs : 0;
    if (mtime !== last && readScript(dir)) {
      last = mtime;
      keys.deliver(RELOAD);
    }
  }, 500);
  return () => clearInterval(timer);
}
function writePid(dir) {
  const file = path3.join(dir, PID_FILE);
  fs4.mkdirSync(dir, { recursive: true });
  fs4.writeFileSync(file, String(process.pid));
  fs4.rmSync(path3.join(dir, "recorder.launching"), { force: true });
  return () => {
    try {
      if (fs4.readFileSync(file, "utf8") === String(process.pid)) fs4.rmSync(file);
    } catch {
    }
  };
}
async function runRecorder(opts) {
  const dir = path3.resolve(opts.dir);
  if (!process.stdin.isTTY) throw new Error("`voiceover record` needs an interactive terminal.");
  const missing = missingTools();
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Install SoX: brew install sox`);
  const removePid = writePid(dir);
  process.on("exit", removePid);
  process.once("SIGINT", () => process.exit(130));
  if (!readScript(dir)) {
    renderMessage([
      colors_default.bold("voiceover"),
      "",
      colors_default.dim("Waiting for your Claude session to send the lines\u2026"),
      colors_default.dim(`(${scriptPath(dir)})`)
    ]);
  }
  await waitForScript(dir);
  const keys = new Keys();
  keys.start();
  const stopWatching = watchScript(dir, keys);
  if (opts.redo) {
    const { manifest } = load(dir);
    const target = manifest.lines.find((l) => l.lineId === opts.redo);
    if (!target) throw new Error(`No line with id "${opts.redo}". Ids: ${manifest.lines.map((l) => l.lineId).join(", ")}`);
    target.status = "pending";
    writeManifest(dir, manifest);
  }
  const skipped = /* @__PURE__ */ new Set();
  try {
    for (; ; ) {
      const { script, manifest } = load(dir);
      const index = manifest.lines.findIndex((l) => l.status !== "done" && !skipped.has(l.lineId));
      if (index !== -1) {
        const result = await recordLine({ dir, keys, script, manifest }, index);
        if (result === "skipped") {
          skipped.add(manifest.lines[index].lineId);
          manifest.lines[index].status = "skipped";
          writeManifest(dir, manifest);
        }
        continue;
      }
      const left = manifest.lines.filter((l) => l.status !== "done");
      if (left.length > 0) {
        renderMessage([
          colors_default.yellow(`${left.length} line(s) skipped:`),
          ...left.map((l) => colors_default.dim(`  ${l.lineId}: ${l.text}`)),
          "",
          hint([["Enter", "record skipped lines"], ["q", "quit"]])
        ]);
        const key2 = await keys.read(["enter", "q", RELOAD]);
        if (key2 === "q") throw new QuitError();
        skipped.clear();
        continue;
      }
      if (!manifest.merged) mergeAll(dir, manifest, opts.gap);
      renderMessage([
        colors_default.green(colors_default.bold(`All ${manifest.lines.length} lines recorded.`)),
        "",
        `Go back to Claude and say ${colors_default.bold("done")}.`,
        "",
        colors_default.dim(`merged  ${path3.join(dir, manifest.merged.file)} (${manifest.merged.durationSec.toFixed(1)}s)`),
        "",
        colors_default.dim("This window keeps listening \u2014 if Claude changes a line, it shows up here."),
        hint([["q", "close"]])
      ]);
      const key = await keys.read(["q", RELOAD]);
      if (key === "q") break;
    }
  } catch (err) {
    if (!(err instanceof QuitError)) throw err;
    renderMessage([colors_default.dim("Stopped. Progress is saved \u2014 Claude can reopen the recorder anytime.")]);
  } finally {
    stopWatching();
    keys.stop();
  }
}

// src/launch.ts
var LAUNCH_FILE = "recorder.launching";
var LAUNCH_GRACE_MS = 15e3;
function recorderRunning(dir) {
  try {
    const pid = Number(fs5.readFileSync(path4.join(dir, PID_FILE), "utf8"));
    process.kill(pid, 0);
    return true;
  } catch {
  }
  try {
    return Date.now() - fs5.statSync(path4.join(dir, LAUNCH_FILE)).mtimeMs < LAUNCH_GRACE_MS;
  } catch {
    return false;
  }
}
var shellQuote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
var appleQuote = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
function recorderCommand(dir) {
  const entry = fs5.realpathSync(process.argv[1]);
  return `node ${shellQuote(entry)} record --dir ${shellQuote(dir)}`;
}
function openRecorder(dir) {
  if (recorderRunning(dir)) return { status: "already-running" };
  const command = recorderCommand(dir);
  if (process.platform !== "darwin") {
    return { status: "manual", command, reason: "Automatic window opening is only supported on macOS." };
  }
  const res = spawnSync2(
    "osascript",
    ["-e", 'tell application "Terminal"', "-e", `do script ${appleQuote(command)}`, "-e", "activate", "-e", "end tell"],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    return { status: "manual", command, reason: `Could not open Terminal: ${res.stderr.trim()}` };
  }
  fs5.mkdirSync(dir, { recursive: true });
  fs5.writeFileSync(path4.join(dir, LAUNCH_FILE), (/* @__PURE__ */ new Date()).toISOString());
  return { status: "opened", command };
}

// src/mcp.ts
var VERSION = "0.3.2";
var text = (value, isError = false) => ({
  content: [{ type: "text", text: value }],
  ...isError ? { isError } : {}
});
var projectDirProp = {
  type: "string",
  description: "Absolute path of the project the demo is for. Recordings go in <project_dir>/.voiceover/"
};
var TOOLS = [
  {
    name: "start_voiceover",
    title: "Start voiceover recording",
    description: "Send the lines the user will read aloud for a demo video, and open the recorder window on their screen. Use when the user wants to voice over / narrate a demo themselves. Write one short, speakable line per scene, in demo order, each with a stable id and a note describing what is on screen. The recorder shows each line, records it, plays it back and lets the user keep or redo it. Calling again with edited lines updates the open recorder; lines whose text is unchanged keep their recordings.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Name of the demo, e.g. 'Onboarding flow demo'" },
        lines: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable scene id, e.g. 'open-dashboard'. Used to match audio to scenes" },
              text: { type: "string", minLength: 1, description: "Exactly what the user should say. One or two short sentences" },
              note: { type: "string", description: "What is on screen during this line, e.g. 'clicking Export'" }
            },
            required: ["text"]
          }
        },
        project_dir: projectDirProp,
        open: { type: "boolean", description: "Open the recorder window (default true)" }
      },
      required: ["lines"]
    }
  },
  {
    name: "get_voiceover_status",
    title: "Get voiceover status",
    description: "Get recording progress after the user says they're done: allDone, each line's WAV file and duration in seconds, and the merged voiceover file. Use the per-line durations to time each scene of the demo video. Paths are absolute.",
    inputSchema: { type: "object", properties: { project_dir: projectDirProp } }
  }
];
async function runMcpServer(opts) {
  const fallback = path5.resolve(opts.dir);
  const resolveDir = (projectDir) => typeof projectDir === "string" && projectDir ? path5.join(path5.resolve(projectDir), ".voiceover") : fallback;
  function startVoiceover(args) {
    const dir = resolveDir(args.project_dir);
    const script = normalizeScript({ title: args.title, lines: args.lines });
    writeScript(dir, script);
    const manifest = syncManifest(script, readManifest(dir));
    const toRecord = manifest.lines.filter((l) => l.status !== "done").map((l) => l.lineId);
    const summary = [
      `Saved ${script.lines.length} lines (${toRecord.length} to record) in ${dir}.`,
      `Line ids: ${script.lines.map((l) => l.id).join(", ")}`
    ];
    const missing = missingTools();
    if (missing.length) {
      summary.push(
        `Cannot record yet: SoX is not installed (missing ${missing.join(", ")}).`,
        "Offer to run `brew install sox` for the user, then call start_voiceover again."
      );
      return text(summary.join("\n"));
    }
    if (args.open === false) return text(summary.join("\n"));
    const launch = openRecorder(dir);
    if (launch.status === "already-running") {
      summary.push("The recorder window is already open and has picked up these lines.");
    } else if (launch.status === "opened") {
      summary.push(
        "Opened a Terminal window with the recorder on the first line.",
        "Tell the user: read each line, press Enter to start and stop recording, then say 'done' here.",
        "If macOS asks for microphone access for Terminal, the user must click Allow."
      );
    } else {
      summary.push(`${launch.reason} Ask the user to run this in a terminal:`, launch.command);
    }
    return text(summary.join("\n"));
  }
  function getStatus(args) {
    const dir = resolveDir(args.project_dir);
    const script = readScript(dir);
    if (!script) return text("No voiceover script yet. Send one with start_voiceover.");
    const manifest = syncManifest(script, readManifest(dir));
    const abs = (f) => f ? path5.join(dir, f) : null;
    const allDone = manifest.lines.every((l) => l.status === "done");
    const totalSec = manifest.lines.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
    return text(
      JSON.stringify(
        {
          title: manifest.title,
          dir,
          allDone,
          recorderOpen: recorderRunning(dir),
          totalSec: Number(totalSec.toFixed(3)),
          notRecorded: manifest.lines.filter((l) => l.status !== "done").map((l) => l.lineId),
          merged: manifest.merged ? { ...manifest.merged, file: abs(manifest.merged.file) } : null,
          lines: manifest.lines.map((l) => ({ ...l, file: abs(l.file) }))
        },
        null,
        2
      )
    );
  }
  const handlers = {
    start_voiceover: startVoiceover,
    get_voiceover_status: getStatus
  };
  function handle(method, params) {
    switch (method) {
      case "initialize":
        return {
          // Only basic tools are used, which every protocol version supports.
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "voiceover", version: VERSION }
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call": {
        const tool = handlers[String(params.name)];
        if (!tool) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
        try {
          return tool(params.arguments ?? {});
        } catch (err) {
          return text(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
        }
      }
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: "Parse error" } });
    }
    if (msg.id === void 0 || typeof msg.method !== "string") return;
    try {
      send({ id: msg.id, result: handle(msg.method, msg.params ?? {}) });
    } catch (err) {
      const code = err.code ?? -32603;
      send({ id: msg.id, error: { code, message: err instanceof Error ? err.message : String(err) } });
    }
  });
  await new Promise((resolve) => rl.on("close", resolve));
}

// src/cli.ts
var DEFAULT_DIR = ".voiceover";
var HELP = `voiceover ${VERSION}: record demo voiceovers line by line. Claude sends the lines over MCP.

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
function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, gap: "0.4" };
  let command = "record";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === void 0) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "-d" || arg === "--dir") opts.dir = value();
    else if (arg === "-g" || arg === "--gap") opts.gap = value();
    else if (arg === "--redo") opts.redo = value();
    else if (arg === "-h" || arg === "--help") command = "help";
    else if (arg === "-V" || arg === "--version") command = "version";
    else if (!arg.startsWith("-") && i === 0) command = arg;
    else throw new Error(`Unknown argument: ${arg}

${HELP}`);
  }
  return { command, opts };
}
function status(opts) {
  const script = readScript(opts.dir);
  if (!script) return console.log(colors_default.dim("No script yet."));
  const manifest = syncManifest(script, readManifest(opts.dir));
  console.log(colors_default.bold(manifest.title));
  for (const l of manifest.lines) {
    const mark = l.status === "done" ? colors_default.green("\u2713") : l.status === "skipped" ? colors_default.yellow("\u2013") : colors_default.dim("\u25CB");
    const secs = l.durationSec ? colors_default.dim(` ${l.durationSec.toFixed(1)}s`) : "";
    console.log(`${mark} ${colors_default.dim(l.lineId.padEnd(28))} ${l.text}${secs}`);
  }
  if (manifest.merged) console.log(`
merged: ${path6.join(opts.dir, manifest.merged.file)}`);
}
function doctor() {
  const missing = missingTools();
  const ok = (label) => console.log(`${colors_default.green("\u2713")} ${label}`);
  const bad = (label) => console.log(`${colors_default.red("\u2717")} ${label}`);
  if (missing.length) {
    bad(`missing ${missing.join(", ")} \u2014 install with: brew install sox`);
    process.exitCode = 1;
    return;
  }
  ok("SoX installed");
  ok(hasCommand("afplay") ? "playback via afplay" : "playback via sox play");
  const tmp = path6.join(fs6.mkdtempSync(path6.join(os.tmpdir(), "voiceover-")), "mic.wav");
  const res = spawnSync3("rec", ["-q", "-c", "1", "-r", "48000", tmp, "trim", "0", "1"], { encoding: "utf8", timeout: 5e3 });
  if (res.status === 0 && fs6.existsSync(tmp)) {
    ok(`microphone recorded ${duration(tmp).toFixed(1)}s test clip`);
  } else {
    bad(`microphone test failed${res.stderr ? `: ${res.stderr.trim()}` : ""}`);
    console.log(colors_default.dim("  On macOS, allow your terminal app under System Settings \u2192 Privacy & Security \u2192 Microphone."));
    process.exitCode = 1;
  }
  fs6.rmSync(path6.dirname(tmp), { recursive: true, force: true });
}
async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  switch (command) {
    case "record": {
      const gap = Number.parseFloat(opts.gap);
      if (!Number.isFinite(gap) || gap < 0) throw new Error("--gap must be a number of seconds \u2265 0");
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
      throw new Error(`Unknown command: ${command}

${HELP}`);
  }
}
main().catch((err) => {
  console.error(colors_default.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
