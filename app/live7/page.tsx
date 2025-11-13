'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

export default function Live7Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{ id: number; text: string; timestamp: string }>>([]);
  const [currentSegment, setCurrentSegment] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [chunkCount, setChunkCount] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const CHUNK_DURATION = 5000; // 5 seconds

  // Audio level monitoring
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    setAudioLevel(normalizedLevel);

    animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
  }, [isRecording]);

  const processChunk = async () => {
    if (audioChunksRef.current.length === 0) {
      console.log('No audio chunks to process');
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log('Processing chunk:', audioBlob.size, 'bytes');

    // Clear chunks for next iteration
    audioChunksRef.current = [];

    if (audioBlob.size < 1000) {
      console.log('Chunk too small, skipping');
      return;
    }

    try {
      setIsProcessing(true);
      setCurrentSegment('🔄 جاري التفريغ...');

      const audioFile = new File([audioBlob], `chunk-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const response = await fetch('/api/transcribe-groq', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.text && data.text.trim()) {
        const timestamp = new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const newSegment = {
          id: Date.now(),
          text: data.text.trim(),
          timestamp
        };

        setTranscriptSegments(prev => [...prev, newSegment]);
        setCurrentSegment('');
        setChunkCount(prev => prev + 1);
        setStatus(`✅ تم تفريغ ${chunkCount + 1} قطعة`);
      } else {
        setCurrentSegment('');
        console.log('No text in response');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setCurrentSegment('❌ خطأ في التفريغ');
      setTimeout(() => setCurrentSegment(''), 2000);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // Setup audio context for level monitoring
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
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
      setStatus('🎤 يتم التسجيل والتفريغ كل 5 ثواني...');
      setChunkCount(0);

      // Start audio level monitoring
      monitorAudioLevel();

      // Process chunks every 5 seconds
      intervalRef.current = setInterval(() => {
        console.log('5 seconds elapsed, processing chunk...');
        processChunk();
      }, CHUNK_DURATION);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [monitorAudioLevel]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Stop interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Stop animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
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

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        setAudioLevel(0);
        setStatus('⏸️ تم الإيقاف');
      }, 300);
    }
  }, []);

  const clearTranscript = () => {
    if (confirm('هل أنت متأكد من مسح جميع النصوص؟')) {
      setTranscriptSegments([]);
      setChunkCount(0);
      setStatus('');
    }
  };

  const exportText = () => {
    const fullText = transcriptSegments.map(seg => seg.text).join('\n\n');
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">
              ⚡ تجربة 7: التفريغ الفوري كل 5 ثواني
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              تسجيل مستمر مع تفريغ تلقائي فوري كل 5 ثواني! 🚀
            </p>
          </div>
          <Link href="/" className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm">
            ← الرئيسية
          </Link>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-lg p-3 mb-4 border-l-4 border-emerald-500">
          <h3 className="font-bold text-gray-800 dark:text-white mb-1 text-sm">💡 كيف تعمل؟</h3>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
            <li>🎤 <strong>تسجيل مستمر:</strong> يسجل صوتك بدون توقف</li>
            <li>⏱️ <strong>كل 5 ثواني:</strong> يرفع القطعة الصوتية تلقائياً</li>
            <li>⚡ <strong>تفريغ فوري:</strong> باستخدام Groq (أسرع من البرق!)</li>
            <li>📝 <strong>عرض مباشر:</strong> النص يظهر أمامك فوراً</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Side: Recording Controls */}
          <div className="space-y-4">
            {/* Recording Button */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex flex-col items-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50"
                  >
                    <div className="flex flex-col items-center">
                      <svg className="w-14 h-14 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                      </svg>
                      <span className="text-xs">ابدأ</span>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={stopRecording}
                      className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-red-500 to-pink-600 animate-pulse relative z-10"
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-14 h-14 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-xs">إيقاف</span>
                      </div>
                    </button>
                    <div className="absolute inset-0 bg-red-500 rounded-full opacity-30 animate-ping pointer-events-none" />
                  </div>
                )}

                {/* Audio Level */}
                {isRecording && (
                  <div className="mt-4 w-full">
                    <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-100"
                        style={{ width: `${audioLevel}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                      مستوى الصوت: {audioLevel.toFixed(0)}%
                    </p>
                  </div>
                )}

                {/* Status */}
                <div className="mt-4 text-center w-full">
                  {status && (
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {status}
                    </p>
                  )}
                  {currentSegment && (
                    <p className="mt-2 text-xs text-teal-600 dark:text-teal-400 font-medium">
                      {currentSegment}
                    </p>
                  )}
                </div>

                {/* Stats */}
                {isRecording && (
                  <div className="mt-4 grid grid-cols-2 gap-4 w-full">
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{chunkCount}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">قطع مفرغة</div>
                    </div>
                    <div className="bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">{transcriptSegments.length}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">نصوص محفوظة</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {transcriptSegments.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">⚙️ الإجراءات</h3>
                <div className="flex gap-2">
                  <button
                    onClick={exportText}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold"
                  >
                    📥 تصدير نص
                  </button>
                  <button
                    onClick={clearTranscript}
                    className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold"
                  >
                    🗑️ مسح الكل
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Side: Live Transcript */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-h-[700px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                📝 النص المباشر
              </h2>
              {transcriptSegments.length > 0 && (
                <span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded-full text-xs font-bold">
                  {transcriptSegments.length} قطعة
                </span>
              )}
            </div>

            <div className="space-y-3">
              {transcriptSegments.length === 0 && !currentSegment ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="text-6xl mb-4">🎤</div>
                  <p className="text-gray-400 text-lg font-semibold mb-2">
                    ابدأ التسجيل
                  </p>
                  <p className="text-gray-500 text-sm">
                    النص سيظهر هنا مباشرة كل 5 ثواني
                  </p>
                </div>
              ) : (
                <>
                  {transcriptSegments.map((segment, idx) => (
                    <div
                      key={segment.id}
                      className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 p-4 rounded-lg border-r-4 border-emerald-500 animate-fadeIn"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                          #{idx + 1}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {segment.timestamp}
                        </span>
                      </div>
                      <p className="text-gray-800 dark:text-white text-right leading-relaxed">
                        {segment.text}
                      </p>
                    </div>
                  ))}

                  {currentSegment && (
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 rounded-lg border-r-4 border-blue-500">
                      <p className="text-blue-600 dark:text-blue-400 text-right text-sm">
                        {currentSegment}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
