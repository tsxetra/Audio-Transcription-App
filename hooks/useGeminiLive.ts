import { useState, useRef, useCallback } from 'react';
import { GoogleGenAI, type LiveSession, LiveServerMessage, Modality, type Blob } from "@google/genai";
import { encode } from '../utils/audioUtils';

interface UseGeminiLiveProps {
  onTranscriptionUpdate: (text: string) => void;
  onTranscriptionComplete: (text: string) => void;
  onError: (error: string) => void;
}

export const useGeminiLive = ({
  onTranscriptionUpdate,
  onTranscriptionComplete,
  onError,
}: UseGeminiLiveProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const currentInputTranscriptionRef = useRef('');

  const stopAudioProcessing = useCallback(() => {
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
  }, []);
  
  const stop = useCallback(async () => {
    if (!sessionPromiseRef.current) return;

    setIsRecording(false);
    
    try {
        const session = await sessionPromiseRef.current;
        session.close();
    } catch (e) {
        console.error("Error closing session:", e);
        onError("Failed to close the connection properly.");
    } finally {
        sessionPromiseRef.current = null;
        stopAudioProcessing();
        if(currentInputTranscriptionRef.current) {
            onTranscriptionComplete(currentInputTranscriptionRef.current);
            currentInputTranscriptionRef.current = '';
        }
    }
  }, [onError, stopAudioProcessing, onTranscriptionComplete]);


  const start = useCallback(async () => {
    setIsInitializing(true);
    try {
      if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // We use `any` for `webkitAudioContext` to support older browsers.
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            if (!mediaStreamRef.current || !audioContextRef.current) return;
            
            const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current.destination);
            
            setIsInitializing(false);
            setIsRecording(true);
          },
          onmessage: (message: LiveServerMessage) => {
            if(message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscriptionRef.current += text;
              onTranscriptionUpdate(currentInputTranscriptionRef.current);
            }
            if (message.serverContent?.turnComplete) {
              const fullTranscription = currentInputTranscriptionRef.current;
              currentInputTranscriptionRef.current = '';
              onTranscriptionComplete(fullTranscription);
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Gemini Live API Error:', e);
            onError(`Connection error: ${e.message}`);
            setIsRecording(false);
            setIsInitializing(false);
            stopAudioProcessing();
          },
          onclose: () => {
             // This is called when the session is closed, either by us or the server.
             // We don't need to call stop() here again to avoid loops.
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
        }
      });

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      console.error('Failed to start recording:', errorMessage);
      onError(errorMessage);
      setIsInitializing(false);
      setIsRecording(false);
      stopAudioProcessing();
    }
  }, [onError, onTranscriptionUpdate, onTranscriptionComplete, stopAudioProcessing]);
  
  return { isRecording, isInitializing, start, stop };
};

function createPcmBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
}