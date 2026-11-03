# voiceover

Record a voiceover for a product demo line by line. Your coding agent (Claude Code or any MCP client) already knows your product, so it writes the lines and sends them here. You read each one, hear it played back, and keep it or redo it.

## Install

```bash
brew install sox
npm install && npm run build && npm link
voiceover doctor
```

Connect it to Claude Code. Run this from your product's repo:

```bash
claude mcp add voiceover -- voiceover mcp
```

## Use

1. In your Claude Code session:
   > Write a voiceover script for the demo we just built and send it to voiceover.
2. In a terminal in the same repo:
   ```bash
   voiceover record
   ```
   If the lines haven't arrived yet, it waits for them.
3. For each line:
   - **Enter** starts recording. Say the line, then **Enter** stops it.
   - The take plays back automatically. Then choose **Enter** keep · **r** redo · **p** replay · **s** skip · **q** quit.
4. When every line is kept, you get:
   - `.voiceover/<line-id>.wav`: one file per line
   - `.voiceover/voiceover.wav`: all lines merged, with `--gap` seconds of silence between them (default 0.4)
   - `.voiceover/manifest.json`: text, file and duration for each line
   - `.voiceover/takes/`: every take, including the ones you redid

Progress is saved after every take. Quit at any point and run `voiceover record` again to resume. If the agent sends a revised script, lines whose text didn't change keep their recordings.

## Commands

| Command | |
|---|---|
| `voiceover record [--gap 0.4] [--redo <lineId>] [--dir .voiceover]` | Record lines (default command) |
| `voiceover status` | Show which lines are done |
| `voiceover doctor` | Check SoX and the microphone |
| `voiceover mcp` | MCP server used by your agent |

## MCP tools

- `send_voiceover_script({ title?, lines: [{ text, id?, note? }] })`: saves the lines for the recorder. `note` is a speaker cue, shown dimmed under the line.
- `get_voiceover_status()`: returns progress with absolute WAV paths and durations, so the agent can line the audio up with the demo video.
