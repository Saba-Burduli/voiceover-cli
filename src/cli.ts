#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { duration, hasCommand, missingTools } from "./audio.js";
import { readManifest, syncManifest } from "./manifest.js";
import { runMcpServer } from "./mcp.js";
import { runRecorder } from "./recorder.js";
import { readScript } from "./script.js";

const DEFAULT_DIR = ".voiceover";

const program = new Command()
  .name("voiceover")
  .description("Record demo voiceovers line by line. Your coding agent sends the lines over MCP.")
  .version("0.3.0");

program
  .command("record", { isDefault: true })
  .description("Record the lines your session sent, one take at a time")
  .option("-d, --dir <dir>", "voiceover folder", DEFAULT_DIR)
  .option("-g, --gap <seconds>", "silence between lines in the merged file", "0.4")
  .option("--redo <lineId>", "re-record a line that is already done")
  .action(async (opts: { dir: string; gap: string; redo?: string }) => {
    const gap = Number.parseFloat(opts.gap);
    if (!Number.isFinite(gap) || gap < 0) throw new Error("--gap must be a number of seconds ≥ 0");
    await runRecorder({ dir: opts.dir, gap, redo: opts.redo });
  });

program
  .command("mcp")
  .description("Run the MCP server your coding agent connects to (stdio)")
  .option("-d, --dir <dir>", "voiceover folder", DEFAULT_DIR)
  .action(async (opts: { dir: string }) => {
    await runMcpServer({ dir: opts.dir });
  });

program
  .command("status")
  .description("Show which lines are recorded")
  .option("-d, --dir <dir>", "voiceover folder", DEFAULT_DIR)
  .action((opts: { dir: string }) => {
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
  });

program
  .command("doctor")
  .description("Check that SoX is installed and the microphone records")
  .action(() => {
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
  });

program.parseAsync().catch((err: unknown) => {
  console.error(pc.red(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
