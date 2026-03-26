# CodeWhisper — VSCode Accessibility Extension

> **Full voice-enabled coding assistant for visually impaired developers.** Speak to navigate, understand, debug, and write code — using Groq AI.

---


### Install & Run

```bash
npm install
npm run compile
```

Then press `F5` in VSCode to launch the **Extension Development Host**.

---


## ✨ Feature Groups

### 🎤 1. Voice Command Engine
The heart of the extension. Listen → transcribe via Groq Whisper → parse intent → dispatch.

**Supported commands (examples):**

| Voice Command | Action |
|---|---|
| *"Read this file"* | TTS reads the entire active file |
| *"Explain this function"* | Sends function to Groq LLM for a plain-English explanation |
| *"Go to line forty two"* | Moves cursor to line 42 |
| *"Go to function handleLogin"* | Jumps to symbol |
| *"Find all errors"* | Reads out all current diagnostics |
| *"Fix this error"* | Sends error + code context to Groq for a suggested fix |
| *"Debug this"* | Launches debugger & voice-narrates breakpoints |
| *"What does this variable do"* | Hover info + LLM explanation read aloud |
| *"Open terminal"* | Opens integrated terminal |
| *"Run the code"* | Triggers default run task |
| *"Next error / Previous error"* | Navigates diagnostics |
| *"Summarize this file"* | High-level summary of entire file via LLM |
| *"Write a function that..."* | Code generation from voice prompt |
| *"Comment this code"* | Auto-generates JSDoc/docstring comments |
| *"What changed"* | Reads git diff summary |
| *"Save file"* | Saves active file |
| *"Format document"* | Runs formatter |
| *"Stop listening"* | Pauses voice capture |

### 🔊 2. Text-to-Speech (TTS) Engine
- Reads code, errors, suggestions, and status out loud
- Configurable voice, rate, and pitch via extension settings
- Intelligently narrates code: "function handleLogin, takes one parameter user, returns a promise"
- Reads diagnostics: "Line 12: error — cannot read property of undefined"
- Announces file open/close, save events, tab switches

### 🛎️ 3. Smart Sound Alerts
Audio cues that communicate IDE state without needing to see:

| Event | Sound |
|---|---|
| Error added to file | Low buzz / red alert tone |
| Warning added | Medium chime |
| All errors cleared | Success chime |
| Breakpoint hit | Bell ding |
| Terminal command finishes | Completion tone |
| File saved | Soft click |
| Code suggestion accepted | Pop sound |
| Test passed | Ascending arpeggio |
| Test failed | Descending buzz |

Sounds generated via the Web Audio API inside a hidden WebviewPanel (no external sound files needed).

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** (v18+)
2. **SoX** (for microphone recording):
   - Windows: Download from [https://sourceforge.net/projects/sox/](https://sourceforge.net/projects/sox/) and add to PATH
   - macOS: `brew install sox`
   - Linux: `sudo apt install sox`

### Install & Run

```bash
npm install
npm run compile
```

Then press `F5` in VSCode to launch the **Extension Development Host**.

---

## 🎙️ Smart VAD (Silence Detection)

You don't need to manually start and stop recordings. 

1. Press `Ctrl+Shift+V` to activate CodeWhisper
2. **Wait for the beep**
3. Speak your command naturally. 
4. **Pause for 1 second** — CodeWhisper will automatically detect the silence, process your command instantly, and respond.
5. It will pause its microphone while speaking to you, then beep again when it's ready for your next command.

---

## ⚙️ Settings

Open `File → Preferences → Settings` and search for **CodeWhisper**:

| Setting | Default | Description |
|---|---|---|
| `voicecode.ttsRate` | `1.1` | Speech rate (0.5–2.0) |
| `voicecode.ttsPitch` | `1.0` | Speech pitch |
| `voicecode.ttsVolume` | `1.0` | Speech volume |
| `voicecode.alertVolume` | `0.6` | Sound alert volume |
| `voicecode.announceErrors` | `true` | Auto-announce new errors |
| `voicecode.announceOnCursorMove` | `false` | Read line on cursor move |
| `voicecode.llmModel` | `llama-3.3-70b-versatile` | Groq LLM model |
| `voicecode.whisperModel` | `whisper-large-v3-turbo` | Groq Whisper model |

---

## 🏗️ Project Structure

```
voicecode/
├── src/
│   ├── extension.ts          # Main entry, command registration, AI handlers
│   ├── groqClient.ts         # Groq Whisper (STT) + LLaMA (LLM) API client
│   ├── voiceEngine.ts        # Microphone capture via SoX
│   ├── commandParser.ts      # Voice intent recognition (20+ commands)
│   ├── audioHost.ts          # TTS + sound alerts via hidden WebviewPanel
│   ├── codeAnalyzer.ts       # Code context extraction utilities
│   ├── diagnosticsWatcher.ts # Real-time error/warning sound alerts
│   ├── navigationCommands.ts # Voice-driven editor navigation
│   ├── debugAssistant.ts     # Debug session narration
│   └── webview/
│       └── audioHost.html    # Web Audio + SpeechSynthesis engine
├── package.json
└── tsconfig.json
```

---

## 🛠️ Built With

- **Groq Whisper** — ultra-fast speech-to-text
- **Groq LLaMA 3.3** — AI code understanding
- **Browser SpeechSynthesis API** — zero-dependency TTS
- **Web Audio API** — procedurally generated sound alerts
- **VSCode Extension API** — deep editor integration

---

## 📦 Package Extension

```bash
npm run package
# Generates voicecode-1.0.0.vsix
# Install via: code --install-extension voicecode-1.0.0.vsix
```
