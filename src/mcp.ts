import path from "node:path";
import readline from "node:readline";
import { missingTools } from "./audio.js";
import { openRecorder, recorderRunning } from "./launch.js";
import { readManifest, syncManifest } from "./manifest.js";
import { normalizeScript, readScript, writeScript } from "./script.js";

/**
 * A minimal MCP server over stdio: newline-delimited JSON-RPC 2.0 with the
 * initialize, ping, tools/list and tools/call methods. Two tools don't need a
 * full SDK, and keeping it small keeps the plugin readable and dependency-free.
 */

export const VERSION = "0.3.1";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (value: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: value }],
  ...(isError ? { isError } : {}),
});

const projectDirProp = {
  type: "string",
  description: "Absolute path of the project the demo is for. Recordings go in <project_dir>/.voiceover/",
};

const TOOLS = [
  {
    name: "start_voiceover",
    title: "Start voiceover recording",
    description:
      "Send the lines the user will read aloud for a demo video, and open the recorder window on their screen. " +
      "Use when the user wants to voice over / narrate a demo themselves. Write one short, speakable line per " +
      "scene, in demo order, each with a stable id and a note describing what is on screen. The recorder shows " +
      "each line, records it, plays it back and lets the user keep or redo it. Calling again with edited lines " +
      "updates the open recorder; lines whose text is unchanged keep their recordings.",
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
              note: { type: "string", description: "What is on screen during this line, e.g. 'clicking Export'" },
            },
            required: ["text"],
          },
        },
        project_dir: projectDirProp,
        open: { type: "boolean", description: "Open the recorder window (default true)" },
      },
      required: ["lines"],
    },
  },
  {
    name: "get_voiceover_status",
    title: "Get voiceover status",
    description:
      "Get recording progress after the user says they're done: allDone, each line's WAV file and duration in " +
      "seconds, and the merged voiceover file. Use the per-line durations to time each scene of the demo video. " +
      "Paths are absolute.",
    inputSchema: { type: "object", properties: { project_dir: projectDirProp } },
  },
];

type Args = Record<string, unknown>;

export async function runMcpServer(opts: { dir: string }): Promise<void> {
  const fallback = path.resolve(opts.dir);
  const resolveDir = (projectDir: unknown) =>
    typeof projectDir === "string" && projectDir ? path.join(path.resolve(projectDir), ".voiceover") : fallback;

  function startVoiceover(args: Args): ToolResult {
    const dir = resolveDir(args.project_dir);
    const script = normalizeScript({ title: args.title, lines: args.lines });
    writeScript(dir, script);
    const manifest = syncManifest(script, readManifest(dir));
    const toRecord = manifest.lines.filter((l) => l.status !== "done").map((l) => l.lineId);
    const summary = [
      `Saved ${script.lines.length} lines (${toRecord.length} to record) in ${dir}.`,
      `Line ids: ${script.lines.map((l) => l.id).join(", ")}`,
    ];

    const missing = missingTools();
    if (missing.length) {
      summary.push(
        `Cannot record yet: SoX is not installed (missing ${missing.join(", ")}).`,
        "Offer to run `brew install sox` for the user, then call start_voiceover again.",
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
        "If macOS asks for microphone access for Terminal, the user must click Allow.",
      );
    } else {
      summary.push(`${launch.reason} Ask the user to run this in a terminal:`, launch.command);
    }
    return text(summary.join("\n"));
  }

  function getStatus(args: Args): ToolResult {
    const dir = resolveDir(args.project_dir);
    const script = readScript(dir);
    if (!script) return text("No voiceover script yet. Send one with start_voiceover.");
    const manifest = syncManifest(script, readManifest(dir));
    const abs = (f: string | null) => (f ? path.join(dir, f) : null);
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
          lines: manifest.lines.map((l) => ({ ...l, file: abs(l.file) })),
        },
        null,
        2,
      ),
    );
  }

  const handlers: Record<string, (args: Args) => ToolResult> = {
    start_voiceover: startVoiceover,
    get_voiceover_status: getStatus,
  };

  function handle(method: string, params: Args): unknown {
    switch (method) {
      case "initialize":
        return {
          // Only basic tools are used, which every protocol version supports.
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "voiceover", version: VERSION },
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call": {
        const tool = handlers[String(params.name)];
        if (!tool) throw Object.assign(new Error(`Unknown tool: ${params.name}`), { code: -32602 });
        try {
          return tool((params.arguments as Args) ?? {});
        } catch (err) {
          return text(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
        }
      }
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }

  const send = (msg: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: { id?: string | number | null; method?: string; params?: Args };
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: "Parse error" } });
    }
    // Notifications (no id) and responses need no reply.
    if (msg.id === undefined || typeof msg.method !== "string") return;
    try {
      send({ id: msg.id, result: handle(msg.method, msg.params ?? {}) });
    } catch (err) {
      const code = (err as { code?: number }).code ?? -32603;
      send({ id: msg.id, error: { code, message: err instanceof Error ? err.message : String(err) } });
    }
  });
  await new Promise<void>((resolve) => rl.on("close", resolve));
}
