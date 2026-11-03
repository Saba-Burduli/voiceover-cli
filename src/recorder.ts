import fs from "node:fs";
import path from "node:path";
import pc from "./colors.js";
import { duration, merge, missingTools, play, startRecording } from "./audio.js";
import { readManifest, syncManifest, writeManifest, type Manifest, type ManifestLine } from "./manifest.js";
import { readScript, scriptPath, waitForScript, type Line, type Script } from "./script.js";

export type RecordOptions = { dir: string; gap: number; redo?: string };

export const PID_FILE = "recorder.pid";

class QuitError extends Error {}

/** Raised when the agent sends a new script while we're waiting at a prompt. */
const RELOAD = "__reload";

type Key = "enter" | string;

/** Same physical keys on non-Latin layouts (Georgian QWERTY, Russian), so r/s/q/p/k work without switching. */
const LAYOUT_KEYS: Record<string, string> = {
  რ: "r", ღ: "r", ს: "s", შ: "s", ქ: "q", პ: "p", კ: "k",
  к: "r", ы: "s", й: "q", з: "p", л: "k",
};

/**
 * Keyboard input in raw mode. Keys pressed while nothing is waiting (e.g. while
 * the mic is opening) are dropped, so a stray Enter can't stop a take early.
 */
class Keys {
  private waiter: { valid: Key[]; resolve: (k: Key) => void; reject: (e: Error) => void } | null = null;
  private quitRequested = false;

  start() {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (chunk: Buffer) => {
      const s = chunk.toString();
      if (s === "\u0003") return this.quit();
      const key = s.toLowerCase();
      this.deliver(s === "\r" || s === "\n" ? "enter" : (LAYOUT_KEYS[key] ?? key));
    });
  }

  stop() {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  read(valid: Key[]): Promise<Key> {
    if (this.quitRequested) return Promise.reject(new QuitError());
    return new Promise((resolve, reject) => (this.waiter = { valid, resolve, reject }));
  }

  /** Deliver a synthetic key (used for script reloads). */
  deliver(key: Key) {
    const w = this.waiter;
    if (!w || !w.valid.includes(key)) return;
    this.waiter = null;
    w.resolve(key);
  }

  private quit() {
    const w = this.waiter;
    if (!w) return void (this.quitRequested = true);
    this.waiter = null;
    w.reject(new QuitError());
  }
}

const hint = (keys: [string, string][]) =>
  keys.map(([k, label]) => `${pc.bold(pc.cyan(k))} ${label}`).join(pc.dim("  ·  "));

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
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

type Screen = {
  script: Script;
  index: number;
  status: string;
  keys?: [string, string][];
};

/** Clear the terminal and draw the current line, its cue, the state and what's next. */
function render({ script, index, status, keys }: Screen) {
  const line = script.lines[index];
  const next = script.lines[index + 1];
  const width = Math.min(process.stdout.columns || 80, 90) - 6;
  const out: string[] = [];
  out.push("");
  out.push(`  ${pc.bold(script.title)}  ${pc.dim(`line ${index + 1} of ${script.lines.length}`)}`);
  out.push(pc.dim(`  ${"─".repeat(width)}`));
  out.push("");
  out.push(`  ${pc.dim("Say:")}`);
  out.push("");
  for (const l of wrap(line.text, width - 2)) out.push(`    ${pc.bold(pc.white(l))}`);
  out.push("");
  if (line.note) {
    for (const l of wrap(`On screen: ${line.note}`, width - 2)) out.push(`    ${pc.italic(pc.yellow(l))}`);
    out.push("");
  }
  out.push(pc.dim(`  ${"─".repeat(width)}`));
  out.push("");
  out.push(`  ${status}`);
  if (keys) out.push("", `  ${hint(keys)}`);
  out.push("");
  if (next) out.push(pc.dim(`  Next: ${wrap(next.text, width - 8)[0]}${next.text.length > width - 8 ? "…" : ""}`));
  process.stdout.write("\x1b[2J\x1b[H" + out.join("\n") + "\n");
}

function renderMessage(lines: string[]) {
  process.stdout.write("\x1b[2J\x1b[H\n" + lines.map((l) => `  ${l}`).join("\n") + "\n");
}

const rel = (dir: string, file: string) => path.relative(dir, file);

type Ctx = { dir: string; keys: Keys; script: Script; manifest: Manifest };

/** Record, review and keep (or skip) one line. Returns "reload" if a new script arrived first. */
async function recordLine(ctx: Ctx, index: number): Promise<"kept" | "skipped" | "reload"> {
  const { dir, keys, script, manifest } = ctx;
  const line: Line = script.lines[index];
  const entry: ManifestLine = manifest.lines[index];
  const takesDir = path.join(dir, "takes");
  fs.mkdirSync(takesDir, { recursive: true });
  const screen = { script, index };

  render({ ...screen, status: "Read the line above when you're ready.", keys: [["Enter", "start recording"], ["s", "skip"], ["q", "quit"]] });
  const start = await keys.read(["enter", "s", "q", RELOAD]);
  if (start === RELOAD) return "reload";
  if (start === "q") throw new QuitError();
  if (start === "s") return "skipped";

  for (;;) {
    entry.takes += 1;
    writeManifest(dir, manifest);
    const take = path.join(takesDir, `${line.id}.take${entry.takes}.wav`);

    const rec = startRecording(take);
    render({ ...screen, status: pc.dim("Opening mic…") });
    await rec.ready;
    render({ ...screen, status: `${pc.red("●")} ${pc.bold(pc.red("REC"))}  speak now`, keys: [["Enter", "stop"]] });
    try {
      await keys.read(["enter"]);
    } finally {
      await rec.stop();
    }

    for (;;) {
      const secs = duration(take).toFixed(1);
      render({
        ...screen,
        status: `${pc.green("▶")} Playing take ${entry.takes} ${pc.dim(`(${secs}s)`)} — how was it?`,
        keys: [["Enter", "keep"], ["r", "redo"], ["p", "replay"], ["s", "skip"], ["q", "quit"]],
      });
      const playback = play(take);
      const key = await keys.read(["enter", "k", "r", "p", "s", "q"]).finally(() => playback.stop());
      if (key === "p") continue;
      if (key === "q") throw new QuitError();
      if (key === "s") return "skipped";
      if (key === "r") break;
      const kept = path.join(dir, `${line.id}.wav`);
      fs.copyFileSync(take, kept);
      entry.file = rel(dir, kept);
      entry.durationSec = Number(duration(kept).toFixed(3));
      entry.status = "done";
      manifest.merged = null;
      writeManifest(dir, manifest);
      return "kept";
    }
  }
}

function mergeAll(dir: string, manifest: Manifest, gap: number): string {
  const out = path.join(dir, "voiceover.wav");
  merge(manifest.lines.map((l) => path.join(dir, l.file!)), out, gap);
  manifest.merged = { file: rel(dir, out), durationSec: Number(duration(out).toFixed(3)), gapSec: gap };
  writeManifest(dir, manifest);
  return out;
}

function load(dir: string): { script: Script; manifest: Manifest } {
  const script = readScript(dir);
  if (!script) throw new Error(`Script disappeared: ${scriptPath(dir)}`);
  const manifest = syncManifest(script, readManifest(dir));
  writeManifest(dir, manifest);
  return { script, manifest };
}

/** Wake any pending prompt when the agent rewrites script.json. */
function watchScript(dir: string, keys: Keys): () => void {
  let last = fs.existsSync(scriptPath(dir)) ? fs.statSync(scriptPath(dir)).mtimeMs : 0;
  const timer = setInterval(() => {
    const file = scriptPath(dir);
    const mtime = fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0;
    if (mtime !== last && readScript(dir)) {
      last = mtime;
      keys.deliver(RELOAD);
    }
  }, 500);
  return () => clearInterval(timer);
}

function writePid(dir: string): () => void {
  const file = path.join(dir, PID_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, String(process.pid));
  fs.rmSync(path.join(dir, "recorder.launching"), { force: true });
  return () => {
    try {
      if (fs.readFileSync(file, "utf8") === String(process.pid)) fs.rmSync(file);
    } catch {}
  };
}

export async function runRecorder(opts: RecordOptions): Promise<void> {
  const dir = path.resolve(opts.dir);
  if (!process.stdin.isTTY) throw new Error("`voiceover record` needs an interactive terminal.");
  const missing = missingTools();
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Install SoX: brew install sox`);

  const removePid = writePid(dir);
  process.on("exit", removePid);
  // Before raw mode starts (while waiting for a script), Ctrl+C is a real SIGINT.
  process.once("SIGINT", () => process.exit(130));

  if (!readScript(dir)) {
    renderMessage([
      pc.bold("voiceover"),
      "",
      pc.dim("Waiting for your Claude session to send the lines…"),
      pc.dim(`(${scriptPath(dir)})`),
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

  // Lines skipped in this run; they're offered again from the end screen.
  const skipped = new Set<string>();
  try {
    for (;;) {
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
          pc.yellow(`${left.length} line(s) skipped:`),
          ...left.map((l) => pc.dim(`  ${l.lineId}: ${l.text}`)),
          "",
          hint([["Enter", "record skipped lines"], ["q", "quit"]]),
        ]);
        const key = await keys.read(["enter", "q", RELOAD]);
        if (key === "q") throw new QuitError();
        skipped.clear();
        continue;
      }

      if (!manifest.merged) mergeAll(dir, manifest, opts.gap);
      renderMessage([
        pc.green(pc.bold(`All ${manifest.lines.length} lines recorded.`)),
        "",
        `Go back to Claude and say ${pc.bold("done")}.`,
        "",
        pc.dim(`merged  ${path.join(dir, manifest.merged!.file)} (${manifest.merged!.durationSec.toFixed(1)}s)`),
        "",
        pc.dim("This window keeps listening — if Claude changes a line, it shows up here."),
        hint([["q", "close"]]),
      ]);
      const key = await keys.read(["q", RELOAD]);
      if (key === "q") break;
    }
  } catch (err) {
    if (!(err instanceof QuitError)) throw err;
    renderMessage([pc.dim("Stopped. Progress is saved — Claude can reopen the recorder anytime.")]);
  } finally {
    stopWatching();
    keys.stop();
  }
}
