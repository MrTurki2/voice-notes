'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

export default function Live12Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const textEndRef = useRef<HTMLDivElement>(null);

  const CHUNK_INTERVAL = 3000; // Send every 3 seconds

  // Auto scroll to bottom
  useEffect(() => {
    textEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveText]);

  const processChunk = async () => {
    if (audioChunksRef.current.length === 0) {
      console.log('⏭️ No chunks to process');
      return;
    }

    if (isSending) {
      console.log('⏭️ Already sending, skipping this round');
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log('📦 Processing chunk, size:', audioBlob.size, 'bytes');

    if (audioBlob.size < 15000) {
      console.log('⚠️ Chunk too small (need 15KB+), clearing');
      audioChunksRef.current = [];
      return;
    }

    // Copy chunks and clear the buffer for next round
    const chunksToProcess = [...audioChunksRef.current];
    audioChunksRef.current = [];

    try {
      setIsSending(true);

      const audioFile = new File([audioBlob], `recording.webm`, {
        type: 'audio/webm;codecs=opus'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      console.log('🚀 Sending to API...');
      const response = await fetch('/api/transcribe-live', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      console.log('📥 Response:', data);

      if (data.success && data.text && data.text.trim()) {
        console.log('✅ Got text:', data.text);
        setLiveText(prev => {
          const newText = prev ? prev + ' ' + data.text.trim() : data.text.trim();
          return newText;
        });
      } else {
        console.log('⚠️ No text in response');
      }
    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      setIsSending(false);
      console.log('✅ Done processing, ready for next chunk');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setLiveText('');

      // Auto-process every 3 seconds
      intervalRef.current = setInterval(() => {
        processChunk();
      }, CHUNK_INTERVAL);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Process final chunk
      setTimeout(async () => {
        await processChunk();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      }, 500);
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(liveText);
  };

  const clearText = () => {
    if (confirm('مسح النص؟')) {
      setLiveText('');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto">
        {/* Minimal Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">🎤 Live</h1>
          <Link href="/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            ← رجوع
          </Link>
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Recording Button */}
          <div className="flex justify-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center"
              >
                <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                </svg>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={stopRecording}
                  className="w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-2xl transition-all transform hover:scale-110 animate-pulse z-10 relative flex items-center justify-center"
                >
                  <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                  </svg>
                </button>
                <div className="absolute inset-0 bg-red-500 rounded-full opacity-20 animate-ping pointer-events-none"></div>
              </div>
            )}
          </div>

          {/* Status */}
          <div className="text-center">
            {isRecording ? (
              <div className="flex items-center justify-center gap-2 text-red-400 animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-ping"></div>
                <span className="text-xl font-bold">جاري التسجيل...</span>
              </div>
            ) : liveText ? (
              <p className="text-gray-400">تم الإيقاف</p>
            ) : (
              <p className="text-gray-400">اضغط للبدء</p>
            )}
          </div>

          {/* Live Text Display */}
          {liveText && (
            <>
              <div className="bg-gray-900 rounded-2xl p-8 min-h-[400px] max-h-[600px] overflow-y-auto border border-gray-800">
                <p className="text-2xl leading-relaxed text-right whitespace-pre-wrap">
                  {liveText}
                  {isSending && <span className="inline-block animate-pulse ml-2">...</span>}
                </p>
                <div ref={textEndRef} />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={copyText}
                  className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-colors"
                >
                  📋 نسخ
                </button>
                <button
                  onClick={clearText}
                  className="px-8 py-4 bg-gray-800 hover:bg-gray-700 rounded-xl font-bold transition-colors"
                >
                  🗑️ مسح
                </button>
              </div>
            </>
          )}

          {/* Empty State */}
          {!liveText && !isRecording && (
            <div className="text-center py-20 text-gray-500">
              <div className="text-8xl mb-4">🎤</div>
              <p className="text-xl">اضغط المايك وابدأ الكلام</p>
              <p className="text-lg mt-2">سيظهر النص هنا مباشرة</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
