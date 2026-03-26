import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { transcribeAudio } from './groqClient';

let isListening = false;
let recordingProcess: child_process.ChildProcess | null = null;

export function isCurrentlyListening(): boolean {
    return isListening;
}

/**
 * Start capturing audio via SoX (must be installed).
 * Uses silence detection to automatically stop recording when speech ends.
 */
export async function startListening(maxDurationSeconds: number = 15): Promise<string | null> {
    if (isListening) { return null; }
    isListening = true;

    const tmpFile = path.join(os.tmpdir(), `codewhisper_${Date.now()}.wav`);

    const platform = process.platform;
    let cmd: string;
    let args: string[];

    if (platform === 'win32') {
        cmd = 'sox';
        const commonPaths = [
            'C:\\Program Files (x86)\\sox-14-4-2\\sox.exe',
            'C:\\Program Files\\sox-14-4-2\\sox.exe'
        ];
        for (const p of commonPaths) {
            if (fs.existsSync(p)) { cmd = p; break; }
        }
        // Wait for audio > 0.5% for 0.1s, then stop after silence < 0.5% for 1.5s. Max duration 15s.
        args = ['-t', 'waveaudio', 'default', '-r', '16000', '-c', '1', '-b', '16', tmpFile, 'silence', '1', '0.1', '0.5%', '1', '1.5', '0.5%', 'trim', '0', String(maxDurationSeconds)];
    } else if (platform === 'darwin') {
        cmd = 'sox';
        args = ['-d', '-r', '16000', '-c', '1', '-b', '16', tmpFile, 'silence', '1', '0.1', '0.5%', '1', '1.5', '0.5%', 'trim', '0', String(maxDurationSeconds)];
    } else {
        cmd = 'arecord';
        args = ['-r', '16000', '-c', '1', '-f', 'S16_LE', '-d', String(maxDurationSeconds), tmpFile];
    }

    return new Promise((resolve, reject) => {
        let timeoutHandle: NodeJS.Timeout;

        try {
            recordingProcess = child_process.spawn(cmd, args, { stdio: 'pipe' });

            // Hard timeout fallback: if SoX never detects the "start" of speech, 
            // it will run forever because the 'trim' filter only counts output audio.
            timeoutHandle = setTimeout(() => {
                if (recordingProcess) {
                    recordingProcess.kill('SIGTERM');
                }
            }, (maxDurationSeconds + 2) * 1000);

            recordingProcess.on('close', async (code) => {
                clearTimeout(timeoutHandle);
                isListening = false;
                recordingProcess = null;

                if (code !== 0 && code !== null) {
                    reject(new Error(`Audio recording failed (exit code ${code}). Please install SoX: https://sourceforge.net/projects/sox/`));
                    return;
                }

                if (!fs.existsSync(tmpFile)) {
                    resolve(null);
                    return;
                }

                try {
                    const text = await transcribeAudio(tmpFile);
                    resolve(text || null);
                } catch (err) {
                    reject(err);
                } finally {
                    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
                }
            });

            recordingProcess.on('error', (err: NodeJS.ErrnoException) => {
                isListening = false;
                recordingProcess = null;
                if (err.code === 'ENOENT') {
                    reject(new Error('SoX not found. Install it from https://sourceforge.net/projects/sox/ and add to PATH.'));
                } else {
                    reject(err);
                }
            });
        } catch (err) {
            isListening = false;
            reject(err);
        }
    });
}

export function stopListening(): void {
    if (recordingProcess) {
        recordingProcess.kill('SIGTERM');
        recordingProcess = null;
    }
    isListening = false;
}
