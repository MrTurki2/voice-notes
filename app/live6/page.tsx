'use client';

import { useState, useRef, useCallback } from 'react';

interface CVData {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience: Array<{
    company: string;
    position: string;
    period: string;
  }>;
  education: Array<{
    degree: string;
    field: string;
    year: string;
  }>;
}

const initialCV: CVData = {
  name: '',
  email: '',
  phone: '',
  skills: [],
  experience: [],
  education: []
};

export default function Live6Page() {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [cv, setCV] = useState<CVData>(initialCV);
  const [completionPercentage, setCompletionPercentage] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const calculateCompletion = useCallback((cvData: CVData) => {
    let filled = 0;
    const total = 6;

    if (cvData.name) filled++;
    if (cvData.email) filled++;
    if (cvData.phone) filled++;
    if (cvData.skills.length > 0) filled++;
    if (cvData.experience.length > 0) filled++;
    if (cvData.education.length > 0) filled++;

    return Math.round((filled / total) * 100);
  }, []);

  const processAudioChunk = async () => {
    if (audioChunksRef.current.length === 0) {
      console.log('No audio chunks to process');
      return;
    }

    const duration = Date.now() - startTimeRef.current;
    console.log('Audio duration:', duration, 'ms');

    if (duration < MIN_SPEECH_DURATION) {
      console.log('Duration too short, skipping');
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      return;
    }

    console.log('Creating audio blob from', audioChunksRef.current.length, 'chunks');
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    console.log('Audio blob size:', audioBlob.size, 'bytes');

    audioChunksRef.current = [];
    startTimeRef.current = Date.now();

    try {
      setIsProcessing(true);
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');

      console.log('Sending to /api/transcribe...');
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      console.log('Transcription response:', data);

      if (data.success && data.text) {
        console.log('✅ Transcribed text:', data.text);
        // Extract CV info from transcript
        await extractCVInfo(data.text);
      } else {
        console.error('❌ Transcription failed:', data);
      }
    } catch (error) {
      console.error('❌ Transcription error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const extractCVInfo = async (transcript: string) => {
    try {
      console.log('🔍 Extracting CV from transcript:', transcript);
      console.log('Current CV state:', cv);

      const response = await fetch('/api/extract-cv-simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript, currentCV: cv }),
      });

      const data = await response.json();
      console.log('📄 CV extraction response:', data);

      if (data.success && data.cv) {
        console.log('✅ New CV data received:', data.cv);

        // Check if we're actually adding new data or just getting empty values
        const hasNewData =
          (data.cv.name && data.cv.name !== cv.name) ||
          (data.cv.email && data.cv.email !== cv.email) ||
          (data.cv.phone && data.cv.phone !== cv.phone) ||
          data.cv.skills.length > cv.skills.length ||
          data.cv.experience.length > cv.experience.length ||
          data.cv.education.length > cv.education.length;

        if (hasNewData) {
          console.log('✅ Updating CV with new data');
          setCV(data.cv);
          const completion = calculateCompletion(data.cv);
          console.log('📊 Completion:', completion, '%');
          setCompletionPercentage(completion);
        } else {
          console.log('ℹ️ No new data to add, keeping current CV');
        }
      } else {
        console.error('❌ CV extraction failed:', data);
      }
    } catch (error) {
      console.error('❌ CV extraction error:', error);
    }
  };

  const analyzeAudio = useCallback(() => {
    if (!isRecording || !analyserRef.current) {
      if (!isRecording) console.log('⏸️ Not recording, skipping analysis');
      if (!analyserRef.current) console.log('⏸️ No analyser, skipping analysis');
      return;
    }

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    setAudioLevel(normalizedLevel);

    // Log audio level periodically
    if (Math.random() < 0.01) { // 1% of the time
      console.log('🔊 Audio level:', normalizedLevel.toFixed(1), '/ Threshold:', VOLUME_THRESHOLD);
    }

    const currentTime = Date.now();
    const isCurrentlySpeaking = normalizedLevel > VOLUME_THRESHOLD;

    if (isCurrentlySpeaking) {
      lastSpeechTimeRef.current = currentTime;

      if (!isSpeaking) {
        console.log('🗣️ Speech detected! Starting to record...');
        setIsSpeaking(true);
      }

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
    } else if (isSpeaking) {
      const silenceDuration = currentTime - lastSpeechTimeRef.current;

      if (silenceDuration >= SILENCE_THRESHOLD) {
        console.log('🤫 Silence detected after', silenceDuration, 'ms. Processing audio...');
        setIsSpeaking(false);
        processAudioChunk();
      } else if (!silenceTimeoutRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          console.log('⏱️ Silence timeout reached. Processing audio...');
          setIsSpeaking(false);
          processAudioChunk();
          silenceTimeoutRef.current = null;
        }, SILENCE_THRESHOLD - silenceDuration);
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeAudio);
  }, [isRecording, isSpeaking, cv, calculateCompletion]);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎤 Starting recording...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ Got media stream');
      streamRef.current = stream;

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;
      source.connect(analyserRef.current);

      console.log('✅ Audio context and analyser set up');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      });

      console.log('✅ MediaRecorder created');

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      lastSpeechTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('📦 Audio data received:', event.data.size, 'bytes');
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);
      console.log('✅ MediaRecorder started');
      setIsRecording(true);

      analyzeAudio();
      console.log('✅ Audio analysis started');
    } catch (error) {
      console.error('❌ Recording error:', error);
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
    }
  }, [analyzeAudio]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsSpeaking(false);

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
      }, 300);
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-800 text-center">سيرة ذاتية</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {/* Progress Bar */}
        <div className="mb-6 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">نسبة الإكتمال</span>
            <span className="text-lg font-bold text-indigo-600">{completionPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>

        {/* CV Fields */}
        <div className="space-y-4">
          {/* Personal Info */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">المعلومات الشخصية</h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <span className="text-sm text-gray-600 w-20">الاسم:</span>
                <span className="text-base font-medium text-gray-800 flex-1">
                  {cv.name || <span className="text-gray-400">----</span>}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-sm text-gray-600 w-20">البريد:</span>
                <span className="text-base font-medium text-gray-800 flex-1 text-left" dir="ltr">
                  {cv.email || <span className="text-gray-400">----</span>}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-sm text-gray-600 w-20">الجوال:</span>
                <span className="text-base font-medium text-gray-800 flex-1 text-left" dir="ltr">
                  {cv.phone || <span className="text-gray-400">----</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">المهارات</h2>
            {cv.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cv.skills.map((skill, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">----</p>
            )}
          </div>

          {/* Experience */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">الخبرات العملية</h2>
            {cv.experience.length > 0 ? (
              <div className="space-y-3">
                {cv.experience.map((exp, index) => (
                  <div key={index} className="border-r-2 border-indigo-200 pr-3">
                    <h3 className="font-medium text-gray-800">{exp.position}</h3>
                    <p className="text-sm text-gray-600">{exp.company}</p>
                    <p className="text-xs text-gray-500 mt-1">{exp.period}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">----</p>
            )}
          </div>

          {/* Education */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">التعليم</h2>
            {cv.education.length > 0 ? (
              <div className="space-y-3">
                {cv.education.map((edu, index) => (
                  <div key={index} className="border-r-2 border-purple-200 pr-3">
                    <h3 className="font-medium text-gray-800">{edu.degree} - {edu.field}</h3>
                    <p className="text-xs text-gray-500 mt-1">{edu.year}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">----</p>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Mic Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 py-3 safe-bottom">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          {/* Status Indicator */}
          <div className="flex-1 flex items-center gap-2">
            {isProcessing && (
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
              </div>
            )}
            {!isProcessing && isSpeaking && (
              <div className="flex items-center gap-1">
                <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                <div className="w-1 h-4 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1 h-3 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            )}
            {!isProcessing && isRecording && !isSpeaking && (
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
            <span className="text-xs text-gray-600 truncate">
              {isProcessing ? 'جاري المعالجة...' : (isRecording ? (isSpeaking ? 'جاري التسجيل...' : 'في انتظار الصوت') : 'اضغط للبدء')}
            </span>
          </div>

          {/* Mic Button */}
          <button
            onClick={toggleRecording}
            className={`
              relative flex items-center justify-center w-14 h-14 rounded-full
              transition-all duration-300 transform active:scale-95
              ${isRecording
                ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-lg shadow-red-500/30'
                : 'bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30'
              }
            `}
          >
            {isRecording ? (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <rect x="6" y="6" width="8" height="8" rx="1" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a3 3 0 016 0v2a3 3 0 01-6 0V9z" clipRule="evenodd" />
              </svg>
            )}

            {/* Pulse Animation */}
            {isRecording && (
              <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-30" />
            )}
          </button>

          {/* Audio Level Indicator */}
          <div className="flex-1 flex items-center gap-1 justify-end">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  audioLevel > (i + 1) * 20
                    ? 'bg-indigo-500 h-4'
                    : 'bg-gray-300 h-2'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @supports (padding-bottom: env(safe-area-inset-bottom)) {
          .safe-bottom {
            padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
          }
        }
      `}</style>
    </div>
  );
}
