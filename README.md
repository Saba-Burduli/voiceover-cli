# Voiceover Studio

**Put your own voice in the demo videos Claude builds.**

![Voiceover Studio: install the plugin, ask Claude for a demo, record each line, and get a video timed to your voice](https://github.com/Saba-Burduli/voiceover-plugin/releases/download/v0.3.3/demo.gif)

<sub>A real Claude Code session, sped up: install → ask for a demo → record → finished video. [Watch the full video with sound](https://github.com/Saba-Burduli/voiceover-plugin/releases/download/v0.3.3/voiceover-studio-demo.mp4).</sub>

Claude Code can build a demo video for your project, but the voice is usually a synthetic one, or you record yourself and line up clips by hand. Voiceover Studio closes that gap. You ask for a demo, Claude writes what to say, you read it, and the video is cut to your voice.

## What happens, step by step

1. **You ask:** *"Make a demo video of this project. I want to voice it over."*
2. **Claude plans the video** as scenes and writes one short, easy-to-say line for each scene.
3. **A recorder opens** in a Terminal window. It shows the line to say, what's on screen at that moment, and the next line.
4. **You record:** Enter to start, Enter to stop. The take plays back right away. Keep it or redo it.
5. **You say "done"** in Claude. It reads every take and its length, then builds the video so each scene lasts as long as you spoke.

You never write a script, run a command, or manage audio files.

## Install

Inside Claude Code:

```
/plugin install voiceover-studio --marketplace Saba-Burduli/voiceover-plugin
```

On Claude Code versions older than 2.1.275, install it in two steps:

```
/plugin marketplace add Saba-Burduli/voiceover-plugin
/plugin install voiceover-studio@voiceover-plugin
```

> The plugin is in review for Anthropic's official plugin directory. Until it's listed there, install it from GitHub as shown above.

### Requirements

- **macOS**. The recorder opens in a Terminal window. On Linux, Claude gives you a command to run instead.
- **Claude Code**: the terminal, an IDE extension, or the desktop app's Code tab.
- **Node.js 20 or newer**, which runs the plugin.
- **SoX**, which records audio. If it's missing, Claude notices and offers to install it for you:
  ```bash
  brew install sox
  ```

## Use it

Ask in plain words:

> Make a demo video of the onboarding flow. I want to voice it over.

Or run the slash command:

```
/voiceover-studio:voiceover <what the demo should show>
```

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

| Key | What it does |
| --- | --- |
| **Enter** | Start recording, then stop. After playback: keep the take |
| **r** | Redo the take |
| **p** | Play the take again |
| **s** | Skip this line for now |
| **q** | Quit. Progress is saved, and the recorder picks up where you left off |

After the last line, go back to Claude and say **done**. If macOS asks whether Terminal can use the microphone, click **Allow**.

The keys also work on Georgian and Russian keyboard layouts.

## FAQ

**How is each scene timed to my voice?**
Every line is its own take, so there's nothing to split or mark by hand. Claude reads each take's length and makes that scene last the same time plus 0.3 to 0.6 seconds of breathing room. Each line's audio sits inside its own scene.

**What if I change a line later?**
Ask Claude to reword it. Only the changed line goes back to the recorder; every other take stays as it is. If the new take is longer, only that scene gets longer, and the scenes after it start a little later with their audio still in sync.

**What does Claude use to build the video?**
[Remotion](https://www.remotion.dev) if it's available in your project, with one audio clip per scene. Otherwise it renders the scenes and adds the audio with ffmpeg.

**Does anything leave my machine?**
No. Recordings, scripts and progress stay in a `.voiceover/` folder in your project. The plugin has no network access, no telemetry, and needs no account or API key.

**Does it work on Windows or Linux?**
It's built and tested on macOS. On Linux, the recorder doesn't open by itself, but Claude gives you the command to run it with SoX installed. Windows isn't supported yet.

## How it works

- **MCP server** with two tools:
  - `start_voiceover` saves the lines and opens the recorder window.
  - `get_voiceover_status` returns each kept take's WAV path and duration.
- **Skill** (`voiceover-demo`) teaches Claude the workflow: plan the scenes, write lines that are easy to say, open the recorder, then time each scene to its take.
- **Slash command** `/voiceover-studio:voiceover` runs the same workflow on demand.
- **Files** saved in `.voiceover/` in your project:
  - `<line-id>.wav`: one file per line
  - `voiceover.wav`: all lines merged into one track
  - `manifest.json`: progress and durations
  - `takes/`: every take, including redos
- Progress is saved after every take.

## What it does on your machine

- **Microphone:** records only between your two Enter presses, using SoX's `rec`. macOS asks once whether Terminal can use the microphone.
- **Terminal:** `start_voiceover` opens one Terminal window with `osascript` to run the recorder. If a recorder is already open, it reuses that window.
- **Files:** reads and writes only the `.voiceover/` folder in your project. Takes play back with `afplay`.
- **Network:** none. The plugin sends no audio, text or usage data anywhere and downloads nothing.

See the full [Privacy policy](PRIVACY.md).

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

## Feedback

Questions, bugs and ideas are welcome in [GitHub Issues](https://github.com/Saba-Burduli/voiceover-plugin/issues).

Made by [Saba Burduli](https://github.com/Saba-Burduli). MIT licensed.
