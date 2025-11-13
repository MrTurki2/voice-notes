'use client';

import { useState, useRef, useCallback } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTranscription, setRecordingTranscription] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setTranscription('');
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (data.success) {
        setTranscription(data.text);
      } else {
        setTranscription('خطأ: ' + data.error);
      }
    } catch (error) {
      setTranscription('خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  const testTextAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/test-text');
      const data = await response.json();
      if (data.success) {
        setTestResult(data.message);
      } else {
        setTestResult('خطأ: ' + data.error);
      }
    } catch (error) {
      setTestResult('خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  const testAudioAPI = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/transcribe');
      const data = await response.json();
      if (data.success) {
        setTestResult(`تفريغ الملف التجريبي: ${data.text}`);
      } else {
        setTestResult('خطأ: ' + data.error);
      }
    } catch (error) {
      setTestResult('خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  };

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        // Upload and transcribe
        setLoading(true);
        try {
          const formData = new FormData();
          formData.append('file', audioFile);

          const response = await fetch('/api/transcribe', {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          if (data.success) {
            setRecordingTranscription(data.text);
          } else {
            setRecordingTranscription('خطأ: ' + data.error);
          }
        } catch (error) {
          setRecordingTranscription('خطأ في الاتصال');
        } finally {
          setLoading(false);
        }
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingTranscription('');
    } catch (error) {
      alert('فشل الوصول إلى المايك. تأكد من السماح بالوصول للمايك.');
    }
  }, []);


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-end gap-3 mb-4 flex-wrap">
          <a
            href="/live"
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-lg text-sm"
          >
            🔴 تجربة 1
          </a>
          <a
            href="/live2"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors shadow-lg text-sm"
          >
            🎯 تجربة 2
          </a>
          <a
            href="/live3"
            className="px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-bold rounded-lg transition-colors shadow-lg text-sm"
          >
            ⚡ تجربة 3 (Groq)
          </a>
          <a
            href="/live4"
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold rounded-lg transition-colors shadow-lg text-sm"
          >
            🧠 تجربة 4 (VAD)
          </a>
          <a
            href="/live5"
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold rounded-lg transition-colors shadow-lg text-sm"
          >
            💼 تجربة 5 (السيرة الذاتية)
          </a>
          <a
            href="/live7"
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-lg transition-colors shadow-lg text-sm"
          >
            ⚡ تجربة 7 (كل 5 ثواني)
          </a>
          <a
            href="/live8"
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold rounded-lg transition-colors shadow-lg text-sm"
          >
            🚀 تجربة 8 (محسّن)
          </a>
          <a
            href="/live9"
            className="px-4 py-2 bg-gradient-to-r from-slate-800 via-purple-800 to-slate-800 hover:from-slate-700 hover:via-purple-700 hover:to-slate-700 text-white font-bold rounded-lg transition-all shadow-2xl text-sm border-2 border-purple-500 animate-pulse"
          >
            🎯 تجربة 9 (الأفضل!) 🔥
          </a>
          <a
            href="/live10"
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:via-purple-500 hover:to-pink-500 text-white font-bold rounded-lg transition-all shadow-2xl text-sm border-2 border-yellow-400 animate-pulse"
          >
            🌟 تجربة 10 (Gemini 2.0) ✨
          </a>
          <a
            href="/live11"
            className="px-4 py-2 bg-gradient-to-r from-cyan-600 via-blue-600 to-purple-600 hover:from-cyan-500 hover:via-blue-500 hover:to-purple-500 text-white font-bold rounded-lg transition-all shadow-2xl text-sm border-2 border-cyan-400 animate-pulse"
          >
            🧠 تجربة 11 (Smart AI) 🎯
          </a>
          <a
            href="/live12"
            className="px-4 py-2 bg-black hover:bg-gray-900 text-white font-bold rounded-lg transition-all shadow-2xl text-sm border-2 border-green-500"
          >
            🎤 تجربة 12 (Live) ⚡
          </a>
          <a
            href="/live13"
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold rounded-lg transition-all shadow-2xl text-sm border-2 border-emerald-400"
          >
            ⚡ تجربة 13 (Pro) 🏆
          </a>
        </div>

        <h1 className="text-4xl font-bold text-center mb-2 text-gray-800 dark:text-white">
          تفريغ الصوت بواسطة OpenAI
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-8">
          ارفع ملف صوتي وسيتم تفريغه تلقائياً
        </p>

        {/* Test Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            اختبار API
          </h2>
          <div className="flex gap-4 mb-4">
            <button
              onClick={testTextAPI}
              disabled={loading}
              className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              اختبار النصوص
            </button>
            <button
              onClick={testAudioAPI}
              disabled={loading}
              className="flex-1 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              اختبار الصوتيات
            </button>
          </div>
          {testResult && (
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-gray-800 dark:text-white text-right">{testResult}</p>
            </div>
          )}
        </div>

        {/* Recording Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            🎤 تسجيل صوتي
          </h2>

          <div className="flex flex-col items-center justify-center py-8">
            {!isRecording ? (
              <div className="relative mb-6">
                <button
                  onClick={startRecording}
                  disabled={loading}
                  type="button"
                  className="w-24 h-24 rounded-full font-bold text-white shadow-lg transition-all transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-600"
                >
                  <svg className="w-12 h-12 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3zm0 14a7 7 0 01-7-7v-1a1 1 0 112 0v1a5 5 0 0010 0v-1a1 1 0 112 0v1a7 7 0 01-7 7z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative mb-6">
                <button
                  onClick={stopRecording}
                  type="button"
                  className="w-32 h-32 rounded-full font-bold text-white shadow-2xl transition-all transform hover:scale-110 bg-red-600 hover:bg-red-700 relative z-10 cursor-pointer animate-pulse"
                  style={{ touchAction: 'manipulation' }}
                >
                  <svg className="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                    <rect x="6" y="6" width="8" height="8" rx="1" />
                  </svg>
                </button>
                <div className="absolute inset-0 bg-red-500 rounded-full opacity-30 animate-ping pointer-events-none" style={{ animationDuration: '1.5s' }} />
              </div>
            )}

            <p className="text-center text-gray-700 dark:text-gray-300 font-semibold mb-2">
              {isRecording ? '🔴 جاري التسجيل...' : 'اضغط للبدء بالتسجيل'}
            </p>
            {isRecording && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                اضغط على الزر الأحمر للإيقاف والتفريغ
              </p>
            )}
          </div>

          {recordingTranscription && (
            <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 p-6 rounded-lg border-r-4 border-blue-500">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3 text-right flex items-center justify-end gap-2">
                <span>النص المفرغ من التسجيل</span>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
              </h3>
              <p className="text-gray-800 dark:text-white whitespace-pre-wrap text-right text-lg leading-relaxed">
                {recordingTranscription}
              </p>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
            رفع ملف صوتي
          </h2>

          <div className="mb-4">
            <label className="block w-full cursor-pointer">
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="text-gray-600 dark:text-gray-300">
                  {file ? (
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                      {file.name}
                    </span>
                  ) : (
                    <>
                      <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="mt-2">انقر لاختيار ملف صوتي</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">MP3, WAV, M4A, etc.</p>
                    </>
                  )}
                </div>
              </div>
            </label>
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            {loading ? 'جاري التفريغ...' : 'تفريغ الصوت'}
          </button>

          {transcription && (
            <div className="mt-6 bg-gray-100 dark:bg-gray-700 p-6 rounded-lg">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-2 text-right">
                النص المفرغ:
              </h3>
              <p className="text-gray-800 dark:text-white whitespace-pre-wrap text-right">
                {transcription}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
