# Privacy Policy

_Last updated: November 3, 2026_

Voiceover Studio is a Claude Code plugin that records your own voice for demo videos. It runs entirely on your computer. This policy explains what it handles and where that data goes.

## What the plugin handles

- **Your voice recordings.** The plugin records from your microphone only while you are recording a take, between your two Enter presses in the recorder window. Each take is saved as a WAV file.
- **The narration lines.** Claude sends the lines you will read, plus a short note about what is on screen for each one. These are saved as text.
- **Recording progress.** Which lines are recorded, how many takes each has, and how long each kept take is.

## Where it is stored

Everything is saved in a `.voiceover/` folder inside the project you are working in:

- `script.json`: the lines to read
- `manifest.json`: progress and durations
- `<line-id>.wav`: the take you kept for each line
- `takes/`: every take, including redos
- `voiceover.wav`: all kept takes merged into one file

The data stays on your computer. Voiceover Studio has no server and no account, and it collects no analytics or telemetry.

## What is shared

- **With Claude:** when you say you're done, the plugin gives Claude, in your current Claude Code session, the file paths and durations of your recordings so it can time the video. Claude's handling of your session is covered by [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).
- **With anyone else:** nothing. The plugin makes no network requests and sends no audio, text, or usage data anywhere.

## How long it is kept

Recordings and lines stay until you delete them. To remove everything, delete the `.voiceover/` folder in your project. Uninstalling the plugin does not delete recordings you have already made.

## Permissions

On macOS, the first recording asks whether Terminal can use the microphone. You can change this anytime under System Settings → Privacy & Security → Microphone.

## Children

Voiceover Studio is a developer tool and is not intended for people under 18.

## Changes

Changes to this policy are published in this file in the [project repository](https://github.com/Saba-Burduli/voiceover-plugin), with the date updated at the top.

## Contact

Questions or requests: open an issue at https://github.com/Saba-Burduli/voiceover-plugin/issues.
