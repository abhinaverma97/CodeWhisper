import * as vscode from 'vscode';
import * as path from 'path';

let featuresPanel: vscode.WebviewPanel | undefined;

function getDashboardHtml(context: vscode.ExtensionContext): string {
    const htmlPath = path.join(context.extensionPath, 'src', 'webview', 'featuresDashboard.html');
    const fs = require('fs');
    return fs.readFileSync(htmlPath, 'utf8');
}

export function showFeaturesDashboard(context: vscode.ExtensionContext): void {
    if (featuresPanel) {
        featuresPanel.reveal(vscode.ViewColumn.One);
        return;
    }

    featuresPanel = vscode.window.createWebviewPanel(
        'codewhisperFeatures',
        'CodeWhisper Dashboard',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'src', 'webview'))]
        }
    );

    featuresPanel.webview.html = getDashboardHtml(context);

    featuresPanel.onDidDispose(() => {
        featuresPanel = undefined;
    });
}
