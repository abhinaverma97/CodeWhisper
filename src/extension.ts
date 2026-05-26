import * as vscode from 'vscode';
import { initAudioHost, speak, stopSpeaking, playAlert, isSpeaking, logLiveEvent } from './audioHost';
import { startListening, stopListening, isCurrentlyListening } from './voiceEngine';
import { Intent, parseIntent } from './commandParser';
import { startDiagnosticsWatcher } from './diagnosticsWatcher';
import { startDebugAssistant } from './debugAssistant';
import {
    goToLine, goToSymbol, nextError, prevError,
    readCurrentLine, readFileOutline,
    registerCursorAnnouncer, registerFileSaveAnnouncer,
} from './navigationCommands';
import {
    getSelectedOrContextCode, getFullFileText, getCurrentLineText,
    getDiagnosticsText, getNearestError, buildCodeContext, insertAtCursor, replaceSelection, replaceEntireFile
} from './codeAnalyzer';
import { chatCompletion } from './groqClient';
import { showFeaturesDashboard } from './featuresDashboard';

// Status bar item
let statusBarItem: vscode.StatusBarItem;
let isListeningActive = false;

const SYSTEM_PROMPT_EXPLAIN = `You are CodeWhisper, an AI assistant designed specifically for visually impaired developers. 
Explain code clearly and concisely in plain spoken English. Avoid markdown symbols like asterisks, backticks, or hashes — use natural speech. 
Keep responses under 150 words unless the user asks for detail.`;

const SYSTEM_PROMPT_FIX = `You are CodeWhisper, an AI coding assistant for visually impaired developers. 
Diagnose the provided error and provide the corrected code. Explain the fix in 2-3 short spoken sentences first, then provide only the corrected code block (no markdown syntax). 
Be specific about what was wrong.`;

const SYSTEM_PROMPT_GENERATE = `You are CodeWhisper, an AI coding assistant for visually impaired developers. 
Generate clean, well-commented code based on the user's description. Provide only the code itself, no markdown fences. 
Match the language of the current file if mentioned.`;

const SYSTEM_PROMPT_GENERAL = `You are CodeWhisper, an AI assistant for visually impaired developers. 
Respond in plain spoken English suitable for text-to-speech. Avoid markdown, bullets, or symbols. Keep responses concise (under 200 words).`;

export function activate(context: vscode.ExtensionContext): void {
    console.log('CodeWhisper: Activating...');

    // ── Init audio host (hidden webview for TTS + sound alerts) ──────────────
    initAudioHost(context);

    // ── Status Bar ───────────────────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'codewhisper.toggleListening';
    updateStatusBar(false);
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ── Start background features ────────────────────────────────────────────
    context.subscriptions.push(startDiagnosticsWatcher());
    startDebugAssistant(context);
    context.subscriptions.push(registerCursorAnnouncer(context));
    context.subscriptions.push(registerFileSaveAnnouncer());

    // ── Register Commands ────────────────────────────────────────────────────
    const cmds: [string, () => any][] = [
        ['codewhisper.showFeatures', () => showFeaturesDashboard(context)],
        ['codewhisper.toggleListening', () => toggleListening(context)],
        ['codewhisper.readCurrentLine', () => readCurrentLine()],
        ['codewhisper.readFile', () => handleReadFile()],
        ['codewhisper.explainCode', () => handleExplainCode()],
        ['codewhisper.fixError', () => handleFixError()],
        ['codewhisper.readErrors', () => handleReadErrors()],
        ['codewhisper.summarizeFile', () => handleSummarizeFile()],
        ['codewhisper.generateCode', () => handleGenerateCodePrompt()],
        ['codewhisper.commentCode', () => handleCommentCode()],
        ['codewhisper.generateTests', () => handleGenerateTests()],
        ['codewhisper.nextError', () => nextError()],
        ['codewhisper.prevError', () => prevError()],
        ['codewhisper.readOutline', () => readFileOutline()],
        ['codewhisper.securityAudit', () => handleSecurityAudit()],
        ['codewhisper.complexityAnalysis', () => handleComplexityAnalysis()],
        ['codewhisper.stopSpeaking', () => stopSpeaking()],
        ['codewhisper.openSettings', () => vscode.commands.executeCommand('workbench.action.openSettings', 'codewhisper')],
    ];

    for (const [cmd, handler] of cmds) {
        context.subscriptions.push(vscode.commands.registerCommand(cmd, handler));
    }

    // Welcome message
    setTimeout(() => {
        speak('CodeWhisper is ready. Press Control Shift V to start listening, or use the microphone in the status bar.');
    }, 2000);

    console.log('CodeWhisper: Activated successfully.');
}

// ────────────────────────────────────────────────────────────────────────────
// Listening Toggle
// ────────────────────────────────────────────────────────────────────────────

async function toggleListening(context: vscode.ExtensionContext): Promise<void> {
    if (isListeningActive) {
        stopListening();
        isListeningActive = false;
        updateStatusBar(false);
        speak('Voice listening stopped.');
        return;
    }

    isListeningActive = true;
    updateStatusBar(true);
    speak('Listening activated. Say a command after the beep.');

    const config = vscode.workspace.getConfiguration('codewhisper');
    const duration = config.get<number>('recordingDuration', 5);

    // Wait for the speak command to finish its initial announcement
    await new Promise(r => setTimeout(r, 2500));

    // Keep listening in a loop until manually stopped
    while (isListeningActive) {
        if (isSpeaking()) {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        playAlert('save');
        vscode.window.setStatusBarMessage(`CodeWhisper: Listening...`, 3000);
        logLiveEvent('Microphone active. Awaiting voice input...');

        try {
            const text = await startListening(15);
            if (!isListeningActive) { break; }

            if (text && text.trim().length > 0) {
                vscode.window.setStatusBarMessage(`CodeWhisper heard: "${text}"`, 4000);
                logLiveEvent(`Heard: "<em>${text.substring(0, 100)}</em>"`);
                const intent = await parseIntent(text);
                logLiveEvent(`Routed intent: <strong>${intent.type}</strong>`);
                await handleIntent(intent, context);
            } else {
                 logLiveEvent('No speech detected.');
            }
        } catch (err: any) {
            if (isListeningActive) {
                vscode.window.showErrorMessage(`CodeWhisper Error: ${err.message}`);
                speak(`Audio error.`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }
}

function updateStatusBar(listening: boolean): void {
    if (listening) {
        statusBarItem.text = '$(mic) CodeWhisper: Listening...';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        statusBarItem.tooltip = 'CodeWhisper is listening. Click to stop.';
    } else {
        statusBarItem.text = '$(mic-filled) CodeWhisper';
        statusBarItem.backgroundColor = undefined;
        statusBarItem.tooltip = 'CodeWhisper: Click or press Ctrl+Shift+V to start voice input.';
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Intent Handler
// ────────────────────────────────────────────────────────────────────────────

async function handleIntent(intent: Intent, context: vscode.ExtensionContext): Promise<void> {
    switch (intent.type) {
        case 'readLine': readCurrentLine(); break;
        case 'readFile': await handleReadFile(); break;
        case 'openFile': await handleOpenFile(intent.name); break;
        case 'createFile': await handleCreateFile(intent.name); break;
        case 'explainCode': await handleExplainCode(); break;
        case 'fixError': await handleFixError(); break;
        case 'readErrors': handleReadErrors(); break;
        case 'summarizeFile': await handleSummarizeFile(); break;
        case 'generateCode': await handleGenerateCode(intent.description); break;
        case 'commentCode': await handleCommentCode(); break;
        case 'generateTests': await handleGenerateTests(); break;
        case 'nextError': await nextError(); break;
        case 'prevError': await prevError(); break;
        case 'readOutline': await readFileOutline(); break;
        case 'securityAudit': await handleSecurityAudit(); break;
        case 'complexityAnalysis': await handleComplexityAnalysis(); break;
        case 'goToLine': await goToLine(intent.line); break;
        case 'goToSymbol': await goToSymbol(intent.name); break;
        case 'saveFile': await vscode.commands.executeCommand('workbench.action.files.save'); speak('File saved.'); playAlert('save'); break;
        case 'formatDocument': await vscode.commands.executeCommand('editor.action.formatDocument'); speak('Document formatted.'); break;
        case 'openTerminal': await vscode.commands.executeCommand('workbench.action.terminal.new'); speak('Terminal opened.'); break;
        case 'runCode': await vscode.commands.executeCommand('workbench.action.debug.run'); speak('Running code.'); break;
        case 'stopListening':
            isListeningActive = false;
            stopListening();
            updateStatusBar(false);
            speak('Voice listening stopped.');
            break;
        case 'stopSpeaking': stopSpeaking(); break;
        case 'gitDiff': await handleGitDiff(); break;
        case 'unknown':
            speak(`I didn't understand: "${intent.raw}". Please try again.`);
            break;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// AI Feature Handlers
// ────────────────────────────────────────────────────────────────────────────

async function withProgress<T>(title: string, fn: () => Promise<T>): Promise<T | undefined> {
    logLiveEvent(`[Background] ${title}`);
    return vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title, cancellable: false },
        async () => {
            try {
                return await fn();
            } catch (err: any) {
                vscode.window.showErrorMessage(`CodeWhisper AI Error: ${err.message}`);
                speak(`Error: ${err.message}`);
                return undefined;
            }
        }
    );
}

function getEditorLanguage(): string {
    return vscode.window.activeTextEditor?.document.languageId ?? 'code';
}

async function handleReadFile(): Promise<void> {
    const text = getFullFileText();
    if (!text) { speak('No file is open.'); return; }

    const editor = vscode.window.activeTextEditor!;
    const fileName = editor.document.fileName.split(/[\\/]/).pop();
    speak(`Reading ${fileName}. ${text.substring(0, 2000)}`);
}

async function handleCreateFile(name: string): Promise<void> {
    let filename = name ? name.replace(/\s+/g, '_') : 'new_file.txt';
    // Default to .ts if they just say "typescript" but our LLM extracts 'typescript' as the name
    if (!filename.includes('.')) {
        if (filename.toLowerCase().includes('python')) filename = 'new_file.py';
        else if (filename.toLowerCase().includes('javascript')) filename = 'new_file.js';
        else filename += '.ts';
    }

    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        speak('No workspace is open. Creating an empty document instead.');
        const doc = await vscode.workspace.openTextDocument({ content: '' });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
        return;
    }

    const rootUri = vscode.workspace.workspaceFolders[0].uri;
    const fileUri = vscode.Uri.joinPath(rootUri, filename);
    
    try {
        // Write an empty physical file to the workspace
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array(0));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
        speak(`Created file ${filename} in your workspace.`);
    } catch (e: any) {
        speak('Failed to create file: ' + e.message);
    }
}

async function handleOpenFile(name: string): Promise<void> {
    if (!name) { speak('I did not catch the file name.'); return; }
    speak(`Looking for ${name}`);
    
    // Search for any file matching the spoken text
    const cleanName = name.replace(/[^\w.-]/g, '');
    let files = await vscode.workspace.findFiles(`**/*${cleanName}*`, '**/node_modules/**');
    
    if (files.length === 0 && cleanName.includes('.')) {
        // Try without extension
        const base = cleanName.split('.')[0];
        files = await vscode.workspace.findFiles(`**/*${base}*`, '**/node_modules/**');
    }
    
    if (files.length === 0) {
        speak(`Could not find any file matching ${name}.`);
        return;
    }
    
    const doc = await vscode.workspace.openTextDocument(files[0]);
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
    
    const matchedName = files[0].path.split('/').pop() || 'the file';
    speak(`Opened ${matchedName}`);
}

async function handleExplainCode(): Promise<void> {
    const code = getSelectedOrContextCode();
    if (!code.trim()) { speak('No code selected or no file open.'); return; }

    const lang = getEditorLanguage();
    speak('Analyzing the selected code. Please wait.');

    await withProgress('CodeWhisper: Explaining code...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_EXPLAIN,
            `Explain this ${lang} code in plain English suitable for text-to-speech:\n\n${buildCodeContext(code, lang)}`
        );
        speak(response);
    });
}

async function handleFixError(): Promise<void> {
    const error = getNearestError();
    const code = getFullFileText();
    const lang = getEditorLanguage();

    if (!error && !code) { speak('No errors found near the cursor.'); return; }

    const errorDesc = error
        ? `Error on line ${error.range.start.line + 1}: ${error.message}`
        : 'Fix any issues in the code.';

    speak('Analyzing the error. Please wait.');

    await withProgress('CodeWhisper: Generating fix...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_FIX,
            `${errorDesc}\n\nHere is the complete file.\n\nCode:\n${buildCodeContext(code, lang)}\n\nProvide the fully corrected version of the ENTIRE file. IMPORTANT: Output ONLY the raw code inside a markdown block (\`\`\`). Do not include any explanations.`
        );

        // Robustly extract just the code block
        let cleanText = response;
        const match = response.match(/```[\w]*\n([\s\S]*?)\n```/);
        if (match) {
            cleanText = match[1];
        } else if (cleanText.includes('```')) {
            const parts = cleanText.split('```');
            if (parts.length >= 3) {
                let codePart = parts[1];
                const firstNewLine = codePart.indexOf('\n');
                if (firstNewLine !== -1 && firstNewLine < 25) {
                    codePart = codePart.substring(firstNewLine + 1);
                }
                cleanText = codePart;
            }
        }

        // Apply fix directly to the active editor
        await replaceEntireFile(cleanText);
        speak('Fix applied to your code. The entire file has been updated.');
        playAlert('suggestion');
    });
}

function handleReadErrors(): void {
    const text = getDiagnosticsText();
    speak(text);
}

async function handleSummarizeFile(): Promise<void> {
    const code = getFullFileText();
    if (!code.trim()) { speak('No file is open.'); return; }

    const lang = getEditorLanguage();
    speak('Summarizing the file. Please wait.');

    await withProgress('CodeWhisper: Summarizing file...', async () => {
        const snippet = code.substring(0, 4000); // Limit context
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERAL,
            `Summarize what this ${lang} file does in plain spoken English. Describe its purpose, main functions, and any important patterns:\n\n${snippet}`
        );
        speak(response);
    });
}

async function handleGenerateCodePrompt(): Promise<void> {
    const description = await vscode.window.showInputBox({
        prompt: 'Describe the code you want to generate',
        placeHolder: 'e.g. a function that fetches user data from an API',
    });
    if (description) { await handleGenerateCode(description); }
}

async function handleGenerateCode(description: string): Promise<void> {
    if (!description.trim()) { speak('Please provide a description for the code.'); return; }

    const lang = getEditorLanguage();
    speak(`Generating code for: ${description}. Please wait.`);

    await withProgress('CodeWhisper: Generating code...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERATE,
            `Generate ${lang} code for: ${description}. Provide only the code, no markdown fences.`
        );
        await insertAtCursor(`\n${response}\n`);
        speak('Code generated and inserted at cursor. Please review it.');
        playAlert('suggestion');
    });
}

async function handleCommentCode(): Promise<void> {
    const code = getSelectedOrContextCode();
    if (!code.trim()) { speak('Please select code to comment.'); return; }

    const lang = getEditorLanguage();
    speak('Generating comments. Please wait.');

    await withProgress('CodeWhisper: Adding comments...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERAL,
            `Add clear, helpful comments to this ${lang} code. Return only the commented code with no markdown fences:\n\n${code}`
        );
        await replaceSelection(response);
        speak('Comments added to your code.');
        playAlert('suggestion');
    });
}

async function handleGenerateTests(): Promise<void> {
    const code = getSelectedOrContextCode();
    if (!code.trim()) { speak('Please select a function to generate tests for.'); return; }

    const lang = getEditorLanguage();
    speak('Generating tests. Please wait.');

    await withProgress('CodeWhisper: Generating tests...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERATE,
            `Write comprehensive unit tests for this ${lang} code using the most popular test framework for ${lang}. Return only the test code with no markdown fences:\n\n${code}`
        );
        const doc = await vscode.workspace.openTextDocument({ content: response, language: lang });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        speak('Tests generated. Review the new panel beside your editor.');
        playAlert('suggestion');
    });
}

async function handleSecurityAudit(): Promise<void> {
    const code = getSelectedOrContextCode();
    if (!code.trim()) { speak('No code to audit.'); return; }

    const lang = getEditorLanguage();
    speak('Running security audit. Please wait.');

    await withProgress('CodeWhisper: Security audit...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERAL,
            `Find any security vulnerabilities in this ${lang} code. Explain findings in plain spoken English without markdown:\n\n${code}`
        );
        speak(response);
    });
}

async function handleComplexityAnalysis(): Promise<void> {
    const code = getSelectedOrContextCode();
    if (!code.trim()) { speak('No code to analyze.'); return; }

    const lang = getEditorLanguage();
    speak('Analyzing complexity. Please wait.');

    await withProgress('CodeWhisper: Complexity analysis...', async () => {
        const response = await chatCompletion(
            SYSTEM_PROMPT_GENERAL,
            `Analyze the time and space complexity of this ${lang} code. Explain in plain spoken English without markdown symbols:\n\n${code}`
        );
        speak(response);
    });
}

async function handleGitDiff(): Promise<void> {
    speak('Getting git changes. Please wait.');

    await withProgress('CodeWhisper: Reading git diff...', async () => {
        try {
            const gitExt = vscode.extensions.getExtension('vscode.git');
            if (!gitExt) { speak('Git extension not found.'); return; }

            const git = gitExt.exports.getAPI(1);
            const repo = git.repositories[0];
            if (!repo) { speak('No git repository found.'); return; }

            const changes = repo.state.workingTreeChanges;
            if (changes.length === 0) {
                speak('No uncommitted changes found in the working tree.');
                return;
            }

            const summary = changes.map((c: any) => {
                const status = c.status === 0 ? 'modified' : c.status === 1 ? 'new file' : 'deleted';
                return `${status}: ${c.uri.fsPath.split(/[\\/]/).pop()}`;
            }).join(', ');

            const response = await chatCompletion(
                SYSTEM_PROMPT_GENERAL,
                `Summarize these git changes in plain English: ${summary}`
            );
            speak(response);
        } catch {
            speak('Could not read git changes.');
        }
    });
}

// ────────────────────────────────────────────────────────────────────────────

export function deactivate(): void {
    stopListening();
    stopSpeaking();
    console.log('CodeWhisper: Deactivated.');
}
