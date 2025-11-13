'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';

export default function Live8Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [partialText, setPartialText] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [useGroq, setUseGroq] = useState(true);
  const [chunkSize, setChunkSize] = useState(5); // seconds - default to 5 for better quality

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processingRef = useRef<boolean>(false);

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
    if (processingRef.current || audioChunksRef.current.length === 0) {
      return;
    }

    processingRef.current = true;
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];

    // Log chunk info
    console.log('📦 Processing chunk:', {
      size: audioBlob.size,
      chunks: audioChunksRef.current.length,
      type: audioBlob.type
    });

    // Check minimum size (5KB for better quality)
    if (audioBlob.size < 5000) {
      console.log('⚠️ Chunk too small, skipping (size:', audioBlob.size, 'bytes - need at least 5KB)');
      setStatus('⚠️ القطعة صغيرة جداً - تكلم أكثر!');
      processingRef.current = false;
      return;
    }

    try {
      console.log('✅ Chunk size OK, sending to API...');
      setPartialText('⏳ معالجة...');

      const audioFile = new File([audioBlob], `chunk-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const apiEndpoint = useGroq ? '/api/transcribe-groq' : '/api/transcribe';

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      console.log('📥 API Response:', data);

      if (data.success && data.text && data.text.trim()) {
        const newText = data.text.trim();
        console.log('✅ Text received:', newText);
        setTranscriptText(prev => prev ? `${prev} ${newText}` : newText);
        setPartialText('');
        setStatus(`✅ ${useGroq ? 'Groq' : 'OpenAI'} - تم التفريغ`);
      } else {
        console.log('⚠️ No text in response');
        setPartialText('');
        setStatus('⚠️ لم يتم التعرف على كلام');
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
      setPartialText('❌ خطأ في الاتصال');
      setStatus('❌ خطأ - حاول مرة أخرى');
      setTimeout(() => {
        setPartialText('');
      }, 2000);
    } finally {
      processingRef.current = false;
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

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus(`🎤 تسجيل مباشر - تفريغ كل ${chunkSize} ثانية عبر ${useGroq ? 'Groq' : 'OpenAI'}`);
      setTranscriptText('');
      setPartialText('');

      monitorAudioLevel();

      // Process chunks at specified interval
      intervalRef.current = setInterval(() => {
        processChunk();
      }, chunkSize * 1000);

    } catch (error) {
      console.error('Recording error:', error);
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
      setStatus('❌ فشل الوصول للمايك');
    }
  }, [monitorAudioLevel, chunkSize, useGroq]);

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
    setTranscriptText('');
    setPartialText('');
    setStatus('');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcriptText);
    setStatus('✅ تم النسخ!');
    setTimeout(() => setStatus(''), 2000);
  };

  const downloadText = () => {
    const blob = new Blob([transcriptText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">
              🚀 تجربة 8: التفريغ السريع المحسّن
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              تفريغ فوري بسرعة قصوى مع خيارات متقدمة! ⚡
            </p>
          </div>
          <Link href="/" className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm">
            ← الرئيسية
          </Link>
        </div>

        {/* Settings */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
          <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">⚙️ الإعدادات</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* API Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                اختر المحرك
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => !isRecording && setUseGroq(true)}
                  disabled={isRecording}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    useGroq
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  } ${isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                  ⚡ Groq (فائق السرعة)
                </button>
                <button
                  onClick={() => !isRecording && setUseGroq(false)}
                  disabled={isRecording}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    !useGroq
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  } ${isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
                >
                  🤖 OpenAI (دقيق)
                </button>
              </div>
            </div>

            {/* Chunk Size */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                التفريغ كل: {chunkSize} ثانية
              </label>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={chunkSize}
                onChange={(e) => !isRecording && setChunkSize(Number(e.target.value))}
                disabled={isRecording}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span>1 ثانية (سريع جداً)</span>
                <span>10 ثواني (أبطأ)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recording Controls */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex flex-col items-center">
                {!isRecording ? (
                  <button
                    onClick={startRecording}
                    className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                  >
                    <div className="flex flex-col items-center">
                      <svg className="w-14 h-14 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                      </svg>
                      <span className="text-xs">ابدأ الآن</span>
                    </div>
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      onClick={stopRecording}
                      className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-red-500 to-rose-600 animate-pulse relative z-10"
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
                  <div className="mt-6 w-full">
                    <div className="flex items-center justify-center gap-1 h-20">
                      {[...Array(20)].map((_, i) => {
                        const threshold = (i + 1) * 5;
                        const isActive = audioLevel > threshold;
                        return (
                          <div
                            key={i}
                            className={`w-1.5 rounded-full transition-all duration-100 ${
                              isActive
                                ? 'bg-gradient-to-t from-purple-500 to-pink-500'
                                : 'bg-gray-300 dark:bg-gray-600'
                            }`}
                            style={{
                              height: isActive ? `${Math.min(80, threshold)}px` : '8px'
                            }}
                          />
                        );
                      })}
                    </div>
                    <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
                      {audioLevel.toFixed(0)}% 🔊
                    </p>
                  </div>
                )}

                {/* Status */}
                <div className="mt-4 text-center w-full">
                  {status && (
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-lg">
                      {status}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            {transcriptText && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">📋 الإجراءات</h3>
                <div className="space-y-2">
                  <button
                    onClick={copyToClipboard}
                    className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    📋 نسخ النص
                  </button>
                  <button
                    onClick={downloadText}
                    className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    💾 تحميل ملف
                  </button>
                  <button
                    onClick={clearTranscript}
                    className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    🗑️ مسح الكل
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Transcript Display */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 min-h-[500px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                📝 النص المباشر
              </h2>
              {transcriptText && (
                <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-xs font-bold">
                  {transcriptText.split(' ').length} كلمة
                </span>
              )}
            </div>

            <div className="prose prose-lg max-w-none">
              {!transcriptText && !partialText ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="text-6xl mb-4">🎤</div>
                  <p className="text-gray-400 text-lg font-semibold mb-2">
                    جاهز للتسجيل
                  </p>
                  <p className="text-gray-500 text-sm">
                    اضبط الإعدادات واضغط "ابدأ الآن"
                  </p>
                </div>
              ) : (
                <div className="text-gray-800 dark:text-white text-right leading-relaxed whitespace-pre-wrap text-lg">
                  {transcriptText}
                  {partialText && (
                    <span className="text-purple-600 dark:text-purple-400 ml-1 animate-pulse">
                      {partialText}
                    </span>
                  )}
                  {isRecording && <span className="inline-block w-1 h-6 bg-purple-500 ml-1 animate-pulse" />}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-4 bg-gradient-to-r from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-lg p-4 border-l-4 border-purple-500">
          <h3 className="font-bold text-gray-800 dark:text-white mb-2 text-sm">💡 نصائح للحصول على أفضل نتيجة:</h3>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-1">
            <li>🎯 <strong>Groq</strong>: أسرع (0.5 ثانية) - مثالي للتفريغ الفوري</li>
            <li>🎯 <strong>OpenAI</strong>: أدق - مثالي للمحتوى الهام</li>
            <li>⏱️ <strong>1-2 ثانية</strong>: تفريغ فوري جداً لكن قد يفقد بعض الكلمات</li>
            <li>⏱️ <strong>3-5 ثواني</strong>: التوازن المثالي بين السرعة والدقة</li>
            <li>⏱️ <strong>6-10 ثواني</strong>: دقة عالية مع تأخير أقل</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
