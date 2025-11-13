'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

interface TranscriptSegment {
  id: number;
  text: string;
  timestamp: string;
  duration: number;
  confidence: 'high' | 'medium' | 'low';
  speed_ms: number;
}

export default function Live4Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [liveText, setLiveText] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const segmentIdRef = useRef(0);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  // Smart VAD settings
  const SILENCE_THRESHOLD = 2000; // 2 seconds of silence triggers transcription
  const MIN_SPEECH_DURATION = 800; // Minimum 800ms to be considered speech
  const VOLUME_THRESHOLD = 15; // Volume level to detect speech (0-100)

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0) return;

    const duration = Date.now() - startTimeRef.current;
    if (duration < MIN_SPEECH_DURATION) {
      // Too short, ignore
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    setLiveText('🔄 جاري التفريغ...');
    setStatus('⚡ معالجة الصوت...');

    try {
      const audioFile = new File([audioBlob], `speech-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
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

        const chunkDuration = duration / 1000;
        let confidence: 'high' | 'medium' | 'low' = 'medium';
        if (chunkDuration >= 2) confidence = 'high';
        else if (chunkDuration < 1) confidence = 'low';

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
        setStatus(`✅ تم! ${data.duration_ms}ms`);
        setTimeout(() => setStatus(''), 2000);
      } else {
        setLiveText('');
        setStatus('');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      setStatus('❌ خطأ في التفريغ');
      setLiveText('');
      setTimeout(() => setStatus(''), 3000);
    }
  };

  // Analyze audio levels and detect speech/silence
  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const volumeLevel = (average / 255) * 100;
    setAudioLevel(volumeLevel);

    const now = Date.now();
    const wasSpeaking = isSpeaking;

    // Detect if user is speaking based on volume
    if (volumeLevel > VOLUME_THRESHOLD) {
      if (!wasSpeaking) {
        setIsSpeaking(true);
        setLiveText('🎤 أستمع...');
        console.log('🎤 Speech started');
      }
      lastSpeechTimeRef.current = now;

      // Clear any pending silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (wasSpeaking) {
      // User stopped talking - start silence timer
      const silenceDuration = now - lastSpeechTimeRef.current;

      if (silenceDuration >= SILENCE_THRESHOLD) {
        console.log('🔇 Silence detected, processing...');
        setIsSpeaking(false);
        setLiveText('');

        // Process the chunk
        processAudioChunk();
      } else if (!silenceTimeoutRef.current) {
        // Start silence countdown
        silenceTimeoutRef.current = setTimeout(() => {
          setIsSpeaking(false);
          setLiveText('');
          processAudioChunk();
          silenceTimeoutRef.current = null;
        }, SILENCE_THRESHOLD - silenceDuration);
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [isRecording, isSpeaking]);

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

      // Setup audio visualization and analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      // Setup MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      lastSpeechTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setStatus('🎤 جاري التسجيل - سأفرغ تلقائياً عند السكوت');
      setRecordingDuration(0);

      // Start audio analysis
      analyzeAudio();

      // Duration counter
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [analyzeAudio]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsSpeaking(false);
      setLiveText('');

      // Clear intervals and timeouts
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Process final chunk
      setTimeout(async () => {
        await processAudioChunk();

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        setAudioLevel(0);
        setStatus('⏸️ تم الإيقاف');
      }, 300);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const exportToText = () => {
    const text = segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-smart-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const json = JSON.stringify(segments, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcription-smart-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-purple-50 to-fuchsia-50 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              🧠 تجربة رقم 4: الذكاء الصوتي
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              كشف ذكي للكلام + Groq = تفريغ تلقائي بدون توقف يدوي ⚡
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/live3" className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors">
              ⚡ تجربة 3
            </Link>
            <Link href="/" className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors">
              ← الرئيسية
            </Link>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-violet-100 to-fuchsia-100 dark:from-violet-900/30 dark:to-fuchsia-900/30 rounded-lg p-4 mb-6 border-l-4 border-violet-500">
          <h3 className="font-bold text-gray-800 dark:text-white mb-2">🧠 ما الجديد في هذه التجربة؟</h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            <li>🎯 <strong>كشف ذكي للصوت:</strong> يعرف متى تتكلم ومتى تسكت (Web Audio API)</li>
            <li>⚡ <strong>تفريغ تلقائي:</strong> يفرغ فوراً بعد سكوتك ب 2 ثانية</li>
            <li>📊 <strong>تصور صوتي مباشر:</strong> شاهد مستوى الصوت لحظياً</li>
            <li>🎤 <strong>فلترة ذكية:</strong> يتجاهل الأصوات الخفيفة والضوضاء</li>
            <li>💾 <strong>تصدير متقدم:</strong> حفظ بصيغة JSON أو TXT</li>
            <li>🚀 <strong>Groq Speed:</strong> نفس السرعة الخارقة من التجربة 3</li>
            <li>🔧 <strong>بدون مكتبات خارجية:</strong> Web Audio API فقط!</li>
          </ul>
        </div>

        {/* Recording Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-6">
          <div className="flex flex-col items-center">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="w-36 h-36 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:from-violet-600 hover:to-fuchsia-700"
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
                  className={`w-36 h-36 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 relative z-10 ${
                    isSpeaking
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 animate-pulse'
                      : 'bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700'
                  }`}
                >
                  <div className="flex flex-col items-center">
                    {isSpeaking ? (
                      <>
                        <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                        </svg>
                        <span className="text-sm">أستمع</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-16 h-16 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-sm">إيقاف</span>
                      </>
                    )}
                  </div>
                </button>
                {isSpeaking && (
                  <div className="absolute inset-0 bg-green-500 rounded-full opacity-30 animate-ping pointer-events-none" />
                )}
              </div>
            )}

            {/* Audio Level Visualization */}
            {isRecording && (
              <div className="mt-6 w-full max-w-md">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-100 ${
                      isSpeaking ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-violet-400 to-fuchsia-500'
                    }`}
                    style={{ width: `${audioLevel}%` }}
                  />
                  {/* Threshold indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500/50"
                    style={{ left: `${VOLUME_THRESHOLD}%` }}
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    مستوى الصوت: {audioLevel.toFixed(0)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    عتبة الكشف: {VOLUME_THRESHOLD}%
                  </p>
                </div>
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
                <p className={`mt-2 font-bold ${isSpeaking ? 'text-green-600 dark:text-green-400' : 'text-violet-600 dark:text-violet-400'}`}>
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
                  onClick={exportToJSON}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  📊 JSON
                </button>
                <button
                  onClick={exportToText}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                  💾 TXT
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
                  ابدأ التسجيل - سأفرغ تلقائياً عند سكوتك...
                </p>
              </div>
            ) : (
              segments.map((segment) => (
                <div
                  key={segment.id}
                  className="p-5 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-gray-700 dark:to-gray-600 rounded-lg border-r-4 border-violet-500 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          {segment.timestamp}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-violet-200 dark:bg-violet-700 text-violet-800 dark:text-violet-200">
                          🎤 {segment.duration.toFixed(1)}s
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-fuchsia-200 dark:bg-fuchsia-700 text-fuchsia-800 dark:text-fuchsia-200 font-bold">
                          ⚡ {segment.speed_ms}ms
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-200 dark:bg-green-700 text-green-800 dark:text-green-200">
                          🧠 ذكي
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
                      className="px-3 py-1 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors"
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
