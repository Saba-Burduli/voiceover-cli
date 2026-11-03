# Voiceover

Narrate the demo videos Claude builds with your own voice.

You ask Claude for a demo and say you'll voice it over. Claude plans the scenes and writes a line for each one, then opens a recorder window on your screen. You read each line, hear it back, and keep it or redo it. When you're done, Claude builds the video with every scene timed to your recording.

## 1. Install

You need SoX for recording (if it's missing, Claude will offer to install it):

```bash
brew install sox
```

Then, inside Claude Code:

```
/plugin install voiceover --marketplace Saba-Burduli/voiceover-cli
```

On Claude Code versions older than 2.1.275, install it in two steps:

```
/plugin marketplace add Saba-Burduli/voiceover-cli
/plugin install voiceover@voiceover
```

## 2. Ask Claude

> Make a demo video of the onboarding flow. I want to voice it over.

You can also use `/voiceover <what the demo should show>`.

## 3. Talk

A Terminal window opens with your first line:

```
  Onboarding demo  line 1 of 5
  ────────────────────────────────────────

  Say:

    Here's how a new team gets set up in under a minute.

    On screen: landing page, cursor on Sign up

  ────────────────────────────────────────

  Read the line above when you're ready.

  Enter start recording  ·  s skip  ·  q quit

  Next: First, invite your teammates by email.
```

For each line:
- Press **Enter**, wait for `● REC`, and read the line.
- Press **Enter** again to stop. Your take plays back right away.
- Then choose: **Enter** keep · **r** redo · **p** replay · **s** skip.

After the last line, go back to Claude and say **done**.

If macOS asks whether Terminal can use the microphone, click **Allow**.

## How it works

- The plugin adds an MCP server with two tools:
  - `start_voiceover` saves the lines and opens the recorder window.
  - `get_voiceover_status` returns each kept take's WAV path and duration.
- The `voiceover-demo` skill teaches Claude the workflow: plan the scenes, write lines that are easy to say, open the recorder, then time each scene to its take.
- Everything is saved in `.voiceover/` in your project:
  - `<line-id>.wav`: one file per line
  - `voiceover.wav`: all lines merged
  - `manifest.json`: progress and durations
  - `takes/`: every take, including redos
- Progress is saved after every take. If Claude rewords a line, only that line needs re-recording.

## Advanced: CLI

The plugin runs `dist/voiceover.mjs`, which also works as a standalone CLI:

```bash
node dist/voiceover.mjs record [--dir .voiceover] [--gap 0.4] [--redo <lineId>]
```
```bash
node dist/voiceover.mjs status
```
```bash
node dist/voiceover.mjs doctor
```

## Development

```bash
npm install
```
```bash
npm run typecheck && npm run build
```

`dist/voiceover.mjs` is committed, because plugin installs don't run `npm install`. Rebuild and commit it with every source change.
