import * as vscode from 'vscode';

/**
 * Intent types dispatched by the command parser.
 */
export type Intent =
    | { type: 'readLine' }
    | { type: 'readFile' }
    | { type: 'openFile'; name: string }
    | { type: 'createFile'; name: string }
    | { type: 'explainCode' }
    | { type: 'fixError' }
    | { type: 'readErrors' }
    | { type: 'summarizeFile' }
    | { type: 'generateCode'; description: string }
    | { type: 'commentCode' }
    | { type: 'generateTests' }
    | { type: 'nextError' }
    | { type: 'prevError' }
    | { type: 'readOutline' }
    | { type: 'securityAudit' }
    | { type: 'complexityAnalysis' }
    | { type: 'goToLine'; line: number }
    | { type: 'goToSymbol'; name: string }
    | { type: 'saveFile' }
    | { type: 'formatDocument' }
    | { type: 'openTerminal' }
    | { type: 'runCode' }
    | { type: 'stopListening' }
    | { type: 'stopSpeaking' }
    | { type: 'gitDiff' }
    | { type: 'unknown'; raw: string };

const ROUTING_PROMPT = `You are the intent router for CodeWhisper, an AI coding assistant.
Map the user's spoken command to exactly one JSON intent.

AVAILABLE INTENTS:
- readLine: Read the current line aloud
- readFile: Read the entire file
- openFile: Open an existing file from the workspace (requires "name" string property)
- createFile: Create a new file (requires "name" string property with a valid filename like "index.ts" or "main.py")
- explainCode: Explain selected code / describe what something does
- fixError: Fix an error / what's wrong here
- readErrors: Read all errors / find all problems
- summarizeFile: Summarize the file / give me an overview
- generateCode: Write code (requires "description" string property)
- commentCode: Add comments to code
- generateTests: Generate tests
- nextError: Go to next error
- prevError: Go to previous error
- readOutline: Read file outline / list functions
- securityAudit: Check for security vulnerabilities
- complexityAnalysis: Analyze time/space complexity
- goToLine: Go to a specific line (requires "line" integer property)
- goToSymbol: Go to a function/class (requires "name" string property)
- saveFile: Save the file
- formatDocument: Format code / beautify
- openTerminal: Open terminal
- runCode: Run code
- stopListening: Stop microphone / turn off mic
- stopSpeaking: Stop voice output / shut up / quiet
- gitDiff: Read git changes / what changed

EXAMPLES:
User: "go to line forty two" -> {"type": "goToLine", "line": 42}
User: "jump to the handle submit function" -> {"type": "goToSymbol", "name": "handleSubmit"}
User: "write a function that sorts an array" -> {"type": "generateCode", "description": "a function that sorts an array"}
User: "what's wrong here" -> {"type": "fixError"}
User: "please save the file" -> {"type": "saveFile"}
User: "create a new typescript file" -> {"type": "createFile", "name": "new_file.ts"}
User: "open the index html file" -> {"type": "openFile", "name": "index.html"}
User: "tell me what this function does" -> {"type": "explainCode"}

OUTPUT FORMAT:
Return ONLY raw JSON. No markdown fences, no \`\`\`json, no explanations. Just the JSON object.`;

import { chatCompletion } from './groqClient';

export async function parseIntent(raw: string): Promise<Intent> {
    const text = raw.trim();
    if (!text) return { type: 'unknown', raw: text };

    try {
        const response = await chatCompletion(ROUTING_PROMPT, `User Command: "${text}"`, 'llama-3.3-70b-versatile');

        // Clean up markdown fences just in case
        const cleaned = response.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        if (parsed && typeof parsed.type === 'string') {
            return parsed as Intent;
        }
    } catch (e) {
        console.error('LLM Intent parsing failed:', e);
    }

    return { type: 'unknown', raw: text };
}
