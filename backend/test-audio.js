import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testAudioAPI() {
  console.log('🎵 Starting audio API test...\n');

  try {
    // Path to the audio file
    const audioPath = path.join(__dirname, 'sem-título.mp3');

    // Check if file exists
    if (!fs.existsSync(audioPath)) {
      console.error('❌ Audio file not found at:', audioPath);
      return;
    }

    console.log('📁 Reading audio file:', audioPath);
    const audioStats = fs.statSync(audioPath);
    console.log('📊 File size:', (audioStats.size / 1024).toFixed(2), 'KB\n');

    // Create form data
    const formData = new FormData();
    formData.append('audio', fs.createReadStream(audioPath), {
      filename: 'sem-título.mp3',
      contentType: 'audio/mpeg'
    });

    // Optional: add a prompt
    // formData.append('prompt', 'What is being said in this audio?');

    console.log('🚀 Sending request to http://localhost:3001/api/process...\n');

    // Send request using http module with form-data
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/process',
        method: 'POST',
        headers: formData.getHeaders()
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            data: data
          });
        });
      });

      req.on('error', reject);
      formData.pipe(req);
    });

    console.log('📥 Response status:', response.status, response.statusText, '\n');

    if (response.status !== 200) {
      console.error('❌ Request failed:', response.data);
      return;
    }

    const data = JSON.parse(response.data);

    console.log('✅ SUCCESS! Response from LLM:\n');
    console.log('─'.repeat(60));
    console.log(data.message);
    console.log('─'.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause.message);
    }
  }
}

// Run the test
testAudioAPI();
