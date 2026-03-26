import * as vscode from 'vscode';
import * as path from 'path';

let webviewPanel: vscode.WebviewPanel | undefined;
let panelReady = false;
let pendingMessages: any[] = [];
let isCurrentlySpeaking = false;

export function isSpeaking(): boolean {
    return isCurrentlySpeaking;
}

function getAudioHostHtml(context: vscode.ExtensionContext): string {
    const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'audioHost.html');
    const fs = require('fs');
    return fs.readFileSync(htmlPath, 'utf8');
}

export function initAudioHost(context: vscode.ExtensionContext): void {
    if (webviewPanel) {
        return;
    }

    webviewPanel = vscode.window.createWebviewPanel(
        'codewhisperAudioHost',
        'CodeWhisper Audio',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [],
        }
    );

    webviewPanel.webview.html = getAudioHostHtml(context);

    webviewPanel.webview.onDidReceiveMessage((msg) => {
        if (msg.type === 'ready') {
            panelReady = true;
            // Flush pending messages
            for (const m of pendingMessages) {
                webviewPanel?.webview.postMessage(m);
            }
            pendingMessages = [];
        } else if (msg.type === 'speakStart') {
            isCurrentlySpeaking = true;
        } else if (msg.type === 'speakEnd') {
            isCurrentlySpeaking = false;
        }
    });

    webviewPanel.onDidDispose(() => {
        webviewPanel = undefined;
        panelReady = false;
    });
}

function sendToWebview(msg: any): void {
    if (!webviewPanel) { return; }
    if (panelReady) {
        webviewPanel.webview.postMessage(msg);
    } else {
        pendingMessages.push(msg);
    }
}

export function logLiveEvent(message: string): void {
    sendToWebview({ type: 'liveEvent', message });
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

export function speak(text: string): void {
    const config = vscode.workspace.getConfiguration('codewhisper');

    const cleanText = text.replace(/<[^>]*>/g, '');
    const shortText = cleanText.length > 120 ? cleanText.substring(0, 120) + '...' : cleanText;
    logLiveEvent(`Spoke: "${shortText}"`);

    sendToWebview({
        type: 'speak',
        text,
        rate: config.get<number>('ttsRate', 1.1),
        pitch: config.get<number>('ttsPitch', 1.0),
        volume: config.get<number>('ttsVolume', 1.0),
    });
}

export function stopSpeaking(): void {
    sendToWebview({ type: 'stopSpeak' });
}

// ─── Sound Alerts ─────────────────────────────────────────────────────────────

export type AlertType =
    | 'error'
    | 'warning'
    | 'cleared'
    | 'save'
    | 'breakpoint'
    | 'testPass'
    | 'testFail'
    | 'complete'
    | 'suggestion';

export function playAlert(type: AlertType): void {
    const config = vscode.workspace.getConfiguration('codewhisper');
    const volume = config.get<number>('alertVolume', 0.6);
    sendToWebview({ type: 'alert', alertType: type, volume });
}
