'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function Live13Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState('جاهز للتسجيل');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const isSpeakingRef = useRef(false);
  const textEndRef = useRef<HTMLDivElement>(null);

  // Configuration based on best practices
  const CONFIG = {
    CHUNK_DURATION: 3000,      // 3 seconds per chunk (faster response)
    MIN_CHUNK_SIZE: 15000,     // 15KB minimum (lower threshold)
    SILENCE_THRESHOLD: 1200,   // 1.2 seconds of silence to trigger send
    VOLUME_THRESHOLD: 12,      // Volume threshold for VAD
    SAMPLE_RATE: 16000,        // Optimal for speech
  };

  // Auto scroll
  useEffect(() => {
    textEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveText]);

  // Monitor audio level with VAD
  const monitorAudio = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    setAudioLevel(normalizedLevel);

    // Voice Activity Detection
    const now = Date.now();
    const isSpeaking = normalizedLevel > CONFIG.VOLUME_THRESHOLD;

    if (isSpeaking) {
      lastSpeechTimeRef.current = now;
      if (!isSpeakingRef.current) {
        isSpeakingRef.current = true;
        setStatus('🎤 جاري الاستماع...');
      }
    } else if (isSpeakingRef.current) {
      const silenceDuration = now - lastSpeechTimeRef.current;
      if (silenceDuration >= CONFIG.SILENCE_THRESHOLD) {
        isSpeakingRef.current = false;
        setStatus('⏸️ صمت - معالجة...');
        // Trigger immediate processing on silence
        processChunk();
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorAudio);
  }, [isRecording]);

  const processChunk = async () => {
    if (audioChunksRef.current.length === 0 || isSending) {
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    // Check minimum size
    if (audioBlob.size < CONFIG.MIN_CHUNK_SIZE) {
      console.log('⚠️ Chunk too small:', audioBlob.size, 'bytes (need', CONFIG.MIN_CHUNK_SIZE, '+)');
      audioChunksRef.current = [];
      return;
    }

    console.log('✅ Processing chunk:', audioBlob.size, 'bytes');

    // Clear chunks for next recording
    audioChunksRef.current = [];

    try {
      setIsSending(true);
      setStatus('⚡ جاري التفريغ...');

      const audioFile = new File([audioBlob], 'recording.webm', {
        type: 'audio/webm;codecs=opus'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const response = await fetch('/api/transcribe-live', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.text && data.text.trim()) {
        console.log('✅ Got text:', data.text);
        setLiveText(prev => {
          if (!prev) return data.text.trim();
          return prev + ' ' + data.text.trim();
        });
        setStatus('✅ تم التفريغ');
        setTimeout(() => setStatus(isSpeakingRef.current ? '🎤 جاري الاستماع...' : '⏸️ في انتظار الكلام'), 1000);
      } else {
        console.log('⚠️ No text in response');
        setStatus('⏸️ في انتظار الكلام');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      setStatus('❌ خطأ - سنحاول مرة أخرى');
    } finally {
      setIsSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: CONFIG.SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      streamRef.current = stream;

      // Setup audio context for VAD
      audioContextRef.current = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      lastSpeechTimeRef.current = Date.now();
      isSpeakingRef.current = false;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      setLiveText('');
      setStatus('🎤 التسجيل نشط - ابدأ الكلام');

      monitorAudio();

      // Backup interval: process every 5 seconds if no silence detected
      intervalRef.current = setInterval(() => {
        if (!isSending && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          if (audioBlob.size >= CONFIG.MIN_CHUNK_SIZE) {
            console.log('⏰ Timer triggered processing');
            processChunk();
          }
        }
      }, CONFIG.CHUNK_DURATION);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك');
      setStatus('❌ فشل الوصول للمايك');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

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
        setStatus('⏹️ تم الإيقاف');
      }, 500);
    }
  };

  const copyText = () => {
    navigator.clipboard.writeText(liveText);
    setStatus('✅ تم النسخ!');
    setTimeout(() => setStatus('جاهز للتسجيل'), 2000);
  };

  const clearText = () => {
    if (confirm('مسح النص؟')) {
      setLiveText('');
      setStatus('جاهز للتسجيل');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <span className="text-5xl">⚡</span>
              Live 13 Pro
            </h1>
            <p className="text-gray-400 mt-1">Best Practices Implementation</p>
          </div>
          <Link href="/" className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            ← رجوع
          </Link>
        </div>

        {/* Status Bar */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 mb-6 border border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-600'}`}></div>
              <span className="text-sm font-medium">{status}</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span>🎯 VAD: {CONFIG.VOLUME_THRESHOLD}%</span>
              <span>⏱️ Chunk: {CONFIG.CHUNK_DURATION / 1000}s</span>
              <span>📊 Level: {audioLevel.toFixed(0)}%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700">
              {/* Recording Button */}
              <div className="flex flex-col items-center mb-6">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-2xl transition-all transform hover:scale-110 flex items-center justify-center"
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

                {/* Visualizer */}
                {isRecording && (
                  <div className="mt-6 w-full">
                    <div className="flex items-center justify-center gap-1 h-20">
                      {[...Array(12)].map((_, i) => {
                        const threshold = (i + 1) * 8.33;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`w-2 rounded-full transition-all duration-100 ${
                              isActive
                                ? isSpeakingRef.current
                                  ? 'bg-gradient-to-t from-emerald-400 to-green-500'
                                  : 'bg-gradient-to-t from-gray-500 to-gray-400'
                                : 'bg-gray-700'
                            }`}
                            style={{
                              height: isActive ? `${Math.min(80, threshold + 10)}px` : '8px'
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Features List */}
              <div className="space-y-2 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Voice Activity Detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Smart Silence Detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Optimal Chunking (5s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Error Resilience</span>
                </div>
              </div>

              {/* Actions */}
              {liveText && (
                <div className="mt-6 space-y-2">
                  <button
                    onClick={copyText}
                    className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
                  >
                    📋 نسخ
                  </button>
                  <button
                    onClick={clearText}
                    className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                  >
                    🗑️ مسح
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Text Display */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-gray-700 min-h-[500px] max-h-[600px] overflow-y-auto">
              {!liveText && !isRecording ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <div className="text-8xl mb-6">⚡</div>
                  <h3 className="text-2xl font-bold mb-2">تفريغ فوري احترافي</h3>
                  <p className="text-gray-400 mb-4">اضغط المايك وابدأ الكلام</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>• التفريغ يبدأ عند السكوت</p>
                    <p>• كشف تلقائي للصوت (VAD)</p>
                    <p>• دقة عالية مع Groq Turbo</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-2xl leading-relaxed text-right whitespace-pre-wrap">
                    {liveText}
                    {isSending && <span className="inline-block animate-pulse ml-2 text-emerald-400">▋</span>}
                  </p>
                  <div ref={textEndRef} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Powered by Groq Whisper Large V3 Turbo • Optimized for Real-Time Performance</p>
        </div>
      </div>
    </div>
  );
}
