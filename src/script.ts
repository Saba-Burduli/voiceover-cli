import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const LineSchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1),
  note: z.string().optional(),
});

export const ScriptSchema = z.object({
  title: z.string().default("Voiceover"),
  lines: z.array(LineSchema).min(1),
});

export type ScriptInput = z.input<typeof ScriptSchema>;
export type Line = { id: string; text: string; note?: string };
export type Script = { title: string; lines: Line[] };

export const SCRIPT_FILE = "script.json";

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return slug || "line";
}

/** Validate input and give every line a stable, unique id like "03-open-dashboard". */
export function normalizeScript(input: unknown): Script {
  const parsed = ScriptSchema.parse(input);
  const seen = new Set<string>();
  const lines = parsed.lines.map((line, i) => {
    let id = line.id ? slugify(line.id) : `${String(i + 1).padStart(2, "0")}-${slugify(line.text)}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, text: line.text.trim(), ...(line.note ? { note: line.note } : {}) };
  });
  return { title: parsed.title, lines };
}

export function scriptPath(dir: string): string {
  return path.join(dir, SCRIPT_FILE);
}

export function readScript(dir: string): Script | null {
  const file = scriptPath(dir);
  if (!fs.existsSync(file)) return null;
  try {
    return normalizeScript(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

export function writeScript(dir: string, script: Script): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = scriptPath(dir);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(script, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return file;
}

/** Resolve once a valid script exists in `dir`, watching for it to appear. */
export function waitForScript(dir: string): Promise<Script> {
  fs.mkdirSync(dir, { recursive: true });
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
    const watcher = fs.watch(dir, (_event, name) => {
      if (!name || name === SCRIPT_FILE) check();
    });
    // fs.watch can miss events on some filesystems; poll as a fallback.
    const poll = setInterval(check, 1000);
  });
}
