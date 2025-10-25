import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import ollama from 'ollama';

const app = express();
const port = process.env.PORT || 3001;
const ollamaModel = process.env.OLLAMA_MODEL || 'llama3';
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

      const response = await ollama.chat({
        model: ollamaModel,
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
      });

      const message = Array.isArray(response.message?.content)
        ? response.message.content.map((item) => item.text ?? '').join('\n')
        : response.message?.content ?? '';

      res.json({ message });
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
    const transcription = await ollama.chat({
      model: 'whisper',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              audio: buffer.toString('base64'),
              format: mimetype || 'audio/webm',
            },
          ],
        },
      ],
    });

    const text = transcription.message?.content?.[0]?.text ?? '';
    return text.trim();
  } catch (error) {
    console.error('Transcription failed', error);
    return '';
  }
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
