'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

export default function Live10Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{
    id: number;
    text: string;
    timestamp: string;
    duration: number;
  }>>([]);
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const AUTO_PROCESS_INTERVAL = 5000; // Process every 5 seconds

  // Monitor audio level
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    setAudioLevel(normalizedLevel);

    animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
  }, [isRecording]);

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0 || isProcessing) {
      console.log('⏭️ Skipping - no chunks or already processing');
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    // Check minimum size
    if (audioBlob.size < 10000) {
      console.log('⚠️ Chunk too small:', audioBlob.size, 'bytes');
      audioChunksRef.current = [];
      return;
    }

    console.log('✅ Processing chunk:', audioBlob.size, 'bytes');

    // Clear chunks for next recording
    audioChunksRef.current = [];

    try {
      setIsProcessing(true);
      setStatus('⚡ جاري التفريغ بواسطة Gemini...');

      const audioFile = new File([audioBlob], `chunk-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const startTime = Date.now();
      const response = await fetch('/api/transcribe-gemini', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      console.log('📥 Gemini Response:', data);

      if (data.success && data.text && data.text.trim()) {
        const timestamp = new Date().toLocaleTimeString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

        const newSegment = {
          id: Date.now(),
          text: data.text.trim(),
          timestamp,
          duration: processingTime
        };

        console.log('✅ New segment added:', newSegment);
        setTranscriptSegments(prev => [...prev, newSegment]);

        setStatus(`✅ تم التفريغ في ${processingTime}ms`);
        setTimeout(() => setStatus(''), 2000);
      } else {
        console.log('⚠️ No text in response');
        setStatus('⚠️ لم يتم التعرف على كلام');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
      setStatus('❌ خطأ في المعالجة');
      setTimeout(() => setStatus(''), 2000);
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
        }
      });

      streamRef.current = stream;

      // Setup audio context for visualization
      audioContextRef.current = new AudioContext();
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
      startTimeRef.current = Date.now();
      setRecordingDuration(0);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus('🎤 جاري التسجيل...');

      monitorAudioLevel();

      // Update duration every second
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // Auto-process every 5 seconds
      intervalRef.current = setInterval(() => {
        processAudioChunk();
      }, AUTO_PROCESS_INTERVAL);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [monitorAudioLevel]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      // Clear intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Process final chunk
      setTimeout(async () => {
        await processAudioChunk();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        setAudioLevel(0);
        setStatus('⏸️ تم إيقاف التسجيل');
      }, 500);
    }
  }, []);

  const copyAllText = () => {
    const fullText = transcriptSegments.map(seg => seg.text).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setStatus('✅ تم النسخ!');
    setTimeout(() => setStatus(''), 2000);
  };

  const downloadTxt = () => {
    const fullText = transcriptSegments.map((seg, idx) =>
      `[${idx + 1}] ${seg.timestamp}\n${seg.text}\n`
    ).join('\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (confirm('هل أنت متأكد من حذف جميع النصوص؟')) {
      setTranscriptSegments([]);
      setStatus('');
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const totalWords = transcriptSegments.reduce((sum, seg) =>
    sum + seg.text.split(/\s+/).filter(w => w.length > 0).length, 0
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-6xl">🌟</span>
              التجربة 10
            </h1>
            <p className="text-gray-200 text-lg">
              تفريغ صوتي فوري بقوة Google Gemini 2.0 Flash 🚀
            </p>
          </div>
          <Link href="/" className="px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl backdrop-blur-md transition-all font-bold">
            ← الرئيسية
          </Link>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-white">{transcriptSegments.length}</div>
            <div className="text-sm text-gray-200">قطع</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-white">{totalWords}</div>
            <div className="text-sm text-gray-200">كلمة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-white">{formatDuration(recordingDuration)}</div>
            <div className="text-sm text-gray-200">المدة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-yellow-300">⚡ Gemini</div>
            <div className="text-sm text-gray-200">2.0 Flash</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Recording Button */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/30">
              <div className="flex flex-col items-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="w-48 h-48 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-105 disabled:opacity-50 bg-gradient-to-br from-green-400 to-emerald-600 hover:from-green-500 hover:to-emerald-700 flex items-center justify-center"
                  >
                    <div className="flex flex-col items-center">
                      <svg className="w-20 h-20 mb-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                      </svg>
                      <span className="text-2xl">ابدأ التسجيل</span>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={stopRecording}
                      className="w-48 h-48 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-105 bg-gradient-to-br from-red-500 to-rose-600 animate-pulse relative z-10 flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-20 h-20 mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-2xl">إيقاف</span>
                      </div>
                    </button>
                    <div className="absolute inset-0 bg-red-500 rounded-full opacity-20 animate-ping pointer-events-none"></div>
                  </div>
                )}

                {/* Audio Visualizer */}
                {isRecording && (
                  <div className="mt-8 w-full">
                    <div className="flex items-center justify-center gap-1 h-32 mb-3">
                      {[...Array(20)].map((_, i) => {
                        const threshold = (i + 1) * 5;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`w-2 rounded-full transition-all duration-100 ${
                              isActive
                                ? 'bg-gradient-to-t from-yellow-400 to-orange-500'
                                : 'bg-white/20'
                            }`}
                            style={{
                              height: isActive ? `${Math.min(128, threshold + 30)}px` : '12px'
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-white mb-2">{audioLevel.toFixed(0)}%</div>
                      <div className="text-sm text-gray-200">مستوى الصوت</div>
                    </div>
                  </div>
                )}

                {/* Status */}
                {status && (
                  <div className="mt-6 w-full">
                    <div className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-xl text-center">
                      <p className="text-base font-medium text-white">{status}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {transcriptSegments.length > 0 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
                <h3 className="text-xl font-bold text-white mb-4">⚡ الإجراءات</h3>
                <div className="space-y-3">
                  <button
                    onClick={copyAllText}
                    className="w-full px-6 py-4 bg-blue-500/90 hover:bg-blue-600 text-white rounded-xl font-bold transition-all"
                  >
                    📋 نسخ النص
                  </button>
                  <button
                    onClick={downloadTxt}
                    className="w-full px-6 py-4 bg-green-500/90 hover:bg-green-600 text-white rounded-xl font-bold transition-all"
                  >
                    📄 تحميل TXT
                  </button>
                  <button
                    onClick={clearAll}
                    className="w-full px-6 py-4 bg-red-500/90 hover:bg-red-600 text-white rounded-xl font-bold transition-all"
                  >
                    🗑️ مسح الكل
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transcript Display */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/30 min-h-[700px] max-h-[900px] overflow-y-auto">
            <h2 className="text-3xl font-bold text-white mb-6 sticky top-0 bg-gradient-to-b from-purple-900/90 to-transparent pb-3">
              📝 النصوص المفرغة
            </h2>

            {transcriptSegments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <div className="text-9xl mb-8 animate-bounce">🎤</div>
                <h3 className="text-3xl font-bold text-white mb-3">جاهز للتسجيل!</h3>
                <p className="text-xl text-gray-200">
                  اضغط الزر الأخضر وابدأ الكلام
                </p>
                <p className="text-lg text-gray-300 mt-4">
                  سيتم التفريغ تلقائياً كل 5 ثواني ⚡
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {transcriptSegments.map((segment, idx) => (
                  <div
                    key={segment.id}
                    className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-lg font-bold text-yellow-300">
                        #{idx + 1}
                      </span>
                      <div className="flex items-center gap-4 text-sm text-gray-300">
                        <span>⏱️ {segment.duration}ms</span>
                        <span>🕐 {segment.timestamp}</span>
                      </div>
                    </div>

                    <p className="text-xl text-white leading-relaxed text-right">
                      {segment.text}
                    </p>
                  </div>
                ))}

                {isProcessing && (
                  <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-2xl p-6">
                    <p className="text-yellow-200 text-center text-lg animate-pulse">
                      ⚡ جاري المعالجة بواسطة Gemini...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Features Info */}
        <div className="mt-8 bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-md rounded-3xl p-8 border border-white/30">
          <h3 className="text-2xl font-bold text-white mb-5">✨ المميزات</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-lg text-gray-200">
            <div>🤖 <strong>Google Gemini 2.0 Flash</strong> - أحدث تقنيات الذكاء الاصطناعي</div>
            <div>⚡ <strong>تفريغ تلقائي</strong> - كل 5 ثواني</div>
            <div>🎯 <strong>دقة عالية</strong> - دعم للغتين العربية والإنجليزية</div>
          </div>
        </div>
      </div>
    </div>
  );
}
