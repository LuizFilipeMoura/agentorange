import React, { useEffect, useRef, useState } from 'react';

const recordingMimeType = 'audio/webm';

function AudioRecorder({ onRecordingComplete }) {
  const mediaRecorderRef = useRef(null);
  const [chunks, setChunks] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setIsSupported(false);
    }
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: recordingMimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setChunks((prev) => [...prev, event.data]);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recordingMimeType });
        chunksRef.current = [];
        setChunks([]);
        setIsRecording(false);
        if (blob.size > 0) {
          onRecordingComplete?.(blob);
        }
        stream.getTracks().forEach((track) => track.stop());
      };

      chunksRef.current = [];
      setChunks([]);
      setIsRecording(true);
      recorder.start();
    } catch (error) {
      console.error('Unable to start audio recording', error);
      setIsSupported(false);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const chunksRef = useRef([]);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  return (
    <div className="recorder">
      <p className="recorder__label">Audio Recording (optional)</p>
      {!isSupported && <p className="recorder__error">Audio recording is not supported in this browser.</p>}
      <div className="recorder__controls">
        <button
          type="button"
          className="app__button"
          onClick={startRecording}
          disabled={!isSupported || isRecording}
        >
          {isRecording ? 'Recording…' : 'Start Recording'}
        </button>
        <button type="button" className="app__button app__button--secondary" onClick={stopRecording} disabled={!isRecording}>
          Stop
        </button>
      </div>
    </div>
  );
}

export default AudioRecorder;
