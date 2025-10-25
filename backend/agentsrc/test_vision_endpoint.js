// test_vision_endpoint.js - Test vision endpoint with file path
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VISION_API = "http://localhost:8000/v1/chat/completions";
const IMAGE_PATH = process.argv[2] || "./screenshots/capture_2_1761417944192.png";

console.log("[TEST_VISION] ==========================================");
console.log("[TEST_VISION] Testing Vision Endpoint");
console.log("[TEST_VISION] Endpoint:", VISION_API);
console.log("[TEST_VISION] Image:", IMAGE_PATH);
console.log("[TEST_VISION] ==========================================\n");

// Usage info
if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log("Usage: node test_vision_endpoint.js [image_path]");
    console.log("\nExamples:");
    console.log("  node test_vision_endpoint.js");
    console.log("  node test_vision_endpoint.js ./screenshots/capture_1_123456.png");
    process.exit(0);
}

async function testVisionEndpoint() {
    try {
        // Read and encode image
        console.log("[TEST_VISION] Reading image...");
        const imageBuffer = await fs.readFile(IMAGE_PATH);
        const imageBase64 = imageBuffer.toString('base64');
        console.log("[TEST_VISION] ✓ Image encoded to base64 (" + imageBase64.length + " chars)");

        // Prepare request
        const requestBody = {
            model: "/model",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Analyze this game screenshot and provide definitions of all the UI elements, game components, and cards you can see. Be specific about their locations and what they represent."
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

        // Send request
        console.log("[TEST_VISION] Sending request to vision endpoint...");
        const startTime = Date.now();

        const response = await fetch(VISION_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const elapsed = Date.now() - startTime;

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Vision API error: ${response.status} ${response.statusText}\n${errorText}`);
        }

        // Parse response
        const data = await response.json();
        console.log("[TEST_VISION] ✓ Response received in " + elapsed + "ms\n");

        // Display response
        console.log("==================== RESPONSE ====================");

        if (data.choices && data.choices.length > 0) {
            const message = data.choices[0].message;
            console.log("Role:", message.role);
            console.log("\nContent:");
            console.log(message.content);

            if (data.usage) {
                console.log("\n--- Usage ---");
                console.log("Prompt tokens:", data.usage.prompt_tokens);
                console.log("Completion tokens:", data.usage.completion_tokens);
                console.log("Total tokens:", data.usage.total_tokens);
            }
        } else {
            console.log("Full response:", JSON.stringify(data, null, 2));
        }

        console.log("===================================================\n");

        console.log("[TEST_VISION] ✓ Test complete!");

    } catch (error) {
        console.error("[TEST_VISION] ✗ Error:", error.message);
        if (error.cause) {
            console.error("[TEST_VISION] Cause:", error.cause);
        }
        process.exit(1);
    }
}

// Run test
testVisionEndpoint();
