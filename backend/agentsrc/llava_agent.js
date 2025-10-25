// llava_agent.js - LLaVA-powered game agent with mouse control
import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { captureGameWindow, extractROI } from './helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MOUSE_CONTROL_SCRIPT = path.join(__dirname, 'mouse_control.py');

const TARGET = "Warpforge";
const OUTPUT_DIR = './agent_captures';
const MAX_EVENTS = 10;

// Choose API endpoint
const USE_CUSTOM_ENDPOINT = true; // Set to false to use Ollama
const CUSTOM_API = "http://localhost:8000/v1/chat/completions"; // OpenAI-compatible
const OLLAMA_API = "http://localhost:11434/api/generate"; // Ollama
const API_ENDPOINT = USE_CUSTOM_ENDPOINT ? CUSTOM_API : OLLAMA_API;

console.log("[LLAVA_AGENT] ==========================================");
console.log("[LLAVA_AGENT] Starting LLaVA Game Agent");
console.log("[LLAVA_AGENT] Target window:", TARGET);
console.log("[LLAVA_AGENT] Max events:", MAX_EVENTS);
console.log("[LLAVA_AGENT] API Endpoint:", API_ENDPOINT);
console.log("[LLAVA_AGENT] ==========================================\n");

await fs.mkdir(OUTPUT_DIR, { recursive: true });

let eventCount = 0;
let gameState = {
    lastAction: null,
    windowBounds: null
};

const SYSTEM_PROMPT = `You are a game-playing agent for Warpforge, a card game.
Analyze the screenshot and decide what action to take next.

Coordinates are relative to the game window (0,0 is top-left of the game window),
 and should be pixel perfect on the instructions, THESE ARE YOUR HARD LIMITS x=0 y=33 to
  x=944 y=593, so you cant have anything greater than that, NEVER HAVE ANY Y GREATER THAN 590

Respond ONLY with valid JSON in this exact format:
{
  "reasoning": "brief explanation of what you see and why you're taking this action",
  "action": "move" | "click" | "drag_start" | "drag_end",
  "x": <number>,
  "y": <number>
}

Available actions:
- "move": Move mouse to position
- "click": Click at position
- "drag_start": Press mouse button down at position (start drag)
- "drag_end": Release mouse button at position (end drag)



Game context:
- You can see your mana, cards in hand, and playable cards
- Cards with green glow are playable
- Drag cards from hand to play area to play them
- Click buttons to end turn or perform actions

Think strategically and play to win!`;

/**
 * Call vision API with screenshot
 * @param {string} imagePath - Path to screenshot
 * @returns {Promise<Object>} API response with action
 */
async function queryLLaVA(imagePath) {
    try {
        // Read and encode image
        const imageBuffer = await fs.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');

        let requestBody, parseResponse;

        if (USE_CUSTOM_ENDPOINT) {
            // Custom API format (OpenAI-compatible)
            requestBody = {
                model: "/model",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: SYSTEM_PROMPT
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/png;base64,${imageBase64}`
                                }
                            }
                        ]
                    }
                ]
            };

            parseResponse = (data) => {
                const message = data.choices[0].message;
                console.log("[LLAVA_AGENT] Raw message:", JSON.stringify(message, null, 2));
                const content = message.content;
                console.log("[LLAVA_AGENT] Content to parse:", content);
                return JSON.parse(content);
            };

        } else {
            // Ollama API format (base64 in images array)
            requestBody = {
                model: "llava",
                prompt: SYSTEM_PROMPT,
                images: [imageBase64],
                stream: false,
                format: "json"
            };

            parseResponse = (data) => {
                return JSON.parse(data.response);
            };
        }

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vision API error: ${response.status} ${response.statusText}\n${errorText}`);
        }

        const data = await response.json();

        // Parse the response
        let actionData;
        try {
            actionData = parseResponse(data);
        } catch (e) {
            console.error("[LLAVA_AGENT] Failed to parse API response:", data);
            throw new Error("Invalid JSON response from vision API");
        }

        return actionData;

    } catch (error) {
        console.error("[LLAVA_AGENT] Vision API query failed:", error.message);
        throw error;
    }
}

/**
 * Execute mouse action using Python script
 * @param {Object} action - Action object from LLaVA
 * @param {Object} bounds - Window bounds for coordinate translation
 * @returns {Promise<Object>} Execution result
 */
function executeAction(action, bounds) {
    return new Promise((resolve, reject) => {
        const { action: type, x, y } = action;

        // Validate coordinates
        if (typeof x !== 'number' || typeof y !== 'number') {
            reject(new Error(`Invalid coordinates: x=${x}, y=${y}`));
            return;
        }

        // Translate relative coordinates to absolute screen coordinates
        const screenX = bounds.x + x;
        const screenY = bounds.y + y;

        console.log(`[LLAVA_AGENT] Executing: ${type} at relative (${x}, ${y}) -> screen (${screenX}, ${screenY})`);

        // Prepare action data for Python script
        const actionData = JSON.stringify({
            action: type,
            x: screenX,
            y: screenY
        });

        // Execute Python script
        const python = spawn('python', [MOUSE_CONTROL_SCRIPT, actionData]);

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Mouse control failed: ${stderr}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                if (result.success) {
                    resolve(result);
                } else {
                    reject(new Error(result.error));
                }
            } catch (error) {
                reject(new Error(`Failed to parse mouse control result: ${error.message}`));
            }
        });

        python.on('error', (error) => {
            reject(new Error(`Failed to spawn Python: ${error.message}`));
        });
    });
}

/**
 * Main agent loop iteration
 */
async function agentIteration() {
    eventCount++;
    console.log("\n[LLAVA_AGENT] ========== EVENT #" + eventCount + "/" + MAX_EVENTS + " ==========");
    console.log("[LLAVA_AGENT] Time:", new Date().toLocaleTimeString());

    try {
        // Capture game window
        console.log("[LLAVA_AGENT] Capturing game window...");
        const captureResult = await captureGameWindow(TARGET, "[LLAVA_AGENT]");

        if (!captureResult) {
            console.log("[LLAVA_AGENT] ✗ Could not capture window, skipping iteration\n");
            return false;
        }

        // Store window bounds for coordinate translation
        gameState.windowBounds = captureResult.bounds;

        // Save screenshot
        const imagePath = `${OUTPUT_DIR}/event_${eventCount}_${Date.now()}.png`;
        await fs.writeFile(imagePath, captureResult.buffer);
        console.log("[LLAVA_AGENT] ✓ Saved:", imagePath);

        // Extract ROI data for context (optional, helps with debugging)
        console.log("[LLAVA_AGENT] Extracting ROI data...");
        const roiData = await extractROI(imagePath);
        console.log("[LLAVA_AGENT] ✓ ROI extracted - Mana:", roiData.rois?.mana?.value || "N/A");

        // Query LLaVA for next action
        console.log("[LLAVA_AGENT] Querying LLaVA...");
        const action = await queryLLaVA(imagePath);

        console.log("[LLAVA_AGENT] ✓ LLaVA Response:");
        console.log("[LLAVA_AGENT]   Reasoning:", action.reasoning);
        console.log("[LLAVA_AGENT]   Action:", action.action);
        console.log("[LLAVA_AGENT]   Position: (" + action.x + ", " + action.y + ")");

        // Execute action
        console.log("[LLAVA_AGENT] Executing action...");
        await executeAction(action, captureResult.bounds);
        console.log("[LLAVA_AGENT] ✓ Action executed");

        // Store last action
        gameState.lastAction = action;

        // Wait a bit for game to respond
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("[LLAVA_AGENT] ✓ Iteration complete!");
        return true;

    } catch (error) {
        console.error("[LLAVA_AGENT] ✗ Error:", error.message);
        return false;
    }
}

/**
 * Run agent loop
 */
async function runAgent() {
    console.log("[LLAVA_AGENT] Starting agent loop in 3 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 3000));

    while (eventCount < MAX_EVENTS) {
        const success = await agentIteration();

        if (!success) {
            console.log("[LLAVA_AGENT] Iteration failed, waiting before retry...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Brief pause between iterations
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("\n[LLAVA_AGENT] ==========================================");
    console.log("[LLAVA_AGENT] Agent stopped - reached max events:", MAX_EVENTS);
    console.log("[LLAVA_AGENT] Total events executed:", eventCount);
    console.log("[LLAVA_AGENT] ==========================================");
}

// Start the agent
runAgent().catch(error => {
    console.error("[LLAVA_AGENT] Fatal error:", error);
    process.exit(1);
});
