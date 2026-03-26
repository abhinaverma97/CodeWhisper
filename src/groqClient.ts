import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';

const GROQ_API_KEY = 'enter api key';
const GROQ_BASE_URL = 'api.groq.com';

export function getGroqKey(): string {
    return GROQ_API_KEY;
}

/**
 * Sends an audio buffer (WAV file path) to Groq Whisper for transcription.
 */
export async function transcribeAudio(audioFilePath: string, model = 'whisper-large-v3-turbo'): Promise<string> {
    const fileBuffer = fs.readFileSync(audioFilePath);
    const fileName = path.basename(audioFilePath);
    const boundary = `----FormBoundary${Date.now()}`;

    const formParts: Buffer[] = [];

    // model field
    formParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`
    ));

    // response_format field
    formParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`
    ));

    // language field
    formParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n`
    ));

    // file field
    formParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: audio/wav\r\n\r\n`
    ));
    formParts.push(fileBuffer);
    formParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    return new Promise((resolve, reject) => {
        const options: https.RequestOptions = {
            hostname: GROQ_BASE_URL,
            path: '/openai/v1/audio/transcriptions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.text) {
                        resolve(parsed.text.trim());
                    } else if (parsed.error) {
                        reject(new Error(`Groq Whisper error: ${parsed.error.message}`));
                    } else {
                        reject(new Error(`Unexpected response: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Whisper response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Calls Groq LLM chat completion.
 */
export async function chatCompletion(
    systemPrompt: string,
    userMessage: string,
    model = 'llama-3.3-70b-versatile'
): Promise<string> {
    const body = JSON.stringify({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1024,
    });

    return new Promise((resolve, reject) => {
        const options: https.RequestOptions = {
            hostname: GROQ_BASE_URL,
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.choices && parsed.choices[0]?.message?.content) {
                        resolve(parsed.choices[0].message.content.trim());
                    } else if (parsed.error) {
                        reject(new Error(`Groq LLM error: ${parsed.error.message}`));
                    } else {
                        reject(new Error(`Unexpected LLM response: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse LLM response: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
