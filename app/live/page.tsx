'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface Segment {
  id: number;
  text: string;
  timestamp: string;
  status: 'processing' | 'done';
}

export default function LivePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [currentSegment, setCurrentSegment] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const segmentCounterRef = useRef(0);
  const recordingStartTimeRef = useRef<number>(0);

  const sendAudioForTranscription = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      const audioFile = new File([audioBlob], 'segment.webm', { type: 'audio/webm' });
      formData.append('file', audioFile);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.text.trim()) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        setSegments(prev => [...prev, {
          id: segmentCounterRef.current++,
          text: data.text,
          timestamp,
          status: 'done'
        }]);
      }
    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await sendAudioForTranscription(audioBlob);
        }

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };

      // Request data every 100ms for smooth recording
      mediaRecorder.start(100);
      setIsRecording(true);
      setCurrentSegment('');
    } catch (error) {
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      setCurrentSegment(`تم التسجيل لمدة ${duration} ثانية - جاري التفريغ...`);
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // Auto-update timer
  useEffect(() => {
    if (!isRecording) return;

    const interval = setInterval(() => {
      const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
      setCurrentSegment(`⏱️ جاري التسجيل: ${duration} ثانية`);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold text-gray-800 dark:text-white">
            🔴 تفريغ مباشر (Live)
          </h1>
          <a
            href="/"
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            ← الرئيسية
          </a>
        </div>

        <p className="text-center text-gray-600 dark:text-gray-300 mb-8">
          التفريغ يظهر مباشرة أثناء الكلام (كل 3 ثواني)
        </p>

        {/* Recording Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div className="flex flex-col items-center justify-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                type="button"
                className="w-32 h-32 rounded-full font-bold text-white shadow-lg transition-all transform hover:scale-110 bg-purple-600 hover:bg-purple-700"
              >
                <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                </svg>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={stopRecording}
                  type="button"
                  className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-red-600 hover:bg-red-700 relative z-10 cursor-pointer animate-pulse"
                >
                  <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                  </svg>
                </button>
                <div className="absolute inset-0 bg-red-500 rounded-full opacity-30 animate-ping pointer-events-none" style={{ animationDuration: '1.5s' }} />
              </div>
            )}

            <p className="text-center text-gray-700 dark:text-gray-300 font-semibold mt-6">
              {isRecording ? '🔴 جاري التسجيل المباشر...' : 'اضغط لبدء التسجيل المباشر'}
            </p>
            {isRecording && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                اضغط على الزر الأحمر للإيقاف
              </p>
            )}
          </div>
        </div>

        {/* Live Transcript Display */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              📝 سجل التفريغ
            </h2>
            {segments.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const allText = segments.map(s => s.text).join(' ');
                    navigator.clipboard.writeText(allText);
                    alert('تم نسخ النص!');
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                >
                  📋 نسخ الكل
                </button>
                <button
                  onClick={() => {
                    setSegments([]);
                    setCurrentSegment('');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                >
                  🗑️ مسح
                </button>
              </div>
            )}
          </div>

          {/* Current Recording Status */}
          {(isRecording || isProcessing || currentSegment) && (
            <div className="mb-4 p-4 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg border-l-4 border-purple-500">
              <div className="flex items-center gap-3">
                {isRecording && (
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                )}
                {isProcessing && (
                  <div className="w-6 h-6 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
                )}
                <p className="text-gray-800 dark:text-white font-semibold">
                  {currentSegment || '⏱️ جاري التسجيل...'}
                </p>
              </div>
            </div>
          )}

          {/* Segments List */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {segments.length === 0 && !isRecording ? (
              <div className="flex items-center justify-center h-40">
                <p className="text-gray-400 dark:text-gray-500 text-lg">
                  ابدأ التسجيل لرؤية النص هنا...
                </p>
              </div>
            ) : (
              segments.map((segment) => (
                <div
                  key={segment.id}
                  className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-700 dark:to-gray-600 rounded-lg border-r-4 border-purple-500 transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-gray-800 dark:text-white text-lg leading-relaxed flex-1 text-right">
                      {segment.text}
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                        {segment.timestamp}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(segment.text);
                          alert('تم النسخ!');
                        }}
                        className="text-xs text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
                      >
                        📋 نسخ
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
