---
name: voiceover-demo
description: Use when the user wants to voice over, narrate or record their own voice for a demo, product video or walkthrough you are building ("make a demo, I'll voice it over", "I want to narrate this video", "record my voice for the demo"). Writes the narration lines, opens the voiceover recorder for the user, then times the video's scenes to their recorded takes.
---

# Voiceover for a demo video

The user records the narration; you do everything else. They should never have to remember a script, run a command or manage files.

## 1. Plan the demo first

Before writing any narration, decide the scenes of the demo in order: what is on screen in each one (page, action, highlight). Base it on the actual product in this project. Keep it short; 4 to 8 scenes is typical.

## 2. Write one line per scene

For each scene, write the exact words the user will say:
- One or two short sentences, at most about 20 words. Easy to say out loud in one breath.
- Plain spoken language. Avoid symbols, code, URLs and acronyms the user would stumble over; spell things out the way they should be said.
- `id`: a stable kebab-case scene id (`open-dashboard`, `export-pdf`). You will match audio to scenes with it.
- `note`: what is on screen while they say it ("clicking Export"). The recorder shows it as a cue.

Show the user the list of lines briefly in chat, then continue without waiting unless they asked to review it first.

## 3. Open the recorder

Call the `start_voiceover` tool with `title`, `lines` and `project_dir` set to the absolute path of this project. It saves the lines and opens a Terminal window on the user's screen with the recorder on line 1.

- If the result says SoX is missing, offer to run `brew install sox` for the user, then call `start_voiceover` again.
- If it says it could not open a window, show the user the command from the result to run in a terminal.

Then tell the user, in one or two sentences: the recorder is open; for each line press Enter, read it, press Enter again, then keep (Enter) or redo (r); say "done" here when finished. While they record, you can start building the video's scenes.

## 4. Collect the takes

When the user says they're done, call `get_voiceover_status` with the same `project_dir`.
- If `allDone` is false, tell them which lines are left (`notRecorded`). The recorder window is still open and resumes at those lines; if it was closed, call `start_voiceover` again with the same lines.
- Each entry in `lines` has the absolute `file` path of the kept WAV and its `durationSec`.

## 5. Build the video around the voice

- Each scene lasts its line's `durationSec` plus about 0.3 to 0.6 seconds of breathing room. Never cut a line off.
- Place each line's WAV at the start of its scene, matched by `id`.
- With Remotion (use the Remotion skills if available): copy the WAVs into `public/`, set each `<Sequence>`'s `durationInFrames` from `durationSec * fps`, and put an `<Audio>` for that line inside it.
- Without Remotion: render or capture each scene to the line's length and mux the audio with ffmpeg. `merged.file` is a single track with every line in order, if that is easier.

## Changing lines later

To reword, add or remove lines, call `start_voiceover` again with the full updated list. Lines whose `id` and text did not change keep their recordings; only changed lines go back to the recorder. Keep ids stable when editing.
