'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

interface TranscriptSegment {
  id: number;
  text: string;
  timestamp: string;
  duration: number;
  confidence: 'high' | 'medium' | 'low';
  speed_ms: number; // Groq speed in milliseconds
}

export default function Live3Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [liveText, setLiveText] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const segmentIdRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // VAD-inspired: Detect silence and auto-chunk
  const SILENCE_THRESHOLD = 2000; // 2 seconds of silence
  const MAX_CHUNK_DURATION = 25000; // 25 seconds (best practice: under 30s)
  const MIN_CHUNK_DURATION = 1000; // 1 second minimum

  const processAudioChunk = async (audioBlob: Blob, duration: number) => {
    if (audioBlob.size === 0) return;

    const chunkDuration = duration / 1000; // Convert to seconds

    setStatus(`🔄 معالجة ${chunkDuration.toFixed(1)} ثانية...`);

    try {
      const formData = new FormData();
      const audioFile = new File([audioBlob], `chunk-${Date.now()}.webm`, {
        type: 'audio/webm'
      });
      formData.append('file', audioFile);

      const response = await fetch('/api/transcribe-groq', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.text.trim()) {
        const now = new Date();
        const timestamp = now.toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        // Calculate confidence based on duration (longer = more confident)
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        if (chunkDuration >= 3) confidence = 'high';
        else if (chunkDuration < 1.5) confidence = 'low';

        const newSegment: TranscriptSegment = {
          id: segmentIdRef.current++,
          text: data.text,
          timestamp,
          duration: chunkDuration,
          confidence,
          speed_ms: data.duration_ms || 0
        };

        setSegments(prev => [...prev, newSegment]);
        setLiveText('');
        setStatus(`✅ Groq: ${data.duration_ms}ms ⚡`);

        // Clear status after 2 seconds
        setTimeout(() => setStatus(''), 2000);
      } else {
        setStatus('⚠️ لم يتم اكتشاف كلام واضح');
        setTimeout(() => setStatus(''), 3000);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setStatus('❌ خطأ في التفريغ');
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const sendCurrentChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0) return;

    const duration = Date.now() - startTimeRef.current;
    if (duration < MIN_CHUNK_DURATION) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    await processAudioChunk(audioBlob, duration);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Whisper optimal sample rate
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // Use optimal audio settings
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          // Visual feedback: show recording
          const duration = Date.now() - startTimeRef.current;
          setLiveText(`🎤 جاري التسجيل... ${(duration / 1000).toFixed(1)}s`);
        }
      };

      // Auto-chunk: Send chunks periodically (VAD-inspired)
      intervalRef.current = setInterval(async () => {
        const duration = Date.now() - startTimeRef.current;

        // Auto-send if reached max duration
        if (duration >= MAX_CHUNK_DURATION) {
          await sendCurrentChunk();
        }
      }, 1000);

      // Start collecting data every 100ms
      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus('🎤 جاري التسجيل - سيتم التفريغ تلقائياً كل 25 ثانية');
      setRecordingDuration(0);

      // Duration counter
      const durationInterval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      return () => clearInterval(durationInterval);
    } catch (error) {
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [sendCurrentChunk]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Clear intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Send final chunk
      setTimeout(async () => {
        await sendCurrentChunk();

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      }, 500);
    }
  }, [sendCurrentChunk]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const getConfidenceBadge = (confidence: string) => {
    switch (confidence) {
      case 'high': return '🟢 دقة عالية';
      case 'medium': return '🟡 دقة متوسطة';
      case 'low': return '🔴 دقة منخفضة';
      default: return '';
    }
  };

  const exportToText = () => {
    const text = segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-orange-50 to-red-50 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              ⚡ تجربة رقم 3: Groq (أسرع 5-10x)
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Whisper Large V3 Turbo + Groq Inference = سرعة خيالية ⚡
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/live4" className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors">
              🧠 تجربة 4
            </Link>
            <Link href="/" className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
              ← الرئيسية
            </Link>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-lg p-4 mb-6 border-l-4 border-orange-500">
          <h3 className="font-bold text-gray-800 dark:text-white mb-2">⚡ سرعة Groq الخارقة:</h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>🚀 <strong>Whisper Large V3 Turbo:</strong> أسرع 5-10x من OpenAI</li>
            <li>⚡ <strong>Groq LPU™:</strong> معالج مخصص للـ AI (ليس GPU!)</li>
            <li>📊 <strong>قياس السرعة:</strong> يعرض الوقت بالميلي ثانية</li>
            <li>🎯 <strong>نفس الدقة:</strong> Whisper Large V3 الأصلي</li>
          </ul>
        </div>

        {/* Recording Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div className="flex flex-col items-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-36 h-36 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700"
              >
                <div className="flex flex-col items-center">
                  <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                  </svg>
                  <span className="text-sm">ابدأ</span>
                </div>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={stopRecording}
                  className="w-36 h-36 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 relative z-10 animate-pulse"
                >
                  <div className="flex flex-col items-center">
                    <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                      <rect x="6" y="6" width="8" height="8" rx="1" />
                    </svg>
                    <span className="text-sm">إيقاف</span>
                  </div>
                </button>
                <div className="absolute inset-0 bg-red-500 rounded-full opacity-30 animate-ping pointer-events-none" />
              </div>
            )}

            {/* Status */}
            <div className="mt-6 text-center">
              {isRecording && (
                <div className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                </div>
              )}
              {status && (
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                  {status}
                </p>
              )}
              {liveText && isRecording && (
                <p className="text-emerald-600 dark:text-emerald-400 mt-2">
                  {liveText}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Segments Display */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">
              📝 النصوص المفرغة ({segments.length})
            </h2>
            {segments.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={exportToText}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  💾 حفظ ملف
                </button>
                <button
                  onClick={() => {
                    const allText = segments.map(s => s.text).join(' ');
                    navigator.clipboard.writeText(allText);
                    alert('تم نسخ النص!');
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm"
                >
                  📋 نسخ
                </button>
                <button
                  onClick={() => setSegments([])}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                >
                  🗑️ مسح
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {segments.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <p className="text-gray-400 dark:text-gray-500 text-lg">
                  ابدأ التسجيل لرؤية النصوص هنا...
                </p>
              </div>
            ) : (
              segments.map((segment) => (
                <div
                  key={segment.id}
                  className="p-5 bg-gradient-to-br from-orange-50 to-red-50 dark:from-gray-700 dark:to-gray-600 rounded-lg border-r-4 border-orange-500 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {segment.timestamp}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-orange-200 dark:bg-orange-700 text-orange-800 dark:text-orange-200">
                          {segment.duration.toFixed(1)}s
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-red-200 dark:bg-red-700 text-red-800 dark:text-red-200 font-bold">
                          ⚡ {segment.speed_ms}ms
                        </span>
                        <span className="text-xs">
                          {getConfidenceBadge(segment.confidence)}
                        </span>
                      </div>
                      <p className="text-gray-800 dark:text-white text-lg leading-relaxed text-right">
                        {segment.text}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(segment.text);
                        alert('تم النسخ!');
                      }}
                      className="px-3 py-1 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors"
                    >
                      📋
                    </button>
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
