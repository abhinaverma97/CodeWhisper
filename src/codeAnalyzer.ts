import * as vscode from 'vscode';

/**
 * Returns the text of the currently selected range, or the function/block
 * surrounding the cursor if no selection.
 */
export function getSelectedOrContextCode(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return ''; }

    const selection = editor.selection;
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    // No selection — return surrounding ~20 lines for context
    const line = selection.active.line;
    const start = Math.max(0, line - 10);
    const end = Math.min(editor.document.lineCount - 1, line + 10);
    const range = new vscode.Range(start, 0, end, editor.document.lineAt(end).text.length);
    return editor.document.getText(range);
}

/**
 * Returns the full text of the active document.
 */
export function getFullFileText(): string {
    const editor = vscode.window.activeTextEditor;
    return editor ? editor.document.getText() : '';
}

/**
 * Returns the current line text.
 */
export function getCurrentLineText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return ''; }
    const line = editor.selection.active.line;
    return editor.document.lineAt(line).text;
}

/**
 * Returns current file info: name, language, line count, cursor position.
 */
export function getFileInfo(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return 'No file open.'; }
    const doc = editor.document;
    const line = editor.selection.active.line + 1;
    const col = editor.selection.active.character + 1;
    return `File: ${doc.fileName.split(/[\\/]/).pop()}, Language: ${doc.languageId}, Lines: ${doc.lineCount}, Cursor: line ${line} column ${col}`;
}

/**
 * Returns all current diagnostics for the active file as a readable string.
 */
export function getDiagnosticsText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return 'No file open.'; }

    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    if (diags.length === 0) { return 'No errors or warnings in this file.'; }

    return diags.map((d) => {
        const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'Error'
            : d.severity === vscode.DiagnosticSeverity.Warning ? 'Warning'
                : d.severity === vscode.DiagnosticSeverity.Information ? 'Info'
                    : 'Hint';
        return `Line ${d.range.start.line + 1}: ${severity} — ${d.message}`;
    }).join('. ');
}

/**
 * Returns the error nearest the cursor for targeted fixing.
 */
export function getNearestError(): vscode.Diagnostic | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }

    const diags = vscode.languages.getDiagnostics(editor.document.uri);
    if (diags.length === 0) { return undefined; }

    const cursorLine = editor.selection.active.line;
    return diags.reduce((nearest, d) => {
        const dist = Math.abs(d.range.start.line - cursorLine);
        const nearestDist = Math.abs(nearest.range.start.line - cursorLine);
        return dist < nearestDist ? d : nearest;
    }, diags[0]);
}

/**
 * Returns a compact file stats string suitable for LLM prompts.
 */
export function buildCodeContext(code: string, language: string): string {
    return `Language: ${language}\n\n\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Inserts text at the current cursor position.
 */
export async function insertAtCursor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const position = editor.selection.active;
    await editor.edit((editBuilder) => {
        editBuilder.insert(position, text);
    });
}

export async function replaceSelection(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    await editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, text);
    });
}

/**
 * Replaces the entire active file with the given text.
 */
export async function replaceEntireFile(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }
    const doc = editor.document;
    const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
    );
    await editor.edit((editBuilder) => {
        editBuilder.replace(fullRange, text);
    });
}
