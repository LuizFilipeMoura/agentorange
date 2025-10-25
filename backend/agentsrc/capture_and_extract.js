// capture_and_extract.js - Continuously capture game window and extract ROI data
import fs from 'fs/promises';
import {
    captureGameWindow,
    extractROI,
    printROISummary
} from './helpers.js';

const TARGET = "Warpforge";
const INTERVAL = 5000;
const SAVE_SCREENSHOTS = true;
const OUTPUT_DIR = './screenshots';

console.log("[CAPTURE_EXTRACT] ==========================================");
console.log("[CAPTURE_EXTRACT] Starting game capture & ROI extraction");
console.log("[CAPTURE_EXTRACT] Target window:", TARGET);
console.log("[CAPTURE_EXTRACT] Capture interval:", INTERVAL, "ms");
console.log("[CAPTURE_EXTRACT] Save screenshots:", SAVE_SCREENSHOTS);
console.log("[CAPTURE_EXTRACT] ==========================================\n");

if (SAVE_SCREENSHOTS) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

let captureCount = 0;

async function captureAndProcess() {
    captureCount++;
    console.log("\n[CAPTURE_EXTRACT] ========== CYCLE #" + captureCount + " ==========");
    console.log("[CAPTURE_EXTRACT] Time:", new Date().toLocaleTimeString());

    const result = await captureGameWindow(TARGET, "[CAPTURE_EXTRACT]");
    if (!result) {
        console.log();
        return;
    }

    // Save screenshot
    let savedPath = null;
    if (SAVE_SCREENSHOTS) {
        savedPath = `${OUTPUT_DIR}/capture_${captureCount}_${Date.now()}.png`;
        await fs.writeFile(savedPath, result.buffer);
        console.log("[CAPTURE_EXTRACT] ✓ Saved:", savedPath);
    }

    // Extract ROI
    if (savedPath) {
        console.log("[CAPTURE_EXTRACT] Extracting ROI data...");
        const roiData = await extractROI(savedPath);
        console.log("[CAPTURE_EXTRACT] ✓ Extraction complete");

        printROISummary(roiData);
    }

    console.log("\n[CAPTURE_EXTRACT] ✓ Cycle complete!");
}

// Start
console.log("[CAPTURE_EXTRACT] Starting in 2 seconds...\n");
setTimeout(async () => {
    await captureAndProcess();
    setInterval(captureAndProcess, INTERVAL);
}, 2000);
