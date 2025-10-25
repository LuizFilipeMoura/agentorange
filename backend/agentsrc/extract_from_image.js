// extract_from_image.js - Extract ROI data from a screenshot
import fs from 'fs/promises';
import { extractROI, printROISummary } from './helpers.js';

console.log("[EXTRACT] ==========================================");
console.log("[EXTRACT] ROI Extraction Tool");
console.log("[EXTRACT] ==========================================\n");

const imagePath = process.argv[2];

if (!imagePath) {
    console.error("[EXTRACT] ERROR: No image path provided");
    console.error("\nUsage: node extract_from_image.js <image_path>");
    console.error("Example: node extract_from_image.js ./screenshots/capture_1_123456.png");
    process.exit(1);
}

// Check if file exists
try {
    await fs.access(imagePath);
} catch (error) {
    console.error("[EXTRACT] ERROR: Image not found:", imagePath);
    process.exit(1);
}

// Extract ROI
try {
    console.log("[EXTRACT] Processing:", imagePath);
    const roiData = await extractROI(imagePath);
    console.log("[EXTRACT] ✓ Extraction successful");

    printROISummary(roiData);

} catch (error) {
    console.error("[EXTRACT] ✗ Extraction failed:", error.message);
    process.exit(1);
}
