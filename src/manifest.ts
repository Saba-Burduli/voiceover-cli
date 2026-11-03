import fs from "node:fs";
import path from "node:path";
import type { Script } from "./script.js";

export type ManifestLine = {
  lineId: string;
  text: string;
  /** Kept take, relative to the voiceover dir. Null until a take is kept. */
  file: string | null;
  durationSec: number | null;
  takes: number;
  status: "pending" | "done" | "skipped";
};

export type Manifest = {
  title: string;
  updatedAt: string;
  merged: { file: string; durationSec: number; gapSec: number } | null;
  lines: ManifestLine[];
};

export const MANIFEST_FILE = "manifest.json";

export function readManifest(dir: string): Manifest | null {
  const file = path.join(dir, MANIFEST_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  } catch {
    return null;
  }
}

export function writeManifest(dir: string, manifest: Manifest): void {
  fs.mkdirSync(dir, { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  const file = path.join(dir, MANIFEST_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/**
 * Line up the manifest with the current script. Lines whose id and text are
 * unchanged keep their recorded takes; anything new or edited starts pending.
 */
export function syncManifest(script: Script, previous: Manifest | null): Manifest {
  const old = new Map(previous?.lines.map((l) => [l.lineId, l]) ?? []);
  const lines = script.lines.map((line): ManifestLine => {
    const prev = old.get(line.id);
    if (prev && prev.text === line.text) return prev;
    return { lineId: line.id, text: line.text, file: null, durationSec: null, takes: prev?.takes ?? 0, status: "pending" };
  });
  const unchanged =
    previous !== null &&
    previous.lines.length === lines.length &&
    lines.every((l, i) => l === previous.lines[i]);
  return {
    title: script.title,
    updatedAt: new Date().toISOString(),
    merged: unchanged ? previous.merged : null,
    lines,
  };
}
