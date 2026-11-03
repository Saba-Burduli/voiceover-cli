# Voiceover Studio

**Put your own voice in the demo videos Claude builds.**

A demo narrated by the person who made the product feels different. Viewers hear you, not a stock voice, and the product sounds like yours. Voiceover Studio is a Claude Code plugin that makes that take one sentence:

> Make a demo video of this project. I want to voice it over.

Claude plans the scenes and writes a short line for each one, then opens a recorder on your screen. The recorder shows the exact words to say, with a cue for what will be on screen at that moment. You read each line, hear it back right away, and keep it or redo it. Say **done**, and Claude builds the video with every scene timed to your voice.

You never write a script, run a command, or manage audio files.

## Requirements

- **macOS**. The recorder opens in a Terminal window. On Linux, Claude gives you a command to run instead.
- **Claude Code**: the terminal, an IDE extension, or the desktop app's Code tab.
- **Node.js 20 or newer**, which runs the plugin.
- **SoX**, which records and plays audio. If it's missing, Claude offers to install it:
  ```bash
  brew install sox
  ```

## 1. Install

Inside Claude Code:

```
/plugin install voiceover-studio --marketplace Saba-Burduli/voiceover-plugin
```

On Claude Code versions older than 2.1.275, install it in two steps:

```
/plugin marketplace add Saba-Burduli/voiceover-plugin
/plugin install voiceover-studio@voiceover-plugin
```

## 2. Ask Claude

> Make a demo video of the onboarding flow. I want to voice it over.

You can also use `/voiceover-studio:voiceover <what the demo should show>`.

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
- The recorder accepts its keys on English, Georgian and Russian keyboard layouts.

## What it does on your machine

- **Microphone:** records only between your two Enter presses, using SoX's `rec`. macOS asks once whether Terminal can use the microphone.
- **Terminal:** `start_voiceover` opens one Terminal window with `osascript` to run the recorder. If a recorder is already open, it reuses that window.
- **Files:** reads and writes only the `.voiceover/` folder in your project. Takes play back with `afplay`.
- **Network:** none. The plugin sends no audio, text or usage data anywhere and downloads nothing.

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
