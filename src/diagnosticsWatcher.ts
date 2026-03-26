import * as vscode from 'vscode';
import { playAlert } from './audioHost';
import { speak } from './audioHost';

interface DiagnosticSnapshot {
    errors: number;
    warnings: number;
    uris: Set<string>;
}

let prevSnapshot: DiagnosticSnapshot = { errors: 0, warnings: 0, uris: new Set() };
let disposable: vscode.Disposable | undefined;

function getSnapshot(): DiagnosticSnapshot {
    let errors = 0;
    let warnings = 0;
    const uris = new Set<string>();

    for (const [uri, diags] of vscode.languages.getDiagnostics()) {
        for (const d of diags) {
            if (d.severity === vscode.DiagnosticSeverity.Error) { errors++; uris.add(uri.toString()); }
            if (d.severity === vscode.DiagnosticSeverity.Warning) { warnings++; uris.add(uri.toString()); }
        }
    }

    return { errors, warnings, uris };
}

export function startDiagnosticsWatcher(): vscode.Disposable {
    prevSnapshot = getSnapshot();

    let debounceTimer: NodeJS.Timeout | undefined;

    disposable = vscode.languages.onDidChangeDiagnostics(() => {
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            const current = getSnapshot();
            const config = vscode.workspace.getConfiguration('codewhisper');
            const shouldAnnounce = config.get<boolean>('announceErrors', true);

            // New errors appeared
            if (current.errors > prevSnapshot.errors) {
                playAlert('error');
                if (shouldAnnounce) {
                    const delta = current.errors - prevSnapshot.errors;
                    speak(`${delta} new error${delta > 1 ? 's' : ''} found.`);
                }
            }
            // New warnings appeared (but no new errors)
            else if (current.warnings > prevSnapshot.warnings && current.errors <= prevSnapshot.errors) {
                playAlert('warning');
                if (shouldAnnounce) {
                    const delta = current.warnings - prevSnapshot.warnings;
                    speak(`${delta} new warning${delta > 1 ? 's' : ''}.`);
                }
            }
            // Errors cleared
            else if (current.errors < prevSnapshot.errors && current.errors === 0) {
                playAlert('cleared');
                if (shouldAnnounce) {
                    speak('All errors cleared. File is clean.');
                }
            }

            prevSnapshot = current;
        }, 800); // debounce: wait 800ms after last change
    });

    return disposable;
}

export function stopDiagnosticsWatcher(): void {
    disposable?.dispose();
}
