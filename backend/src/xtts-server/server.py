from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from TTS.api import TTS
import io, os, tempfile

app = FastAPI()
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")

# Default speaker wav - using your custom voice sample
DEFAULT_SPEAKER = "/app/sem-título.wav"

@app.post("/v1/audio/speech")
async def speech(req: Request):
    b = await req.json()
    text = b.get("text","")
    lang = b.get("language","en")
    speaker = b.get("speaker_wav", DEFAULT_SPEAKER)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".wav")
    tts.tts_to_file(text=text, language=lang, speaker_wav=speaker, file_path=tmp.name)
    data = open(tmp.name,"rb").read()
    os.remove(tmp.name)
    return StreamingResponse(io.BytesIO(data), media_type="audio/wav")
