import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { duration, merge, missingTools, play, startRecording } from "./audio.js";
import { readManifest, syncManifest, writeManifest, type Manifest, type ManifestLine } from "./manifest.js";
import { readScript, scriptPath, waitForScript, type Line } from "./script.js";

export type RecordOptions = { dir: string; gap: number; redo?: string };

class QuitError extends Error {}

type Key = "enter" | string;

/** Wait for one of `valid` keys in raw mode. Ctrl+C rejects with QuitError. */
function readKey(valid: Key[]): Promise<Key> {
  const stdin = process.stdin;
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const s = chunk.toString();
      if (s === "\u0003") return finish(() => reject(new QuitError()));
      const key = s === "\r" || s === "\n" ? "enter" : s.toLowerCase();
      if (valid.includes(key)) finish(() => resolve(key));
    };
    const finish = (done: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      done();
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

const hint = (keys: [string, string][]) =>
  keys.map(([k, label]) => `${pc.bold(pc.cyan(k))} ${label}`).join(pc.dim("  ·  "));

function showLine(line: Line, index: number, total: number) {
  console.log();
  console.log(pc.dim(`─── [${index + 1}/${total}] ${line.id} ${"─".repeat(Math.max(0, 40 - line.id.length))}`));
  console.log();
  console.log(`  ${pc.bold(pc.white(line.text))}`);
  if (line.note) console.log(`  ${pc.dim(pc.italic(line.note))}`);
  console.log();
}

function rel(dir: string, file: string) {
  return path.relative(dir, file);
}

/** Record one take. Returns the take path once the user stops recording. */
async function recordTake(file: string): Promise<string> {
  const rec = startRecording(file);
  process.stdout.write(pc.dim("  opening mic…"));
  await rec.ready;
  process.stdout.write("\r\x1b[2K");
  process.stdout.write(`  ${pc.red("●")} ${pc.red("REC")}  ${pc.dim("speak now — press")} ${pc.bold("Enter")} ${pc.dim("to stop")}`);
  try {
    await readKey(["enter"]);
  } finally {
    await rec.stop().finally(() => process.stdout.write("\n"));
  }
  return file;
}

type Decision = "keep" | "redo" | "skip";

/** Play a take back and ask what to do with it; any key interrupts playback. */
async function review(file: string): Promise<Decision> {
  for (;;) {
    const secs = duration(file).toFixed(1);
    console.log(`  ${pc.green("▶")} playing back ${pc.dim(`(${secs}s)`)}`);
    console.log(`  ${hint([["Enter", "keep"], ["r", "redo"], ["p", "replay"], ["s", "skip"], ["q", "quit"]])}`);
    const playback = play(file);
    const key = await readKey(["enter", "k", "r", "p", "s", "q"]).finally(() => playback.stop());
    if (key === "enter" || key === "k") return "keep";
    if (key === "r") return "redo";
    if (key === "s") return "skip";
    if (key === "q") throw new QuitError();
    // "p": loop and replay
  }
}

async function recordLine(dir: string, line: Line, entry: ManifestLine, manifest: Manifest): Promise<void> {
  const takesDir = path.join(dir, "takes");
  fs.mkdirSync(takesDir, { recursive: true });

  console.log(`  ${hint([["Enter", "start recording"], ["s", "skip"], ["q", "quit"]])}`);
  const start = await readKey(["enter", "s", "q"]);
  if (start === "q") throw new QuitError();
  if (start === "s") {
    entry.status = "skipped";
    writeManifest(dir, manifest);
    return;
  }

  for (;;) {
    entry.takes += 1;
    writeManifest(dir, manifest);
    const take = await recordTake(path.join(takesDir, `${line.id}.take${entry.takes}.wav`));
    const decision = await review(take);
    if (decision === "redo") {
      console.log(pc.dim("  again —"));
      continue;
    }
    if (decision === "skip") {
      entry.status = "skipped";
    } else {
      const kept = path.join(dir, `${line.id}.wav`);
      fs.copyFileSync(take, kept);
      entry.file = rel(dir, kept);
      entry.durationSec = Number(duration(kept).toFixed(3));
      entry.status = "done";
      console.log(`  ${pc.green("✓")} saved ${pc.dim(entry.file)}`);
    }
    manifest.merged = null;
    writeManifest(dir, manifest);
    return;
  }
}

function finish(dir: string, manifest: Manifest, gap: number) {
  const done = manifest.lines.filter((l) => l.status === "done" && l.file);
  const left = manifest.lines.filter((l) => l.status !== "done");
  console.log();
  if (left.length > 0) {
    console.log(pc.yellow(`${left.length} line(s) not recorded yet: ${left.map((l) => l.lineId).join(", ")}`));
    console.log(pc.dim("Run `voiceover record` again to pick up where you left off."));
  }
  if (left.length > 0 || done.length === 0) return;
  const out = path.join(dir, "voiceover.wav");
  merge(done.map((l) => path.join(dir, l.file!)), out, gap);
  manifest.merged = { file: rel(dir, out), durationSec: Number(duration(out).toFixed(3)), gapSec: gap };
  writeManifest(dir, manifest);
  console.log(pc.green(pc.bold("All lines recorded.")));
  console.log(`  merged   ${out} ${pc.dim(`(${manifest.merged.durationSec.toFixed(1)}s)`)}`);
  console.log(`  lines    ${dir}/<line-id>.wav`);
  console.log(`  manifest ${path.join(dir, "manifest.json")}`);
}

export async function runRecorder(opts: RecordOptions): Promise<void> {
  const dir = path.resolve(opts.dir);
  if (!process.stdin.isTTY) throw new Error("`voiceover record` needs an interactive terminal.");
  const missing = missingTools();
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Install SoX: brew install sox`);

  if (!readScript(dir)) {
    console.log(pc.dim(`Waiting for your session to send lines… (watching ${scriptPath(dir)})`));
    console.log(pc.dim("Ask your agent to send a voiceover script with the `send_voiceover_script` tool."));
  }
  const script = await waitForScript(dir);
  const manifest = syncManifest(script, readManifest(dir));
  if (opts.redo) {
    const target = manifest.lines.find((l) => l.lineId === opts.redo);
    if (!target) throw new Error(`No line with id "${opts.redo}". Ids: ${manifest.lines.map((l) => l.lineId).join(", ")}`);
    target.status = "pending";
  }
  writeManifest(dir, manifest);

  const remaining = manifest.lines.filter((l) => l.status !== "done").length;
  console.log();
  console.log(`${pc.bold(script.title)} ${pc.dim(`— ${script.lines.length} lines, ${remaining} to record`)}`);

  try {
    for (const [i, line] of script.lines.entries()) {
      const entry = manifest.lines[i];
      if (entry.status === "done") continue;
      showLine(line, i, script.lines.length);
      await recordLine(dir, line, entry, manifest);
    }
  } catch (err) {
    if (!(err instanceof QuitError)) throw err;
    console.log(pc.dim("\nStopped. Progress is saved."));
  }
  finish(dir, manifest, opts.gap);
}
