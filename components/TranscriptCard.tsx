import React from 'react';
import { type Transcription } from '../types';

interface TranscriptCardProps {
  transcript: Transcription;
}

const TranscriptCard: React.FC<TranscriptCardProps> = ({ transcript }) => {
  return (
    <div className="bg-gray-700/80 p-4 rounded-lg shadow-md border border-gray-600/50">
      {transcript.from && (
        <p className="text-xs text-gray-400 mb-2 font-mono pb-2 border-b border-gray-600/50">
          Source: <strong>{transcript.from}</strong>
        </p>
      )}
      <p className="text-gray-100 whitespace-pre-wrap">{transcript.text}</p>
    </div>
  );
};

export default TranscriptCard;