import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { missingTools } from "./audio.js";
import { openRecorder, recorderRunning } from "./launch.js";
import { readManifest, syncManifest } from "./manifest.js";
import { normalizeScript, readScript, writeScript } from "./script.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

const projectDirArg = z
  .string()
  .optional()
  .describe("Absolute path of the project the demo is for. Recordings go in <project_dir>/.voiceover/");

export async function runMcpServer(opts: { dir: string }): Promise<void> {
  const fallback = process.env.CLAUDE_PROJECT_DIR
    ? path.join(process.env.CLAUDE_PROJECT_DIR, opts.dir)
    : path.resolve(opts.dir);
  const resolveDir = (projectDir?: string) => (projectDir ? path.join(path.resolve(projectDir), ".voiceover") : fallback);

  const server = new McpServer({ name: "voiceover", version: "0.2.0" });

  server.registerTool(
    "start_voiceover",
    {
      title: "Start voiceover recording",
      description:
        "Send the lines the user will read aloud for a demo video, and open the recorder window on their screen. " +
        "Use when the user wants to voice over / narrate a demo themselves. Write one short, speakable line per " +
        "scene, in demo order, each with a stable id and a note describing what is on screen. The recorder shows " +
        "each line, records it, plays it back and lets the user keep or redo it. Calling again with edited lines " +
        "updates the open recorder; lines whose text is unchanged keep their recordings.",
      inputSchema: {
        title: z.string().optional().describe("Name of the demo, e.g. 'Onboarding flow demo'"),
        lines: z
          .array(
            z.object({
              id: z.string().optional().describe("Stable scene id, e.g. 'open-dashboard'. Used to match audio to scenes"),
              text: z.string().min(1).describe("Exactly what the user should say. One or two short sentences"),
              note: z.string().optional().describe("What is on screen during this line, e.g. 'clicking Export'"),
            }),
          )
          .min(1),
        project_dir: projectDirArg,
        open: z.boolean().optional().describe("Open the recorder window (default true)"),
      },
    },
    async ({ title, lines, project_dir, open }) => {
      const dir = resolveDir(project_dir);
      const script = normalizeScript({ title, lines });
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
      if (open === false) return text(summary.join("\n"));

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
    },
  );

  server.registerTool(
    "get_voiceover_status",
    {
      title: "Get voiceover status",
      description:
        "Get recording progress after the user says they're done: allDone, each line's WAV file and duration in " +
        "seconds, and the merged voiceover file. Use the per-line durations to time each scene of the demo video. " +
        "Paths are absolute.",
      inputSchema: { project_dir: projectDirArg },
    },
    async ({ project_dir }) => {
      const dir = resolveDir(project_dir);
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
    },
  );

  await server.connect(new StdioServerTransport());
}
