import * as vscode from 'vscode';
import { speak } from './audioHost';
import { playAlert } from './audioHost';

let sessionDisposables: vscode.Disposable[] = [];

export function startDebugAssistant(context: vscode.ExtensionContext): void {
    // Session started
    const onStart = vscode.debug.onDidStartDebugSession((session) => {
        speak(`Debugger started. Session: ${session.name}.`);
    });

    // Session stopped
    const onStop = vscode.debug.onDidTerminateDebugSession((session) => {
        speak(`Debugger stopped. Session: ${session.name} ended.`);
    });

    // Receive debug adapter messages (breakpoints, exceptions)
    const onMessage = vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
        if (event.event === 'stopped') {
            const reason = event.body?.reason || 'unknown reason';
            const threadId = event.body?.threadId ?? '';
            speak(`Execution stopped. Reason: ${reason}.`);
            playAlert('breakpoint');

            // After a short delay, try to narrate top stack frame
            setTimeout(async () => {
                try {
                    await narrateStackFrame(event.session);
                } catch { /* ignore */ }
            }, 800);
        }
    });

    sessionDisposables.push(onStart, onStop, onMessage);
    context.subscriptions.push(onStart, onStop, onMessage);
}

async function narrateStackFrame(session: vscode.DebugSession): Promise<void> {
    try {
        // Get thread list
        const threadsResponse = await session.customRequest('threads');
        const threads: any[] = threadsResponse?.threads ?? [];
        if (threads.length === 0) { return; }

        const threadId = threads[0].id;

        // Get stack trace
        const stackResponse = await session.customRequest('stackTrace', {
            threadId,
            startFrame: 0,
            levels: 1,
        });

        const frames: any[] = stackResponse?.stackFrames ?? [];
        if (frames.length === 0) { return; }

        const frame = frames[0];
        const frameName = frame.name || 'unknown';
        const line = frame.line || '?';
        const source = frame.source?.name || 'unknown file';

        speak(`Stopped in ${frameName} at line ${line} in ${source}.`);

        // Get local variables
        const scopesResponse = await session.customRequest('scopes', { frameId: frame.id });
        const scopes: any[] = scopesResponse?.scopes ?? [];

        if (scopes.length > 0) {
            const localScope = scopes.find((s: any) => s.name === 'Locals' || s.name === 'Local') || scopes[0];
            const varsResponse = await session.customRequest('variables', {
                variablesReference: localScope.variablesReference,
                count: 5, // Limit to first 5 variables
            });

            const vars: any[] = varsResponse?.variables ?? [];
            if (vars.length > 0) {
                const varText = vars
                    .slice(0, 5)
                    .map((v: any) => `${v.name} equals ${v.value}`)
                    .join(', ');
                speak(`Local variables: ${varText}.`);
            }
        }
    } catch (err) {
        // Some debug adapters don't support all requests — silently ignore
    }
}

export function stopDebugAssistant(): void {
    for (const d of sessionDisposables) { d.dispose(); }
    sessionDisposables = [];
}
