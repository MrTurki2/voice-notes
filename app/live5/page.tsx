'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface CVData {
  personalInfo: {
    fullName: string;
    age: string;
    gender: string;
    nationality: string;
    phone: string;
    email: string;
    location: string;
    title: string;
  };
  summary: string;
  experience: Array<{
    company: string;
    position: string;
    period: string;
    description: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
    field: string;
    year: string;
  }>;
  skills: {
    technical: string[];
    soft: string[];
  };
  languages: Array<{
    language: string;
    level: string;
  }>;
  certificates: string[];
  hobbies: string[];
}

const initialCV: CVData = {
  personalInfo: {
    fullName: '',
    age: '',
    gender: '',
    nationality: '',
    phone: '',
    email: '',
    location: '',
    title: ''
  },
  summary: '',
  experience: [],
  education: [],
  skills: {
    technical: [],
    soft: []
  },
  languages: [],
  certificates: [],
  hobbies: []
};

export default function Live5Page() {
  const searchParams = useSearchParams();
  const cvId = searchParams.get('id');

  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [liveText, setLiveText] = useState<string>('');
  const [transcriptHistory, setTranscriptHistory] = useState<string[]>([]);
  const [cv, setCV] = useState<CVData>(initialCV);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [cvTitle, setCVTitle] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSpeechTimeRef = useRef<number>(0);

  const SILENCE_THRESHOLD = 2000;
  const MIN_SPEECH_DURATION = 1000;
  const VOLUME_THRESHOLD = 15;

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0) return;

    const duration = Date.now() - startTimeRef.current;
    if (duration < MIN_SPEECH_DURATION) {
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    setLiveText('🔄 جاري التفريغ...');
    setStatus('⚡ تحليل الصوت...');
    setIsProcessing(true);

    try {
      // Step 1: Transcribe audio with Groq
      const audioFile = new File([audioBlob], `speech-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      const formData = new FormData();
      formData.append('file', audioFile);

      const transcribeResponse = await fetch('/api/transcribe-groq', {
        method: 'POST',
        body: formData,
      });

      const transcribeData = await transcribeResponse.json();

      if (transcribeData.success && transcribeData.text.trim()) {
        const transcribedText = transcribeData.text;
        setTranscriptHistory(prev => [...prev, transcribedText]);
        setLiveText('');
        setStatus('🧠 استخراج معلومات السيرة الذاتية...');

        // Step 2: Extract CV data using GPT-4O-mini
        const extractResponse = await fetch('/api/extract-cv', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: transcribedText,
            currentCV: cv
          }),
        });

        const extractData = await extractResponse.json();

        if (extractData.success) {
          setCV(extractData.cv);
          setStatus('✅ تم تحديث السيرة الذاتية!');
          setTimeout(() => setStatus(''), 2000);
        } else {
          setStatus('⚠️ فشل استخراج البيانات');
          setTimeout(() => setStatus(''), 3000);
        }
      } else {
        setLiveText('');
        setStatus('');
      }
    } catch (error) {
      console.error('Processing error:', error);
      setStatus('❌ خطأ في المعالجة');
      setLiveText('');
      setTimeout(() => setStatus(''), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  const analyzeAudio = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const volumeLevel = (average / 255) * 100;
    setAudioLevel(volumeLevel);

    const now = Date.now();
    const wasSpeaking = isSpeaking;

    if (volumeLevel > VOLUME_THRESHOLD) {
      if (!wasSpeaking) {
        setIsSpeaking(true);
        setLiveText('🎤 أستمع...');
      }
      lastSpeechTimeRef.current = now;

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (wasSpeaking) {
      const silenceDuration = now - lastSpeechTimeRef.current;

      if (silenceDuration >= SILENCE_THRESHOLD) {
        setIsSpeaking(false);
        setLiveText('');
        processAudioChunk();
      } else if (!silenceTimeoutRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          setIsSpeaking(false);
          setLiveText('');
          processAudioChunk();
          silenceTimeoutRef.current = null;
        }, SILENCE_THRESHOLD - silenceDuration);
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [isRecording, isSpeaking, cv]);

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
      lastSpeechTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setStatus('🎤 ابدأ بالحديث عن نفسك...');

      analyzeAudio();
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

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

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
        setStatus('⏸️ تم الإيقاف');
      }, 300);
    }
  }, [cv]);

  // Load CV if ID is provided
  useEffect(() => {
    if (cvId) {
      loadCV(parseInt(cvId));
    }
  }, [cvId]);

  // Calculate completion percentage whenever CV changes
  useEffect(() => {
    const percentage = calculateCompletion(cv);
    setCompletionPercentage(percentage);
  }, [cv]);

  useEffect(() => {
    return () => {
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

  const calculateCompletion = (cvData: CVData): number => {
    const fields = [
      cvData.personalInfo?.fullName ? 5 : 0,
      cvData.personalInfo?.age ? 3 : 0,
      cvData.personalInfo?.phone ? 4 : 0,
      cvData.personalInfo?.email ? 5 : 0,
      cvData.personalInfo?.location ? 3 : 0,
      cvData.personalInfo?.title ? 5 : 0,
      cvData.personalInfo?.nationality ? 2 : 0,
      cvData.personalInfo?.gender ? 3 : 0,
      cvData.summary && cvData.summary.length > 20 ? 10 : 0,
      cvData.experience && cvData.experience.length > 0 ? 25 : 0,
      cvData.education && cvData.education.length > 0 ? 15 : 0,
      cvData.skills?.technical?.length > 0 || cvData.skills?.soft?.length > 0 ? 10 : 0,
      cvData.languages && cvData.languages.length > 0 ? 5 : 0,
      cvData.certificates && cvData.certificates.length > 0 ? 3 : 0,
      cvData.hobbies && cvData.hobbies.length > 0 ? 2 : 0,
    ];
    return fields.reduce((sum, val) => sum + val, 0);
  };

  const getMissingFields = () => {
    const missing = [];
    if (!cv.personalInfo.fullName) missing.push('الاسم');
    if (!cv.personalInfo.phone) missing.push('الهاتف');
    if (!cv.personalInfo.email) missing.push('البريد');
    if (!cv.personalInfo.age) missing.push('العمر');
    if (!cv.personalInfo.location) missing.push('الموقع');
    if (!cv.personalInfo.title) missing.push('المسمى الوظيفي');
    if (!cv.summary || cv.summary.length < 20) missing.push('الملخص');
    if (!cv.experience || cv.experience.length === 0) missing.push('الخبرات');
    if (!cv.education || cv.education.length === 0) missing.push('التعليم');
    if (!cv.skills || (cv.skills.technical.length === 0 && cv.skills.soft.length === 0)) missing.push('المهارات');
    if (!cv.languages || cv.languages.length === 0) missing.push('اللغات');
    return missing;
  };

  const loadCV = async (id: number) => {
    try {
      const response = await fetch(`/api/cvs/${id}`);
      const data = await response.json();
      if (data.success) {
        setCV(data.cv.data);
        setCVTitle(data.cv.title);
      }
    } catch (error) {
      console.error('Failed to load CV:', error);
    }
  };

  const saveCV = async () => {
    if (!cvTitle.trim()) {
      alert('الرجاء إدخال عنوان للسيرة الذاتية');
      return;
    }

    try {
      setStatus('💾 جاري الحفظ...');

      if (cvId) {
        // Update existing CV
        const response = await fetch(`/api/cvs/${cvId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: cv })
        });

        const data = await response.json();
        if (data.success) {
          setStatus('✅ تم التحديث بنجاح!');
          setTimeout(() => setStatus(''), 2000);
        }
      } else {
        // Create new CV
        const response = await fetch('/api/cvs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: cvTitle, data: cv })
        });

        const data = await response.json();
        if (data.success) {
          setStatus('✅ تم الحفظ بنجاح!');
          window.history.pushState({}, '', `/live5?id=${data.id}`);
          setTimeout(() => setStatus(''), 2000);
        }
      }

      setShowSaveDialog(false);
    } catch (error) {
      console.error('Failed to save CV:', error);
      setStatus('❌ فشل الحفظ');
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const exportToJSON = () => {
    const json = JSON.stringify(cv, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cv-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetCV = () => {
    if (confirm('هل أنت متأكد من مسح جميع البيانات؟')) {
      setCV(initialCV);
      setTranscriptHistory([]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">
              💼 {cvId ? 'تعديل السيرة الذاتية' : 'كاتب السيرة الذاتية الذكي'}
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-sm">
              تكلم بحرية - سأستخرج المعلومات وأكتب سيرتك الذاتية تلقائياً! 🧠
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/cvs" className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm">
              📋 القائمة
            </Link>
            <Link href="/" className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm">
              ← الرئيسية
            </Link>
          </div>
        </div>

        {/* Completion Indicator */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800 dark:text-white">
              مؤشر اكتمال السيرة الذاتية
            </h3>
            <span className={`text-lg font-bold px-3 py-1 rounded ${
              completionPercentage >= 80 ? 'bg-green-100 text-green-600' :
              completionPercentage >= 50 ? 'bg-yellow-100 text-yellow-600' :
              'bg-red-100 text-red-600'
            }`}>
              {completionPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`h-full transition-all ${
                completionPercentage >= 80
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                  : completionPercentage >= 50
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                  : 'bg-gradient-to-r from-red-400 to-pink-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          {completionPercentage < 100 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600 dark:text-gray-400">باقي:</span>
              <div className="flex flex-wrap gap-1">
                {getMissingFields().slice(0, 5).map((field, idx) => (
                  <span key={idx} className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded">
                    {field}
                  </span>
                ))}
                {getMissingFields().length > 5 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    +{getMissingFields().length - 5} أخرى
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-cyan-100 to-blue-100 dark:from-cyan-900/30 dark:to-blue-900/30 rounded-lg p-3 mb-4 border-l-4 border-cyan-500">
          <h3 className="font-bold text-gray-800 dark:text-white mb-1 text-sm">💡 كيف تعمل؟</h3>
          <ul className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5">
            <li>🎤 <strong>تكلم طبيعياً:</strong> مثلاً "اسمي أحمد، عمري 28 سنة، أعمل مطور برامج"</li>
            <li>🧠 <strong>الذكاء الاصطناعي:</strong> يفهم كلامك ويستخرج المعلومات تلقائياً</li>
            <li>📝 <strong>كتابة فورية:</strong> تشوف السيرة تتحدث قدامك مباشرة!</li>
            <li>✏️ <strong>تعديل سهل:</strong> قل "عدّل" وأضف المعلومة الصحيحة</li>
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
                    className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50"
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
                      className={`w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 relative z-10 ${
                        isSpeaking
                          ? 'bg-gradient-to-br from-green-500 to-emerald-600 animate-pulse'
                          : 'bg-gradient-to-br from-red-500 to-pink-600'
                      }`}
                    >
                      <div className="flex flex-col items-center">
                        <svg className="w-14 h-14 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                          <rect x="6" y="6" width="8" height="8" rx="1" />
                        </svg>
                        <span className="text-xs">إيقاف</span>
                      </div>
                    </button>
                    {isSpeaking && (
                      <div className="absolute inset-0 bg-green-500 rounded-full opacity-30 animate-ping pointer-events-none" />
                    )}
                  </div>
                )}

                {/* Audio Level */}
                {isRecording && (
                  <div className="mt-4 w-full">
                    <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden relative">
                      <div
                        className={`h-full transition-all duration-100 ${
                          isSpeaking ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-cyan-400 to-blue-500'
                        }`}
                        style={{ width: `${audioLevel}%` }}
                      />
                      <div className="absolute top-0 bottom-0 w-0.5 bg-red-500/50" style={{ left: `${VOLUME_THRESHOLD}%` }} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                      {audioLevel.toFixed(0)}%
                    </p>
                  </div>
                )}

                {/* Status */}
                <div className="mt-4 text-center">
                  {status && (
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {status}
                    </p>
                  )}
                  {liveText && isRecording && (
                    <p className={`mt-1 font-bold text-sm ${isSpeaking ? 'text-green-600' : 'text-cyan-600'}`}>
                      {liveText}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Transcript History */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">
                  📝 ما قلته ({transcriptHistory.length})
                </h3>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {transcriptHistory.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">
                    ابدأ بالتحدث لرؤية النصوص هنا...
                  </p>
                ) : (
                  transcriptHistory.map((text, idx) => (
                    <div key={idx} className="p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-right">
                      {text}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Side: CV Preview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-h-[800px] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                📄 السيرة الذاتية
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold"
                >
                  💾 حفظ في القاعدة
                </button>
                <button
                  onClick={exportToJSON}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                >
                  📥 JSON
                </button>
                <button
                  onClick={resetCV}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
                >
                  🗑️ مسح
                </button>
              </div>
            </div>

            {/* Personal Info */}
            <div className="mb-4">
              <h3 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mb-2 text-center">
                {cv.personalInfo.fullName || 'الاسم الكامل'}
              </h3>
              {cv.personalInfo.title && (
                <p className="text-lg text-gray-600 dark:text-gray-400 text-center mb-2">
                  {cv.personalInfo.title}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {cv.personalInfo.age && <div><strong>العمر:</strong> {cv.personalInfo.age}</div>}
                {cv.personalInfo.gender && <div><strong>الجنس:</strong> {cv.personalInfo.gender}</div>}
                {cv.personalInfo.nationality && <div><strong>الجنسية:</strong> {cv.personalInfo.nationality}</div>}
                {cv.personalInfo.location && <div><strong>الموقع:</strong> {cv.personalInfo.location}</div>}
                {cv.personalInfo.phone && <div><strong>الهاتف:</strong> {cv.personalInfo.phone}</div>}
                {cv.personalInfo.email && <div><strong>البريد:</strong> {cv.personalInfo.email}</div>}
              </div>
            </div>

            <hr className="my-4 border-gray-200 dark:border-gray-700" />

            {/* Summary */}
            {cv.summary && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">📌 الملخص الشخصي</h4>
                <p className="text-xs text-gray-700 dark:text-gray-300 text-right leading-relaxed">
                  {cv.summary}
                </p>
              </div>
            )}

            {/* Experience */}
            {cv.experience.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">💼 الخبرات العملية</h4>
                <div className="space-y-3">
                  {cv.experience.map((exp, idx) => (
                    <div key={idx} className="border-r-2 border-cyan-500 pr-3">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{exp.position}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{exp.company} • {exp.period}</p>
                      {exp.description && (
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 text-right">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {cv.education.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">🎓 التعليم</h4>
                <div className="space-y-2">
                  {cv.education.map((edu, idx) => (
                    <div key={idx} className="border-r-2 border-blue-500 pr-3">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">{edu.degree}</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {edu.institution} • {edu.field} • {edu.year}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {(cv.skills.technical.length > 0 || cv.skills.soft.length > 0) && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">🛠️ المهارات</h4>
                {cv.skills.technical.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">تقنية:</p>
                    <div className="flex flex-wrap gap-1">
                      {cv.skills.technical.map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200 rounded text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {cv.skills.soft.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">شخصية:</p>
                    <div className="flex flex-wrap gap-1">
                      {cv.skills.soft.map((skill, idx) => (
                        <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Languages */}
            {cv.languages.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">🌍 اللغات</h4>
                <div className="grid grid-cols-2 gap-2">
                  {cv.languages.map((lang, idx) => (
                    <div key={idx} className="text-xs">
                      <strong>{lang.language}:</strong> {lang.level}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Certificates */}
            {cv.certificates.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">🏆 الشهادات</h4>
                <ul className="list-disc list-inside space-y-1">
                  {cv.certificates.map((cert, idx) => (
                    <li key={idx} className="text-xs text-gray-700 dark:text-gray-300">{cert}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Hobbies */}
            {cv.hobbies.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-800 dark:text-white mb-2">🎨 الهوايات</h4>
                <div className="flex flex-wrap gap-1">
                  {cv.hobbies.map((hobby, idx) => (
                    <span key={idx} className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded text-xs">
                      {hobby}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {!cv.personalInfo.fullName && cv.experience.length === 0 && cv.education.length === 0 && (
              <div className="flex items-center justify-center h-40">
                <p className="text-gray-400 text-center">
                  ابدأ بالتحدث عن نفسك<br />
                  <span className="text-xs">مثال: اسمي أحمد، عمري 28 سنة...</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save Dialog */}
        {showSaveDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSaveDialog(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                {cvId ? 'تحديث السيرة الذاتية' : 'حفظ السيرة الذاتية'}
              </h3>
              <input
                type="text"
                value={cvTitle}
                onChange={(e) => setCVTitle(e.target.value)}
                placeholder="مثال: سيرة ذاتية - تركي الجابر"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-4 text-right dark:bg-gray-700 dark:text-white"
              />
              <div className="flex gap-3">
                <button
                  onClick={saveCV}
                  className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold"
                >
                  {cvId ? '✅ تحديث' : '💾 حفظ'}
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
