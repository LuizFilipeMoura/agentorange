// vision_agent.js - Vision model-powered game agent with mouse control
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
const VISION_API = "http://localhost:8000/v1/chat/completions";

console.log("[VISION_AGENT] ==========================================");
console.log("[VISION_AGENT] Starting Vision Game Agent");
console.log("[VISION_AGENT] Target window:", TARGET);
console.log("[VISION_AGENT] Max events:", MAX_EVENTS);
console.log("[VISION_AGENT] API Endpoint:", VISION_API);
console.log("[VISION_AGENT] ==========================================\n");

await fs.mkdir(OUTPUT_DIR, { recursive: true });

let eventCount = 0;
let gameState = {
    lastAction: null,
    windowBounds: null
};

const SYSTEM_PROMPT = `You are a game-playing agent for Warpforge, a card game. You receive a screenshot and must choose exactly one action.

Hard limits:
- Screen coords origin is top-left of the game window.
- Valid rectangle: x in [0, 944], y in [0, 590]. Never exceed these.
- x and y must be integers.

Output rules:
- Respond ONLY with valid JSON. No code fences. No extra text.
- JSON keys must be exactly: reasoning, action, x, y.
- action ∈ {"move","click","drag_start","drag_end"}.

Game context:
- You can see your mana, cards in hand, and playable cards.
- Cards with green glow are playable.
- To play a card: use "drag_start" on the card, then "drag_end" on the play area.
- Click buttons to end turn or confirm actions.
- Card hand is at bottom of screen (y > 500).
- Play area is in the middle (y around 250-400).

Decision policy:
1) If you see playable cards (green glow) and have mana, play the strongest card:
   - Use "drag_start" at the card's center position
   - Next action will be "drag_end" at the play area center
2) If you just did "drag_start", immediately do "drag_end" at play area (x=472, y=350)
3) If no playable cards, look for "End Turn" button and click it
4) If nothing to do, use "move" to explore UI elements
5) Never output out-of-bounds coords. Stay within [0,944] x [0,590]
6) Never output non-integers or null values

JSON schema:
{
  "reasoning": "brief, one sentence on what you see and why",
  "action": "move" | "click" | "drag_start" | "drag_end",
  "x": <int>,
  "y": <int>
}

Example 1 (drag a glowing card from hand):
{"reasoning":"glowing card in hand at position 420,540, starting drag","action":"drag_start","x":420,"y":540}

Example 2 (complete the drag to play area):
{"reasoning":"completing drag to play the card","action":"drag_end","x":472,"y":350}`;

/**
 * Validate action data against hard limits
 * @param {Object} actionData - Action data from vision model
 * @returns {Object|null} Validation error or null if valid
 */
function validateActionData(actionData) {
    const VALID_ACTIONS = ["move", "click", "drag_start", "drag_end"];
    const MIN_X = 0, MAX_X = 944;
    const MIN_Y = 0, MAX_Y = 590;

    // Check required fields
    if (!actionData.reasoning || typeof actionData.reasoning !== 'string') {
        return { error: "Missing or invalid 'reasoning' field" };
    }
    if (!actionData.action || typeof actionData.action !== 'string') {
        return { error: "Missing or invalid 'action' field" };
    }
    if (typeof actionData.x !== 'number') {
        return { error: "Missing or invalid 'x' field (must be number)" };
    }
    if (typeof actionData.y !== 'number') {
        return { error: "Missing or invalid 'y' field (must be number)" };
    }

    // Validate action type
    if (!VALID_ACTIONS.includes(actionData.action)) {
        return { error: `Invalid action '${actionData.action}'. Must be one of: ${VALID_ACTIONS.join(', ')}` };
    }

    // Validate coordinates are integers
    if (!Number.isInteger(actionData.x)) {
        return { error: `x coordinate must be integer, got ${actionData.x}` };
    }
    if (!Number.isInteger(actionData.y)) {
        return { error: `y coordinate must be integer, got ${actionData.y}` };
    }

    // Validate coordinate bounds
    if (actionData.x < MIN_X || actionData.x > MAX_X) {
        return { error: `x coordinate ${actionData.x} out of bounds [${MIN_X}, ${MAX_X}]` };
    }
    if (actionData.y < MIN_Y || actionData.y > MAX_Y) {
        return { error: `y coordinate ${actionData.y} out of bounds [${MIN_Y}, ${MAX_Y}]` };
    }

    return null; // Valid
}

/**
 * Call vision API with screenshot
 * @param {string} imagePath - Path to screenshot
 * @param {string|null} errorFeedback - Feedback about previous failed attempt
 * @returns {Promise<Object>} API response with action
 */
async function queryVisionModel(imagePath, errorFeedback = null) {
    try {
        // Read and encode image
        const imageBuffer = await fs.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');

        // Build user message
        let userText = "Analyze this game screenshot and decide the next action.";
        if (errorFeedback) {
            userText = `Previous output violated bounds: ${errorFeedback}\n\nReturn valid JSON within limits (x in [0,944], y in [0,590], integers only).`;
            console.log("[VISION_AGENT] Retrying with error feedback:", errorFeedback);
        }

        // vLLM API request
        const requestBody = {
            model: "/model",
            messages: [
                {
                    role: "system",
                    content: SYSTEM_PROMPT
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: userText
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/png;base64,${imageBase64}`
                            }
                        }
                    ]
                }
            ],
            "response_format": {"type": "json_object"},
            temperature: 0.7,
            top_p: 0.9,
            repetition_penalty: 1.1,
            max_tokens: 200
        };

        const response = await fetch(VISION_API, {
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
        const message = data.choices[0].message;
        console.log("[VISION_AGENT] Raw message:", JSON.stringify(message, null, 2));
        const content = message.content;
        console.log("[VISION_AGENT] Content to parse:", content);

        let actionData;
        try {
            actionData = JSON.parse(content);
        } catch (e) {
            console.error("[VISION_AGENT] Failed to parse API response:", data);
            throw new Error("Invalid JSON response from vision API");
        }

        // Validate action data
        const validationError = validateActionData(actionData);
        if (validationError) {
            console.warn("[VISION_AGENT] Validation failed:", validationError.error);

            // Retry once with error feedback
            if (!errorFeedback) {
                console.log("[VISION_AGENT] Retrying with validation feedback...");
                return await queryVisionModel(imagePath, validationError.error);
            } else {
                // Already retried once, fail
                throw new Error(`Validation failed after retry: ${validationError.error}`);
            }
        }

        return actionData;

    } catch (error) {
        console.error("[VISION_AGENT] Vision API query failed:", error.message);
        throw error;
    }
}

/**
 * Execute mouse action using Python script
 * @param {Object} action - Action object from vision model
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

        console.log(`[VISION_AGENT] Executing: ${type} at relative (${x}, ${y}) -> screen (${screenX}, ${screenY})`);

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
    console.log("\n[VISION_AGENT] ========== EVENT #" + eventCount + "/" + MAX_EVENTS + " ==========");
    console.log("[VISION_AGENT] Time:", new Date().toLocaleTimeString());

    try {
        // Capture game window
        console.log("[VISION_AGENT] Capturing game window...");
        const captureResult = await captureGameWindow(TARGET, "[VISION_AGENT]");

        if (!captureResult) {
            console.log("[VISION_AGENT] ✗ Could not capture window, skipping iteration\n");
            return false;
        }

        // Store window bounds for coordinate translation
        gameState.windowBounds = captureResult.bounds;

        // Save screenshot
        const imagePath = `${OUTPUT_DIR}/event_${eventCount}_${Date.now()}.png`;
        await fs.writeFile(imagePath, captureResult.buffer);
        console.log("[VISION_AGENT] ✓ Saved:", imagePath);

        // Extract ROI data for context (optional, helps with debugging)
        console.log("[VISION_AGENT] Extracting ROI data...");
        const roiData = await extractROI(imagePath);
        console.log("[VISION_AGENT] ✓ ROI extracted - Mana:", roiData.rois?.mana?.value || "N/A");

        // Query vision model for next action
        console.log("[VISION_AGENT] Querying vision model...");
        const action = await queryVisionModel(imagePath);

        console.log("[VISION_AGENT] ✓ Vision Model Response:");
        console.log("[VISION_AGENT]   Reasoning:", action.reasoning);
        console.log("[VISION_AGENT]   Action:", action.action);
        console.log("[VISION_AGENT]   Position: (" + action.x + ", " + action.y + ")");

        // Execute action
        console.log("[VISION_AGENT] Executing action...");
        await executeAction(action, captureResult.bounds);
        console.log("[VISION_AGENT] ✓ Action executed");

        // Store last action
        gameState.lastAction = action;

        // Wait a bit for game to respond
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("[VISION_AGENT] ✓ Iteration complete!");
        return true;

    } catch (error) {
        console.error("[VISION_AGENT] ✗ Error:", error.message);
        return false;
    }
}

/**
 * Run agent loop
 */
async function runAgent() {
    console.log("[VISION_AGENT] Starting agent loop in 3 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 3000));

    while (eventCount < MAX_EVENTS) {
        const success = await agentIteration();

        if (!success) {
            console.log("[VISION_AGENT] Iteration failed, waiting before retry...");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Brief pause between iterations
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("\n[VISION_AGENT] ==========================================");
    console.log("[VISION_AGENT] Agent stopped - reached max events:", MAX_EVENTS);
    console.log("[VISION_AGENT] Total events executed:", eventCount);
    console.log("[VISION_AGENT] ==========================================");
}

// Start the agent
runAgent().catch(error => {
    console.error("[VISION_AGENT] Fatal error:", error);
    process.exit(1);
});
