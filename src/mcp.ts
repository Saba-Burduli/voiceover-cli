import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readManifest, syncManifest } from "./manifest.js";
import { normalizeScript, readScript, writeScript } from "./script.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

export async function runMcpServer(opts: { dir: string }): Promise<void> {
  const dir = path.resolve(opts.dir);
  const server = new McpServer({ name: "voiceover", version: "0.1.0" });

  server.registerTool(
    "send_voiceover_script",
    {
      title: "Send voiceover script",
      description:
        "Send the lines the user will read aloud for a product demo voiceover. Each line is shown to the user in " +
        "the `voiceover record` terminal, recorded, played back and kept or redone. Write short, speakable lines " +
        "(one sentence or phrase each) in the order they happen in the demo. Sending a new script replaces the old " +
        "one; lines with unchanged text keep their recordings.",
      inputSchema: {
        title: z.string().optional().describe("Name of the demo, e.g. 'Onboarding flow demo'"),
        lines: z
          .array(
            z.object({
              text: z.string().min(1).describe("Exactly what the user should say"),
              id: z.string().optional().describe("Optional stable id, e.g. 'open-dashboard'"),
              note: z.string().optional().describe("Optional cue for the speaker, e.g. 'while clicking Export'"),
            }),
          )
          .min(1),
      },
    },
    async ({ title, lines }) => {
      const script = normalizeScript({ title, lines });
      const file = writeScript(dir, script);
      return text(
        `${script.lines.length} lines saved to ${file}.\n` +
          `Tell the user to run \`voiceover record\` in ${path.dirname(dir)} (it starts automatically if already waiting).\n` +
          `Line ids: ${script.lines.map((l) => l.id).join(", ")}`,
      );
    },
  );

  server.registerTool(
    "get_voiceover_status",
    {
      title: "Get voiceover status",
      description:
        "Get recording progress: which lines are done, the WAV file for each line with its duration, and the " +
        "merged voiceover file once every line is recorded. Paths are absolute.",
      inputSchema: {},
    },
    async () => {
      const script = readScript(dir);
      if (!script) return text("No voiceover script yet. Send one with send_voiceover_script.");
      const manifest = syncManifest(script, readManifest(dir));
      const abs = (f: string | null) => (f ? path.join(dir, f) : null);
      return text(
        JSON.stringify(
          {
            title: manifest.title,
            dir,
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
