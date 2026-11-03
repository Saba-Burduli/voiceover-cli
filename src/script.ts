import fs from "node:fs";
import path from "node:path";

export type LineInput = { id?: string; text: string; note?: string };
export type ScriptInput = { title?: string; lines: LineInput[] };
export type Line = { id: string; text: string; note?: string };
export type Script = { title: string; lines: Line[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optionalString = (v: unknown, name: string): string | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  return v;
};

/** Check the shape of a script sent by the agent or read from disk. */
export function parseScriptInput(input: unknown): ScriptInput {
  if (!isObject(input)) throw new Error("script must be an object");
  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("lines must be a non-empty array");
  const lines = input.lines.map((line, i) => {
    if (!isObject(line)) throw new Error(`lines[${i}] must be an object`);
    if (typeof line.text !== "string" || !line.text.trim()) throw new Error(`lines[${i}].text must be a non-empty string`);
    return { id: optionalString(line.id, `lines[${i}].id`), text: line.text, note: optionalString(line.note, `lines[${i}].note`) };
  });
  return { title: optionalString(input.title, "title"), lines };
}

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
  const parsed = parseScriptInput(input);
  const seen = new Set<string>();
  const lines = parsed.lines.map((line, i) => {
    let id = line.id ? slugify(line.id) : `${String(i + 1).padStart(2, "0")}-${slugify(line.text)}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { id, text: line.text.trim(), ...(line.note ? { note: line.note } : {}) };
  });
  return { title: parsed.title ?? "Voiceover", lines };
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
