import * as vscode from 'vscode';
import { speak } from './audioHost';
import { getCurrentLineText } from './codeAnalyzer';

export async function goToLine(lineNumber: number): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        speak('No file is open.');
        return;
    }

    const line = Math.max(0, lineNumber - 1); // Convert to 0-indexed
    const maxLine = editor.document.lineCount - 1;

    if (line > maxLine) {
        speak(`This file only has ${editor.document.lineCount} lines.`);
        return;
    }

    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    speak(`Jumped to line ${lineNumber}. ${editor.document.lineAt(line).text.trim() || 'empty line'}.`);
}

export async function goToSymbol(symbolName: string): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.quickOpen', `@${symbolName}`);
    speak(`Searching for symbol: ${symbolName}.`);
}

export async function nextError(): Promise<void> {
    await vscode.commands.executeCommand('editor.action.marker.nextInFiles');
    speak('Jumped to next error.');
}

export async function prevError(): Promise<void> {
    await vscode.commands.executeCommand('editor.action.marker.prevInFiles');
    speak('Jumped to previous error.');
}

export function readCurrentLine(): void {
    const text = getCurrentLineText();
    if (!text || !text.trim()) {
        speak('Current line is empty.');
    } else {
        speak(text);
    }
}

export async function readFileOutline(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        speak('No file is open.');
        return;
    }

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        editor.document.uri
    );

    if (!symbols || symbols.length === 0) {
        speak('No symbols found in this file.');
        return;
    }

    const summary = symbols.map((s) => {
        const kind = vscode.SymbolKind[s.kind].toLowerCase();
        return `${kind} ${s.name} at line ${s.range.start.line + 1}`;
    }).join(', ');

    speak(`This file contains ${symbols.length} symbols: ${summary}.`);
}

export function announcePosition(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const line = editor.selection.active.line + 1;
    const col = editor.selection.active.character + 1;
    const fileName = editor.document.fileName.split(/[\\/]/).pop();
    speak(`${fileName}, line ${line}, column ${col}.`);
}

export function registerCursorAnnouncer(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.onDidChangeTextEditorSelection((e) => {
        const config = vscode.workspace.getConfiguration('codewhisper');
        if (!config.get<boolean>('announceOnCursorMove', false)) { return; }
        const line = e.textEditor.document.lineAt(e.selections[0].active.line).text.trim();
        if (line) { speak(line); }
    });
}

export function registerFileSaveAnnouncer(): vscode.Disposable {
    const { playAlert, speak: spk } = require('./audioHost');
    return vscode.workspace.onDidSaveTextDocument((doc) => {
        playAlert('save');
    });
}
