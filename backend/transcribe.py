#!/usr/bin/env python3
"""
Audio transcription service using faster-whisper.
Reads audio from stdin (base64 encoded) and outputs transcription to stdout.
"""

import sys
import base64
import tempfile
import os
from faster_whisper import WhisperModel

def transcribe_audio(audio_base64: str, model_size: str = "base") -> str:
    """
    Transcribe audio from base64 encoded data.

    Args:
        audio_base64: Base64 encoded audio file
        model_size: Whisper model size (tiny, base, small, medium, large-v2, large-v3)

    Returns:
        Transcribed text
    """
    try:
        # Decode base64 audio
        audio_data = base64.b64decode(audio_base64)

        # Write to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name

        try:
            # Initialize model (CPU with int8 for better performance)
            # For GPU: device="cuda", compute_type="float16"
            model = WhisperModel(model_size, device="cpu", compute_type="int8")

            # Transcribe
            segments, info = model.transcribe(temp_path, beam_size=5)

            # Collect all segments
            transcription = " ".join([segment.text for segment in segments])

            return transcription.strip()

        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    except Exception as e:
        print(f"Error during transcription: {str(e)}", file=sys.stderr)
        return ""

if __name__ == "__main__":
    # Read model size from environment or use default
    model_size = os.environ.get("WHISPER_MODEL", "base")

    # Read base64 audio from stdin
    audio_base64 = sys.stdin.read().strip()

    if not audio_base64:
        print("Error: No audio data provided", file=sys.stderr)
        sys.exit(1)

    # Transcribe and output result
    result = transcribe_audio(audio_base64, model_size)
    print(result)
