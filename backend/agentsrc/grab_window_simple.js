// grab_window_simple.js - Captures game window and parses HUD with Python
import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import activeWin from 'active-win';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET = "Warpforge";
const INTERVAL = 5000;
const CAPTURE_TIMEOUT = 10000;
const SAVE_SCREENSHOTS = true; // Save to disk for debugging
const OUTPUT_DIR = './screenshots';
const EXTRACT_ROI = true; // Enable ROI extraction with Python
const PYTHON_SCRIPT = join(__dirname, 'extract_roi.py');

// ROI definitions are now in extract_roi.py

console.log("[GRAB_SIMPLE] ==========================================");
console.log("[GRAB_SIMPLE] Starting game capture system");
console.log("[GRAB_SIMPLE] Target window:", TARGET);
console.log("[GRAB_SIMPLE] Capture interval:", INTERVAL, "ms");
console.log("[GRAB_SIMPLE] ROI extraction:", EXTRACT_ROI ? "ENABLED (see extract_roi.py for ROI definitions)" : "DISABLED");
console.log("[GRAB_SIMPLE] ==========================================\n");

// Create output directory if saving screenshots
if (SAVE_SCREENSHOTS) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log("[GRAB_SIMPLE] Screenshots will be saved to:", OUTPUT_DIR, "\n");
}

let captureCount = 0;

async function findTargetWindow() {
    try {
        const activeWindow = await activeWin();

        if (!activeWindow) {
            console.log("[GRAB_SIMPLE] No active window found");
            return null;
        }

        console.log("[GRAB_SIMPLE] Active window:", activeWindow.title);

        const isTarget = activeWindow.title?.includes(TARGET) ||
                        activeWindow.owner?.name?.includes(TARGET);

        if (isTarget) {
            console.log("[GRAB_SIMPLE] ✓ Target window is active!");
            return activeWindow;
        } else {
            console.log("[GRAB_SIMPLE] ✗ Target window not active");
            return null;
        }
    } catch (error) {
        console.error("[GRAB_SIMPLE] Error finding window:", error.message);
        return null;
    }
}

async function extractROI(imagePath) {
    console.log("[GRAB_SIMPLE] Calling Python ROI extractor...");
    console.log("[GRAB_SIMPLE] Image:", imagePath);

    return new Promise((resolve, reject) => {
        const args = [PYTHON_SCRIPT, imagePath];

        console.log("[GRAB_SIMPLE] Command:", 'python', args.join(' '));

        const python = spawn('python', args);

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (stderr) {
                console.log("[GRAB_SIMPLE] Python stderr:", stderr.trim());
            }

            if (code !== 0) {
                reject(new Error(`Python script exited with code ${code}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                console.log("[GRAB_SIMPLE] ✓ ROI extracted successfully");
                resolve(result);
            } catch (error) {
                reject(new Error(`Failed to parse Python output: ${error.message}`));
            }
        });

        python.on('error', (error) => {
            reject(new Error(`Failed to spawn Python: ${error.message}`));
        });
    });
}

async function captureAndProcess() {
    captureCount++;
    console.log("\n[GRAB_SIMPLE] ========== CAPTURE #" + captureCount + " ==========");
    console.log("[GRAB_SIMPLE] Time:", new Date().toLocaleTimeString());

    try {
        // Check window
        const targetWindow = await findTargetWindow();
        if (!targetWindow) {
            console.log("[GRAB_SIMPLE] Skipping - target not active\n");
            return;
        }

        // Get window bounds
        const bounds = targetWindow.bounds;
        console.log("[GRAB_SIMPLE] Window bounds:", JSON.stringify(bounds));
        console.log("[GRAB_SIMPLE] Position: x=" + bounds.x + ", y=" + bounds.y);
        console.log("[GRAB_SIMPLE] Size: " + bounds.width + "x" + bounds.height);

        // Capture with timeout
        console.log("[GRAB_SIMPLE] Capturing screenshot...");
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Screenshot timeout')), CAPTURE_TIMEOUT);
        });

        const imgBuffer = await Promise.race([
            screenshot({ format: 'png' }),
            timeoutPromise
        ]);

        console.log("[GRAB_SIMPLE] ✓ Full screen captured:", imgBuffer.length, "bytes");

        // Get full screen metadata
        const metadata = await sharp(imgBuffer).metadata();
        console.log("[GRAB_SIMPLE] Full screen size:", metadata.width, "x", metadata.height);

        // Validate bounds are within screen
        const x = Math.max(0, bounds.x);
        const y = Math.max(0, bounds.y);
        const width = Math.min(bounds.width, metadata.width - x);
        const height = Math.min(bounds.height, metadata.height - y);

        if (width <= 0 || height <= 0) {
            throw new Error('Invalid window bounds: window may be off-screen');
        }

        console.log("[GRAB_SIMPLE] Cropping to game window...");
        console.log("[GRAB_SIMPLE] Crop region: x=" + x + ", y=" + y + ", w=" + width + ", h=" + height);

        // Crop to game window and process
        const processed = await sharp(imgBuffer)
            .extract({ left: x, top: y, width: width, height: height })
            .png()
            .toBuffer();

        console.log("[GRAB_SIMPLE] ✓ Cropped to game window:", processed.length, "bytes");

        // Save screenshot
        let savedPath = null;
        if (SAVE_SCREENSHOTS) {
            savedPath = `${OUTPUT_DIR}/capture_${captureCount}_${Date.now()}.png`;
            await fs.writeFile(savedPath, processed);
            console.log("[GRAB_SIMPLE] ✓ Saved to:", savedPath);
        }

        // Extract ROI with Python
        let roiData = null;
        if (EXTRACT_ROI && savedPath) {
            try {
                roiData = await extractROI(savedPath);

                console.log("\n[GRAB_SIMPLE] ==================== ROI DATA ====================");
                console.log(JSON.stringify(roiData, null, 2));
                console.log("[GRAB_SIMPLE] ====================================================");
            } catch (error) {
                console.error("[GRAB_SIMPLE] ✗ ROI extraction failed:", error.message);
            }
        }

        console.log("[GRAB_SIMPLE] ✓ Capture cycle complete!");

    } catch (error) {
        console.error("[GRAB_SIMPLE] ✗ Error:", error.message);
    }

    console.log();
}

// Start
console.log("[GRAB_SIMPLE] Starting in 2 seconds...\n");

setTimeout(async () => {
    console.log("[GRAB_SIMPLE] First capture starting...\n");

    await captureAndProcess();

    console.log("[GRAB_SIMPLE] Setting up interval...\n");
    setInterval(captureAndProcess, INTERVAL);
}, 2000);
