// capture_game.js - Captures game window screenshots
import fs from 'fs/promises';
import { captureGameWindow } from './helpers.js';

const TARGET = "Warpforge";
const INTERVAL = 5000;
const OUTPUT_DIR = './screenshots';

console.log("[CAPTURE] ==========================================");
console.log("[CAPTURE] Starting game screenshot capture");
console.log("[CAPTURE] Target window:", TARGET);
console.log("[CAPTURE] Capture interval:", INTERVAL, "ms");
console.log("[CAPTURE] Output directory:", OUTPUT_DIR);
console.log("[CAPTURE] ==========================================\n");

await fs.mkdir(OUTPUT_DIR, { recursive: true });

let captureCount = 0;

async function capture() {
    captureCount++;
    console.log("\n[CAPTURE] ========== CAPTURE #" + captureCount + " ==========");
    console.log("[CAPTURE] Time:", new Date().toLocaleTimeString());

    const result = await captureGameWindow(TARGET, "[CAPTURE]");
    if (!result) {
        console.log();
        return null;
    }

    // Save
    const filename = `${OUTPUT_DIR}/capture_${captureCount}_${Date.now()}.png`;
    await fs.writeFile(filename, result.buffer);
    console.log("[CAPTURE] ✓ Saved:", filename);

    return { filename, captureNumber: captureCount, timestamp: Date.now() };
}

// Start
console.log("[CAPTURE] Starting in 2 seconds...\n");
setTimeout(async () => {
    await capture();
    setInterval(capture, INTERVAL);
}, 2000);
