// helpers.js - Shared functionality for game capture and ROI extraction
import screenshot from 'screenshot-desktop';
import sharp from 'sharp';
import activeWin from 'active-win';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PYTHON_SCRIPT = join(__dirname, 'extract_roi.py');

/**
 * Find and check if target window is active
 * @param {string} targetName - Name or partial name of window to find
 * @returns {Promise<Object|null>} Window info or null if not found/active
 */
export async function findTargetWindow(targetName) {
    try {
        const activeWindow = await activeWin();

        if (!activeWindow) {
            return null;
        }

        const isTarget = activeWindow.title?.includes(targetName) ||
                        activeWindow.owner?.name?.includes(targetName);

        return isTarget ? activeWindow : null;
    } catch (error) {
        console.error("Error finding window:", error.message);
        return null;
    }
}

/**
 * Capture full screen screenshot with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Buffer>} Screenshot buffer
 */
export async function captureScreenshot(timeout = 10000) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Screenshot timeout')), timeout);
    });

    return Promise.race([
        screenshot({ format: 'png' }),
        timeoutPromise
    ]);
}

/**
 * Process image buffer with sharp (get metadata)
 * @param {Buffer} imgBuffer - Image buffer
 * @returns {Promise<{buffer: Buffer, metadata: Object}>}
 */
export async function processImage(imgBuffer) {
    const metadata = await sharp(imgBuffer).metadata();
    const processed = await sharp(imgBuffer).png().toBuffer();
    return { buffer: processed, metadata };
}

/**
 * Crop image to window bounds
 * @param {Buffer} imgBuffer - Full screen image buffer
 * @param {Object} bounds - Window bounds {x, y, width, height}
 * @param {Object} metadata - Image metadata {width, height}
 * @returns {Promise<Buffer>} Cropped image buffer
 */
export async function cropToWindow(imgBuffer, bounds, metadata) {
    // Validate bounds are within screen
    const x = Math.max(0, bounds.x);
    const y = Math.max(0, bounds.y);
    const width = Math.min(bounds.width, metadata.width - x);
    const height = Math.min(bounds.height, metadata.height - y);

    if (width <= 0 || height <= 0) {
        throw new Error('Invalid window bounds: window may be off-screen');
    }

    return sharp(imgBuffer)
        .extract({ left: x, top: y, width, height })
        .png()
        .toBuffer();
}

/**
 * Extract ROI data from image using Python script
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Object>} ROI data
 */
export async function extractROI(imagePath) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [PYTHON_SCRIPT, imagePath]);

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
                reject(new Error(`Python script exited with code ${code}\n${stderr}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);
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

/**
 * Capture game window screenshot (common flow)
 * @param {string} targetName - Name of window to capture
 * @param {string} logPrefix - Prefix for console logs
 * @returns {Promise<Object|null>} Capture result or null if failed
 */
export async function captureGameWindow(targetName, logPrefix = "[CAPTURE]") {
    try {
        // Find target window
        const targetWindow = await findTargetWindow(targetName);
        if (!targetWindow) {
            console.log(logPrefix, "✗ Target window not active");
            return null;
        }

        console.log(logPrefix, "✓ Target window:", targetWindow.title);
        const bounds = targetWindow.bounds;
        console.log(logPrefix, "Bounds: x=" + bounds.x + ", y=" + bounds.y +
                   ", w=" + bounds.width + ", h=" + bounds.height);

        // Capture screenshot
        console.log(logPrefix, "Capturing...");
        const imgBuffer = await captureScreenshot();
        console.log(logPrefix, "✓ Captured:", imgBuffer.length, "bytes");

        // Process image
        const { buffer: processedBuffer, metadata } = await processImage(imgBuffer);
        console.log(logPrefix, "Screen size:", metadata.width + "x" + metadata.height);

        // Crop to window
        const croppedBuffer = await cropToWindow(processedBuffer, bounds, metadata);
        console.log(logPrefix, "✓ Cropped to game window");

        return {
            buffer: croppedBuffer,
            window: targetWindow,
            bounds: bounds
        };
    } catch (error) {
        console.error(logPrefix, "✗ Error:", error.message);
        return null;
    }
}

/**
 * Print ROI data summary to console
 * @param {Object} roiData - ROI extraction result
 */
export function printROISummary(roiData) {
    console.log("\n==================== ROI DATA ====================");
    console.log(JSON.stringify(roiData, null, 2));
    console.log("====================================================");

    // Show summary
    if (roiData.rois) {
        console.log("\nSummary:");
        for (const [name, data] of Object.entries(roiData.rois)) {
            if (name === 'playable_cards' || name === 'playable_card_count') continue;
            console.log(`  ${name}: ${data.value || 'N/A'}`);
        }
        if (roiData.rois.playable_card_count !== undefined) {
            console.log(`  playable_cards: ${roiData.rois.playable_card_count}`);
        }
    }

    if (roiData.debug_dir) {
        console.log("\nDebug folder:", roiData.debug_dir);
    }
}
