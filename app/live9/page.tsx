'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

export default function Live9Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{
    id: number;
    text: string;
    timestamp: string;
    duration: number;
  }>>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);

  const SILENCE_THRESHOLD = 2000; // 2 seconds
  const VOLUME_THRESHOLD = 15;
  const AUTO_CHUNK_INTERVAL = 8000; // 8 seconds max

  // Monitor audio level
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    setAudioLevel(normalizedLevel);

    // Update duration
    if (recordingStartRef.current) {
      const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000);
      setTotalDuration(duration);
    }

    // Detect speech
    const now = Date.now();
    const wasSpeaking = isSpeaking;

    if (normalizedLevel > VOLUME_THRESHOLD) {
      if (!wasSpeaking) {
        setIsSpeaking(true);
        setCurrentText('🎤 أستمع...');
      }
      lastSpeechTimeRef.current = now;
    } else if (wasSpeaking) {
      const silenceDuration = now - lastSpeechTimeRef.current;
      if (silenceDuration >= SILENCE_THRESHOLD) {
        setIsSpeaking(false);
        setCurrentText('');
        processAudioChunk();
      }
    }

    animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
  }, [isRecording, isSpeaking]);

  const convertToWav = async (webmBlob: Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const fileReader = new FileReader();

      fileReader.onload = async () => {
        try {
          const arrayBuffer = fileReader.result as ArrayBuffer;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          // Convert to WAV format
          const wavBuffer = audioBufferToWav(audioBuffer);
          const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });

          audioContext.close();
          resolve(wavBlob);
        } catch (error) {
          reject(error);
        }
      };

      fileReader.onerror = () => reject(fileReader.error);
      fileReader.readAsArrayBuffer(webmBlob);
    });
  };

  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels: Float32Array[] = [];
    let offset = 0;
    let pos = 0;

    // Write WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // RIFF identifier
    setUint32(0x46464952);
    // file length minus RIFF identifier length and file description length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(buffer.numberOfChannels);
    // sample rate
    setUint32(buffer.sampleRate);
    // byte rate (sample rate * block align)
    setUint32(buffer.sampleRate * buffer.numberOfChannels * 2);
    // block align (channel count * bytes per sample)
    setUint16(buffer.numberOfChannels * 2);
    // bits per sample
    setUint16(16);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - pos - 4);

    // write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return arrayBuffer;
  };

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0 || isProcessing) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

    // Check minimum size (20KB for reliable transcription)
    if (audioBlob.size < 20000) {
      console.log('⚠️ Chunk too small, skipping (size:', audioBlob.size, 'bytes - need 20KB+)');
      setCurrentText('⚠️ القطعة صغيرة - استمر في الكلام...');
      setTimeout(() => setCurrentText(''), 1500);

      // Reset for next chunk
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      return;
    }

    console.log('✅ Processing webm chunk of size:', audioBlob.size, 'bytes');

    // Reset for next chunk
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    try {
      setIsProcessing(true);
      setCurrentText('⚡ جاري التفريغ...');

      const audioFile = new File([audioBlob], `chunk-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const startTime = Date.now();
      const response = await fetch('/api/transcribe-groq', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      console.log('📥 API Response:', data);

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
        setCurrentText('');

        // Update word count
        const allText = [...transcriptSegments, newSegment]
          .map(seg => seg.text)
          .join(' ');
        setWordCount(allText.split(/\s+/).filter(w => w.length > 0).length);

        setStatus(`✅ تم التفريغ في ${processingTime}ms`);
        setTimeout(() => setStatus(''), 2000);
      } else {
        setCurrentText('');
        console.log('⚠️ No text in response:', data);
        setStatus('⚠️ لم يتم التعرف على كلام واضح');
        setTimeout(() => setStatus(''), 2000);
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
      setCurrentText('❌ خطأ في المعالجة');
      setStatus('❌ خطأ - تأكد من الاتصال');
      setTimeout(() => {
        setCurrentText('');
        setStatus('');
      }, 2000);
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

      // Setup audio context
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
      startTimeRef.current = Date.now();
      recordingStartRef.current = Date.now();
      lastSpeechTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus('🎤 التسجيل نشط - تكلم بوضوح');
      setTotalDuration(0);

      monitorAudioLevel();

      // Auto-process every 8 seconds as backup
      intervalRef.current = setInterval(() => {
        if (!isProcessing && audioChunksRef.current.length > 0) {
          processAudioChunk();
        }
      }, AUTO_CHUNK_INTERVAL);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [monitorAudioLevel]);

  const stopRecording = useCallback(async () => {
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
      setIsSpeaking(false);

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
      }, 300);
    }
  }, []);

  const clearAll = () => {
    if (confirm('هل أنت متأكد من حذف جميع النصوص؟')) {
      setTranscriptSegments([]);
      setWordCount(0);
      setTotalDuration(0);
      setStatus('');
    }
  };

  const copyAllText = () => {
    const fullText = transcriptSegments.map(seg => seg.text).join('\n\n');
    navigator.clipboard.writeText(fullText);
    setStatus('✅ تم النسخ للحافظة!');
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
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadJson = () => {
    const data = {
      segments: transcriptSegments,
      totalWords: wordCount,
      totalDuration: totalDuration,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">
              🎯 التجربة النهائية
            </h1>
            <p className="text-gray-300 text-sm">
              أفضل ما في جميع التجارب - تفريغ ذكي فوري مع VAD! 🚀
            </p>
          </div>
          <Link href="/" className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm transition-all">
            ← الرئيسية
          </Link>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold text-white">{transcriptSegments.length}</div>
            <div className="text-sm text-gray-300">قطع مفرغة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold text-white">{wordCount}</div>
            <div className="text-sm text-gray-300">كلمة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold text-white">{formatDuration(totalDuration)}</div>
            <div className="text-sm text-gray-300">المدة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
            <div className="text-3xl font-bold text-green-400">⚡ Groq</div>
            <div className="text-sm text-gray-300">فائق السرعة</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Recording Button */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
              <div className="flex flex-col items-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="w-40 h-40 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 flex items-center justify-center"
                  >
                    <div className="flex flex-col items-center">
                      <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                      </svg>
                      <span className="text-lg">ابدأ</span>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={stopRecording}
                      className="w-40 h-40 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-red-500 to-rose-600 animate-pulse relative z-10 flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-lg">إيقاف</span>
                      </div>
                    </button>
                    <div className="absolute inset-0 bg-red-500 rounded-full opacity-30 animate-ping pointer-events-none"></div>
                  </div>
                )}

                {/* Audio Visualizer */}
                {isRecording && (
                  <div className="mt-6 w-full">
                    <div className="flex items-center justify-center gap-1 h-24 mb-2">
                      {[...Array(25)].map((_, i) => {
                        const threshold = (i + 1) * 4;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full transition-all duration-75 ${
                              isActive
                                ? isSpeaking
                                  ? 'bg-gradient-to-t from-green-400 to-emerald-500'
                                  : 'bg-gradient-to-t from-blue-400 to-cyan-500'
                                : 'bg-white/20'
                            }`}
                            style={{
                              height: isActive ? `${Math.min(96, threshold + 20)}px` : '8px'
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white mb-1">{audioLevel.toFixed(0)}%</div>
                      <div className={`text-sm font-medium ${isSpeaking ? 'text-green-400' : 'text-gray-400'}`}>
                        {isSpeaking ? '🎤 يتحدث...' : '⏸️ صمت'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Status */}
                {status && (
                  <div className="mt-4 text-center">
                    <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                      <p className="text-sm font-medium text-white">{status}</p>
                    </div>
                  </div>
                )}

                {/* Current Processing */}
                {currentText && (
                  <div className="mt-3 text-center">
                    <p className="text-sm text-yellow-300 font-medium animate-pulse">{currentText}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {transcriptSegments.length > 0 && (
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                <h3 className="text-lg font-bold text-white mb-3">⚡ الإجراءات</h3>
                <div className="space-y-2">
                  <button
                    onClick={copyAllText}
                    className="w-full px-4 py-3 bg-blue-500/80 hover:bg-blue-600 text-white rounded-xl font-semibold transition-all backdrop-blur-sm"
                  >
                    📋 نسخ النص
                  </button>
                  <button
                    onClick={downloadTxt}
                    className="w-full px-4 py-3 bg-green-500/80 hover:bg-green-600 text-white rounded-xl font-semibold transition-all backdrop-blur-sm"
                  >
                    📄 تحميل TXT
                  </button>
                  <button
                    onClick={downloadJson}
                    className="w-full px-4 py-3 bg-purple-500/80 hover:bg-purple-600 text-white rounded-xl font-semibold transition-all backdrop-blur-sm"
                  >
                    📊 تحميل JSON
                  </button>
                  <button
                    onClick={clearAll}
                    className="w-full px-4 py-3 bg-red-500/80 hover:bg-red-600 text-white rounded-xl font-semibold transition-all backdrop-blur-sm"
                  >
                    🗑️ مسح الكل
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transcript Display */}
          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 min-h-[600px] max-h-[800px] overflow-y-auto">
            <h2 className="text-2xl font-bold text-white mb-4 sticky top-0 bg-gradient-to-b from-slate-900/90 to-transparent pb-2">
              📝 النصوص المفرغة
            </h2>

            {transcriptSegments.length === 0 && !currentText ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <div className="text-8xl mb-6 animate-bounce">🎤</div>
                <h3 className="text-2xl font-bold text-white mb-2">جاهز للتسجيل!</h3>
                <p className="text-gray-300">
                  اضغط الزر الأخضر وابدأ الكلام
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {transcriptSegments.map((segment, idx) => (
                  <div
                    key={segment.id}
                    className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 hover:bg-white/10 transition-all animate-fadeIn"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-green-400">
                        #{idx + 1}
                      </span>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span>⏱️ {segment.duration}ms</span>
                        <span>🕐 {segment.timestamp}</span>
                      </div>
                    </div>
                    <p className="text-lg text-white leading-relaxed text-right">
                      {segment.text}
                    </p>
                  </div>
                ))}

                {isProcessing && (
                  <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4">
                    <p className="text-yellow-300 text-center animate-pulse">
                      ⚡ جاري المعالجة...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Features Info */}
        <div className="mt-6 bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur-md rounded-2xl p-6 border border-white/20">
          <h3 className="text-lg font-bold text-white mb-3">✨ المميزات</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-300">
            <div>🎯 <strong>VAD ذكي</strong> - اكتشاف تلقائي للكلام والصمت</div>
            <div>⚡ <strong>Groq</strong> - تفريغ فائق السرعة</div>
            <div>📊 <strong>إحصائيات</strong> - كلمات، مدة، قطع</div>
            <div>💾 <strong>تصدير</strong> - TXT, JSON, نسخ</div>
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
