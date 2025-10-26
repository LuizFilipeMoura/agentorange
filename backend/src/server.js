import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;
const vllmBaseUrl = process.env.VLLM_BASE_URL || 'http://localhost:8000';
const vllmModel = process.env.VLLM_MODEL || '/model';
const xttsBaseUrl = process.env.XTTS_BASE_URL || 'http://localhost:8020';
const xttsLanguage = process.env.XTTS_LANGUAGE || 'en';

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post(
  '/api/process',
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'files', maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const prompt = req.body?.prompt ?? '';
      const audioFile = req.files?.audio?.[0];
      const attachments = req.files?.files ?? [];

      const contextSections = [];

      if (prompt) {
        contextSections.push(`Prompt:\n${prompt}`);
      }

      if (audioFile) {
        const audioTranscript = await transcribeBuffer(audioFile.buffer, audioFile.mimetype);
        if (audioTranscript) {
          contextSections.push(`Audio transcript (${audioFile.originalname}):\n${audioTranscript}`);
        }
      }

      if (attachments.length > 0) {
        for (const file of attachments) {
          const transcript = await transcribeBuffer(file.buffer, file.mimetype);
          if (transcript) {
            contextSections.push(`Attachment transcript (${file.originalname}):\n${transcript}`);
          }
        }
      }

      if (contextSections.length === 0) {
        return res.status(400).json({ error: 'No prompt, audio, or attachments provided.' });
      }

      const userMessage = contextSections.join('\n\n');

      const vllmResponse = await fetch(`${vllmBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: vllmModel,
          messages: [
            {
              role: 'system',
              content:
                'You are an AI assistant. Use the provided prompt, audio transcription, and attachment summaries to craft your answer.',
            },
            {
              role: 'user',
              content: userMessage,
            },
          ],
        }),
      });

      if (!vllmResponse.ok) {
        throw new Error(`vLLM API error: ${vllmResponse.statusText}`);
      }

      const vllmData = await vllmResponse.json();
      const message = vllmData.choices?.[0]?.message?.content ?? '';

      // Generate audio from the response using XTTS
      let audioBase64 = null;
      try {
        const xttsResponse = await fetch(`${xttsBaseUrl}/v1/audio/speech`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: message,
            language: xttsLanguage,
          }),
        });

        if (xttsResponse.ok) {
          const audioBuffer = await xttsResponse.arrayBuffer();
          audioBase64 = Buffer.from(audioBuffer).toString('base64');
        } else {
          console.error('XTTS API error:', xttsResponse.statusText);
        }
      } catch (xttsError) {
        console.error('Failed to generate audio:', xttsError);
        // Continue without audio if XTTS fails
      }

      res.json({ message, audio: audioBase64 });
    } catch (error) {
      console.error('Failed to process request', error);
      res.status(500).json({ error: 'Failed to process request', details: error.message });
    }
  }
);

async function transcribeBuffer(buffer, mimetype) {
  if (!buffer?.length) {
    return '';
  }

  try {
    // Convert buffer to base64
    const audioBase64 = buffer.toString('base64');

    // Path to Python script
    const scriptPath = path.join(__dirname, '..', 'transcribe.py');

    // Spawn Python process
    const pythonProcess = spawn('python', [scriptPath], {
      env: { ...process.env, WHISPER_MODEL: process.env.WHISPER_MODEL || 'base' }
    });

    let stdout = '';
    let stderr = '';

    // Collect stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    // Collect stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Write base64 audio to stdin and close
    pythonProcess.stdin.write(audioBase64);
    pythonProcess.stdin.end();

    // Wait for process to complete
    return new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error('Transcription failed:', stderr);
          resolve('');
        } else {
          resolve(stdout.trim());
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start transcription process:', error);
        resolve('');
      });
    });
  } catch (error) {
    console.error('Transcription failed', error);
    return '';
  }
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
