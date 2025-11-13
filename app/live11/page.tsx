'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

type TranscriptionMode = 'accurate' | 'summary' | 'keywords';

export default function Live11Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<Array<{
    id: number;
    text: string;
    mode: TranscriptionMode;
    language: string;
    wordCount: number;
    hasImage: boolean;
    hasContext: boolean;
    timestamp: string;
    duration: number;
  }>>([]);
  const [mode, setMode] = useState<TranscriptionMode>('accurate');
  const [contextText, setContextText] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus('🎤 جاري التسجيل...');

      monitorAudioLevel();

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [monitorAudioLevel]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Process audio
      setTimeout(async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size < 5000) {
          setStatus('⚠️ التسجيل قصير جداً');
          return;
        }

        try {
          setIsProcessing(true);
          setStatus('⚡ جاري التفريغ الذكي...');

          const formData = new FormData();
          const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, {
            type: 'audio/webm'
          });
          formData.append('audio', audioFile);
          formData.append('mode', mode);

          if (contextText.trim()) {
            formData.append('context', contextText.trim());
          }

          if (selectedImage) {
            formData.append('image', selectedImage);
          }

          const startTime = Date.now();
          const response = await fetch('/api/transcribe-smart', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          const processingTime = Date.now() - startTime;

          console.log('📥 Smart Response:', data);

          if (data.success && data.text && data.text.trim()) {
            const timestamp = new Date().toLocaleTimeString('ar-SA', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });

            const newSegment = {
              id: Date.now(),
              text: data.text.trim(),
              mode: data.metadata.mode,
              language: data.metadata.language,
              wordCount: data.metadata.wordCount,
              hasImage: data.metadata.hasImage,
              hasContext: data.metadata.hasContext,
              timestamp,
              duration: processingTime
            };

            console.log('✅ New segment added:', newSegment);
            setTranscriptSegments(prev => [...prev, newSegment]);

            setStatus(`✅ تم التفريغ في ${processingTime}ms`);
            setTimeout(() => setStatus(''), 3000);
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

        // Cleanup
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        setAudioLevel(0);
      }, 500);
    }
  }, [mode, contextText, selectedImage]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('✅ تم النسخ!');
    setTimeout(() => setStatus(''), 2000);
  };

  const downloadAll = () => {
    const fullText = transcriptSegments.map((seg, idx) =>
      `[${idx + 1}] ${seg.timestamp} - ${seg.mode.toUpperCase()} (${seg.language})\n${seg.text}\n${seg.hasContext ? '📌 مع سياق\n' : ''}${seg.hasImage ? '🖼️ مع صورة\n' : ''}\n`
    ).join('\n---\n\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smart-transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (confirm('هل أنت متأكد من حذف جميع النصوص؟')) {
      setTranscriptSegments([]);
      setStatus('');
    }
  };

  const getModeIcon = (m: TranscriptionMode) => {
    switch (m) {
      case 'accurate': return '🎯';
      case 'summary': return '📝';
      case 'keywords': return '🔑';
    }
  };

  const getModeColor = (m: TranscriptionMode) => {
    switch (m) {
      case 'accurate': return 'from-blue-500 to-cyan-500';
      case 'summary': return 'from-green-500 to-emerald-500';
      case 'keywords': return 'from-purple-500 to-pink-500';
    }
  };

  const totalWords = transcriptSegments.reduce((sum, seg) => sum + seg.wordCount, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-cyan-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse delay-700"></div>
      </div>

      <div className="relative max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-5xl font-bold text-white mb-2 flex items-center gap-3">
              <span className="text-6xl">🧠</span>
              التجربة 11
            </h1>
            <p className="text-gray-200 text-lg">
              تفريغ ذكي متعدد الوسائط - صوت + صورة + سياق 🚀
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
            <div className="text-sm text-gray-200">تفريغات</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-white">{totalWords}</div>
            <div className="text-sm text-gray-200">كلمة</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-cyan-300">{getModeIcon(mode)}</div>
            <div className="text-sm text-gray-200 capitalize">{mode}</div>
          </div>
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/30">
            <div className="text-4xl font-bold text-yellow-300">🧠 Smart</div>
            <div className="text-sm text-gray-200">Gemini 2.0</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1 space-y-4">
            {/* Mode Selection */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/30">
              <h3 className="text-xl font-bold text-white mb-4">⚙️ وضع التفريغ</h3>
              <div className="space-y-3">
                <button
                  onClick={() => !isRecording && setMode('accurate')}
                  disabled={isRecording}
                  className={`w-full px-4 py-4 rounded-xl font-bold transition-all ${
                    mode === 'accurate'
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white scale-105'
                      : 'bg-white/20 text-gray-300 hover:bg-white/30'
                  }`}
                >
                  🎯 دقيق (Accurate)
                </button>
                <button
                  onClick={() => !isRecording && setMode('summary')}
                  disabled={isRecording}
                  className={`w-full px-4 py-4 rounded-xl font-bold transition-all ${
                    mode === 'summary'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white scale-105'
                      : 'bg-white/20 text-gray-300 hover:bg-white/30'
                  }`}
                >
                  📝 ملخص (Summary)
                </button>
                <button
                  onClick={() => !isRecording && setMode('keywords')}
                  disabled={isRecording}
                  className={`w-full px-4 py-4 rounded-xl font-bold transition-all ${
                    mode === 'keywords'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white scale-105'
                      : 'bg-white/20 text-gray-300 hover:bg-white/30'
                  }`}
                >
                  🔑 كلمات مفتاحية
                </button>
              </div>
            </div>

            {/* Context Input */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/30">
              <h3 className="text-xl font-bold text-white mb-4">📌 السياق (اختياري)</h3>
              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                disabled={isRecording}
                placeholder="مثال: اجتماع عن المشروع الجديد..."
                className="w-full px-4 py-3 bg-white/20 text-white placeholder-gray-400 rounded-xl border border-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                rows={3}
              />
            </div>

            {/* Image Upload */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/30">
              <h3 className="text-xl font-bold text-white mb-4">🖼️ صورة (اختياري)</h3>
              {!imagePreview ? (
                <label className="cursor-pointer block">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    disabled={isRecording}
                    className="hidden"
                  />
                  <div className="border-2 border-dashed border-gray-400 rounded-xl p-8 text-center hover:border-cyan-500 transition-colors">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-2 text-gray-300">اختر صورة</p>
                  </div>
                </label>
              ) : (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full rounded-xl" />
                  <button
                    onClick={removeImage}
                    disabled={isRecording}
                    className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Recording Button */}
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/30">
              <div className="flex flex-col items-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    disabled={isProcessing}
                    className="w-40 h-40 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-105 disabled:opacity-50 bg-gradient-to-br from-cyan-400 to-blue-600 hover:from-cyan-500 hover:to-blue-700 flex items-center justify-center"
                  >
                    <div className="flex flex-col items-center">
                      <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                      </svg>
                      <span className="text-xl">ابدأ</span>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={stopRecording}
                      className="w-40 h-40 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-105 bg-gradient-to-br from-red-500 to-rose-600 animate-pulse relative z-10 flex items-center justify-center"
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-xl">إيقاف</span>
                      </div>
                    </button>
                    <div className="absolute inset-0 bg-red-500 rounded-full opacity-20 animate-ping pointer-events-none"></div>
                  </div>
                )}

                {/* Audio Visualizer */}
                {isRecording && (
                  <div className="mt-8 w-full">
                    <div className="flex items-center justify-center gap-1 h-24 mb-3">
                      {[...Array(15)].map((_, i) => {
                        const threshold = (i + 1) * 6.67;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`w-2 rounded-full transition-all duration-100 ${
                              isActive
                                ? 'bg-gradient-to-t from-cyan-400 to-blue-500'
                                : 'bg-white/20'
                            }`}
                            style={{
                              height: isActive ? `${Math.min(96, threshold + 20)}px` : '12px'
                            }}
                          />
                        );
                      })}
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">{audioLevel.toFixed(0)}%</div>
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
                    onClick={downloadAll}
                    className="w-full px-6 py-4 bg-green-500/90 hover:bg-green-600 text-white rounded-xl font-bold transition-all"
                  >
                    📄 تحميل الكل
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
            <h2 className="text-3xl font-bold text-white mb-6 sticky top-0 bg-gradient-to-b from-gray-900/90 to-transparent pb-3">
              📝 النصوص المفرغة
            </h2>

            {transcriptSegments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <div className="text-9xl mb-8 animate-bounce">🧠</div>
                <h3 className="text-3xl font-bold text-white mb-3">تفريغ ذكي!</h3>
                <p className="text-xl text-gray-200 mb-4">
                  اختر وضع التفريغ، أضف سياقاً وصورة (اختياري)
                </p>
                <p className="text-lg text-gray-300">
                  ثم ابدأ التسجيل للحصول على تفريغ دقيق ⚡
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
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-yellow-300">#{idx + 1}</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r ${getModeColor(segment.mode)} text-white`}>
                          {getModeIcon(segment.mode)} {segment.mode}
                        </span>
                        <span className="px-3 py-1 rounded-full text-sm font-bold bg-white/20 text-gray-200">
                          {segment.language === 'arabic' ? '🇸🇦 عربي' : segment.language === 'english' ? '🇬🇧 English' : '🌍 Mixed'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-300">
                        {segment.hasImage && <span>🖼️</span>}
                        {segment.hasContext && <span>📌</span>}
                        <span>📊 {segment.wordCount} كلمة</span>
                        <span>⏱️ {segment.duration}ms</span>
                        <span>🕐 {segment.timestamp}</span>
                      </div>
                    </div>

                    <p className="text-xl text-white leading-relaxed text-right mb-4">
                      {segment.text}
                    </p>

                    <button
                      onClick={() => copyText(segment.text)}
                      className="px-4 py-2 bg-blue-500/80 hover:bg-blue-600 text-white rounded-lg font-semibold transition-all text-sm"
                    >
                      📋 نسخ
                    </button>
                  </div>
                ))}

                {isProcessing && (
                  <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-2xl p-6">
                    <p className="text-yellow-200 text-center text-lg animate-pulse">
                      ⚡ جاري المعالجة الذكية...
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Features Info */}
        <div className="mt-8 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 backdrop-blur-md rounded-3xl p-8 border border-white/30">
          <h3 className="text-2xl font-bold text-white mb-5">✨ المميزات الذكية</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-lg text-gray-200">
            <div>🎯 <strong>3 أوضاع</strong> - دقيق، ملخص، كلمات مفتاحية</div>
            <div>🖼️ <strong>دعم الصور</strong> - تحليل بصري مع الصوت</div>
            <div>📌 <strong>السياق الذكي</strong> - فهم أفضل للمحتوى</div>
          </div>
        </div>
      </div>
    </div>
  );
}
