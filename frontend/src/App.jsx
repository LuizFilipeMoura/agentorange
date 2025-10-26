import React, { useEffect, useMemo, useState } from 'react';
import AudioRecorder from './components/AudioRecorder.jsx';
import MessageBubble from './components/MessageBubble.jsx';

const initialState = {
  prompt: '',
  files: [],
  response: null,
  responseAudio: null,
  loading: false,
  error: null,
};

function App() {
  const [state, setState] = useState(initialState);
  const [recording, setRecording] = useState(null);
  const [responseAudioUrl, setResponseAudioUrl] = useState(null);

  const fileNames = useMemo(() => state.files.map((file) => file.name).join(', '), [state.files]);

  // Convert base64 audio to blob URL
  useEffect(() => {
    if (state.responseAudio) {
      try {
        const binaryString = atob(state.responseAudio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        setResponseAudioUrl(url);

        return () => {
          URL.revokeObjectURL(url);
        };
      } catch (error) {
        console.error('Failed to convert audio:', error);
      }
    } else {
      setResponseAudioUrl(null);
    }
  }, [state.responseAudio]);

  const handlePromptChange = (event) => {
    setState((prev) => ({ ...prev, prompt: event.target.value }));
  };

  const handleFileChange = (event) => {
    setState((prev) => ({ ...prev, files: Array.from(event.target.files ?? []) }));
  };

  const handleClearFiles = () => {
    setState((prev) => ({ ...prev, files: [] }));
    // Reset the file input
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleClearRecording = () => {
    setRecording(null);
  };

  const handleRecordingComplete = (blob) => {
    setRecording(blob);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!state.prompt && !recording && state.files.length === 0) {
      setState((prev) => ({ ...prev, error: 'Provide a prompt, audio, or attachments to continue.' }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, response: null, error: null }));

    const formData = new FormData();
    if (state.prompt) {
      formData.append('prompt', state.prompt);
    }

    console.log("recording",recording);
    if (recording) {
      formData.append('audio', recording, 'recording.webm');
    }

    state.files.forEach((file) => {
      formData.append('files', file, file.name);
    });

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Failed to process request');
      }

      const data = await response.json();
      setState((prev) => ({
        ...prev,
        response: data.message,
        responseAudio: data.audio,
        loading: false
      }));
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message }));
    }
  };

  const handleReset = () => {
    setState(initialState);
    setRecording(null);
  };

  return (
    <div className="app">
      <header className="app__header">
        <h1>Ollama Assistant</h1>
        <p>Prompt the assistant with text, audio recordings, and supporting files.</p>
      </header>

      <main className="app__content">
        <form className="app__form" onSubmit={handleSubmit}>
          <label className="app__label" htmlFor="prompt">
            Prompt
          </label>
          <textarea
            id="prompt"
            className="app__textarea"
            placeholder="Enter your question or instructions..."
            value={state.prompt}
            onChange={handlePromptChange}
            rows={5}
          />

          <label className="app__label" htmlFor="file-input">
            Attach files (optional)
          </label>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input id="file-input" className="app__file-input" type="file" multiple onChange={handleFileChange} />
            {state.files.length > 0 && (
              <button type="button" className="app__button app__button--secondary" onClick={handleClearFiles}>
                Clear Files
              </button>
            )}
          </div>
          {fileNames && <p className="app__file-list">Selected: {fileNames}</p>}

          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            recording={recording}
            onClearRecording={handleClearRecording}
          />

          <div className="app__actions">
            <button className="app__button" type="submit" disabled={state.loading}>
              {state.loading ? 'Processing…' : 'Send to Assistant'}
            </button>
            <button className="app__button app__button--secondary" type="button" onClick={handleReset}>
              Clear
            </button>
          </div>
        </form>

        <section className="app__response">
          <h2>Response</h2>
          {state.loading && <p>Waiting for the assistant…</p>}
          {state.error && <p className="app__error">{state.error}</p>}
          {state.response && <MessageBubble message={state.response} />}
          {responseAudioUrl && (
            <div style={{ marginTop: '15px' }}>
              <p style={{ fontSize: '14px', marginBottom: '5px', fontWeight: '500' }}>Audio Response:</p>
              <audio controls src={responseAudioUrl} style={{ width: '100%', maxWidth: '500px' }} autoPlay />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
