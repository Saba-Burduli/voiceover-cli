import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";

const SAMPLE_RATE = "48000";

export function hasCommand(cmd: string): boolean {
  return spawnSync("which", [cmd], { stdio: "ignore" }).status === 0;
}

export function missingTools(): string[] {
  return ["sox", "rec", "soxi"].filter((cmd) => !hasCommand(cmd));
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

export type Recording = {
  /** Stop recording and wait until the file is finalized. */
  stop(): Promise<void>;
};

export function startRecording(file: string): Recording {
  const child = spawn("rec", ["-q", "-c", "1", "-r", SAMPLE_RATE, "-b", "16", file], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => (stderr += chunk));
  const exited = waitForExit(child);
  return {
    async stop() {
      if (child.exitCode === null) child.kill("SIGINT");
      await exited;
      if (!fs.existsSync(file) || fs.statSync(file).size <= 44) {
        throw new Error(`Recording failed${stderr ? `: ${stderr.trim()}` : ""}`);
      }
    },
  };
}

export type Playback = { done: Promise<void>; stop(): void };

export function play(file: string): Playback {
  const [cmd, args] = hasCommand("afplay") ? ["afplay", [file]] : ["play", ["-q", file]];
  const child = spawn(cmd, args, { stdio: "ignore" });
  const done = waitForExit(child).then(() => undefined, () => undefined);
  return {
    done,
    stop() {
      if (child.exitCode === null) child.kill("SIGTERM");
    },
  };
}

export function duration(file: string): number {
  const out = spawnSync("soxi", ["-D", file], { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`soxi failed: ${out.stderr.trim()}`);
  return Number.parseFloat(out.stdout.trim());
}

/** Concatenate takes into one file with `gapSec` of silence between them. */
export function merge(files: string[], out: string, gapSec: number): void {
  if (files.length === 0) throw new Error("Nothing to merge");
  const tmp = `${out}.parts`;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    // sox only concatenates inputs with identical rate/channels, so convert every
    // take first, padding all but the last with trailing silence.
    const parts = files.map((file, i) => {
      const part = `${tmp}/${i}.wav`;
      const pad = gapSec > 0 && i < files.length - 1 ? ["pad", "0", String(gapSec)] : [];
      const res = spawnSync("sox", [file, "-r", SAMPLE_RATE, "-c", "1", "-b", "16", part, ...pad], {
        encoding: "utf8",
      });
      if (res.status !== 0) throw new Error(`sox convert failed: ${res.stderr.trim()}`);
      return part;
    });
    const res = spawnSync("sox", [...parts, out], { encoding: "utf8" });
    if (res.status !== 0) throw new Error(`sox merge failed: ${res.stderr.trim()}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
