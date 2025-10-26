import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { useGeminiLive } from './hooks/useGeminiLive';
import { type Transcription } from './types';
import { MicIcon, StopIcon, LoadingIcon, UploadIcon } from './components/Icons';
import TranscriptCard from './components/TranscriptCard';

const App: React.FC = () => {
  const [transcripts, setTranscripts] = useState<Transcription[]>([]);
  const [currentTranscription, setCurrentTranscription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'live' | 'file'>('live');
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleTranscriptionUpdate = useCallback((text: string) => {
    setCurrentTranscription(text);
  }, []);

  const handleTranscriptionComplete = useCallback((text: string) => {
    if (text.trim()) {
      setTranscripts(prev => [...prev, { id: Date.now(), text, from: 'Live Recording' }]);
    }
    setCurrentTranscription('');
  }, []);

  const handleError = useCallback((err: string) => {
    setError(err);
  }, []);

  const { isRecording, isInitializing, start, stop } = useGeminiLive({
    onTranscriptionUpdate: handleTranscriptionUpdate,
    onTranscriptionComplete: handleTranscriptionComplete,
    onError: handleError
  });

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts, currentTranscription]);

  const toggleRecording = () => {
    setError(null);
    if (isRecording) {
      stop();
    } else {
      start();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setIsProcessingFile(true);

      try {
        if (!process.env.API_KEY) {
          throw new Error("API_KEY environment variable not set.");
        }
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const toBase64 = (file: File) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = error => reject(error);
        });

        const base64Data = await toBase64(file);
        
        const audioPart = {
          inlineData: {
            mimeType: file.type,
            data: base64Data,
          },
        };

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts: [audioPart, {text: "Transcribe this audio file."}] },
        });

        const transcriptionText = response.text;
        if (transcriptionText.trim()) {
            setTranscripts(prev => [...prev, { id: Date.now(), text: transcriptionText, from: file.name }]);
        }

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during file transcription.';
        console.error('File transcription error:', errorMessage);
        setError(errorMessage);
      } finally {
        setIsProcessingFile(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
      }
    };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl h-[90vh] flex flex-col bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
        <header className="p-6 border-b border-gray-700 text-center">
          <h1 className="text-3xl font-bold text-white">Audio Transcription</h1>
          <p className="text-gray-400 mt-2">Use Gemini to transcribe your audio in real-time or from a file.</p>
        </header>
        
        <main ref={transcriptContainerRef} className="flex-grow p-6 overflow-y-auto space-y-4">
          {transcripts.map(t => <TranscriptCard key={t.id} transcript={t} />)}
          {currentTranscription && (
            <div className="p-4 bg-gray-700/50 rounded-lg animate-pulse">
                <p className="text-gray-300 italic">{currentTranscription}</p>
            </div>
          )}
          {!isRecording && transcripts.length === 0 && (
             <div className="flex flex-col items-center justify-center h-full text-gray-500">
                {mode === 'live' ? (
                  <>
                    <MicIcon className="w-16 h-16 mb-4" />
                    <p className="text-lg">Press the button to start transcribing</p>
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-16 h-16 mb-4" />
                    <p className="text-lg">Upload an audio file to transcribe it</p>
                  </>
                )}
             </div>
          )}
        </main>

        {error && (
            <div className="p-4 bg-red-900/50 text-red-300 text-center">
                <p><strong>Error:</strong> {error}</p>
            </div>
        )}

        <footer className="p-6 border-t border-gray-700 flex flex-col items-center justify-center">
            <div className="flex justify-center mb-6">
                <div className="flex p-1 bg-gray-700 rounded-full">
                    <button onClick={() => setMode('live')} className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${mode === 'live' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-600'}`}>
                        Live
                    </button>
                    <button onClick={() => setMode('file')} className={`px-6 py-2 rounded-full text-sm font-semibold transition-colors ${mode === 'file' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-600'}`}>
                        File Upload
                    </button>
                </div>
            </div>

            {mode === 'live' ? (
              <>
                <button
                    onClick={toggleRecording}
                    disabled={isInitializing}
                    className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: isRecording ? 'radial-gradient(circle, #EF4444, #B91C1C)' : 'radial-gradient(circle, #3B82F6, #1D4ED8)',
                      boxShadow: isRecording ? '0 0 20px #EF4444' : '0 0 20px #3B82F6'
                    }}
                >
                    {isInitializing ? (
                        <LoadingIcon className="w-10 h-10" />
                    ) : isRecording ? (
                        <StopIcon className="w-10 h-10 text-white" />
                    ) : (
                        <MicIcon className="w-10 h-10 text-white" />
                    )}
                </button>
                <p className="text-gray-400 mt-4 h-5">
                  {isInitializing ? 'Initializing...' : isRecording ? 'Recording... click to stop' : 'Click to start recording'}
                </p>
              </>
            ) : (
              <>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="audio/*" className="hidden" />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFile}
                    className="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'radial-gradient(circle, #22C55E, #15803D)',
                      boxShadow: '0 0 20px #22C55E'
                    }}
                >
                    {isProcessingFile ? <LoadingIcon className="w-10 h-10" /> : <UploadIcon className="w-10 h-10 text-white" />}
                </button>
                <p className="text-gray-400 mt-4 h-5">
                  {isProcessingFile ? 'Processing file...' : 'Click to upload an audio file'}
                </p>
              </>
            )}
        </footer>
      </div>
    </div>
  );
};

export default App;