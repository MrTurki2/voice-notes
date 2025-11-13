'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CVItem {
  id: number;
  title: string;
  completion_percentage: number;
  created_at: string;
  updated_at: string;
}

export default function CVsListPage() {
  const [cvs, setCVs] = useState<CVItem[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadCVs();
  }, []);

  const loadCVs = async () => {
    try {
      const response = await fetch('/api/cvs');
      const data = await response.json();
      if (data.success) {
        setCVs(data.cvs);
      }
    } catch (error) {
      console.error('Failed to load CVs:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCV = async (id: number) => {
    if (!confirm('هل أنت متأكد من حذف هذه السيرة الذاتية؟')) return;

    try {
      const response = await fetch(`/api/cvs/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadCVs();
      }
    } catch (error) {
      console.error('Failed to delete CV:', error);
    }
  };

  const getCompletionColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600 bg-green-100';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getMissingFields = (percentage: number) => {
    const fields = [];
    if (percentage < 5) fields.push('الاسم');
    if (percentage < 9) fields.push('الهاتف');
    if (percentage < 14) fields.push('البريد الإلكتروني');
    if (percentage < 24) fields.push('الملخص الشخصي');
    if (percentage < 49) fields.push('الخبرات');
    if (percentage < 64) fields.push('التعليم');
    if (percentage < 74) fields.push('المهارات');
    if (percentage < 79) fields.push('اللغات');

    return fields.slice(0, 3);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 dark:text-white mb-2">
              📋 قائمة السير الذاتية
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              جميع السير الذاتية المحفوظة مع مؤشر الاكتمال
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/live5"
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors font-semibold"
            >
              ➕ سيرة ذاتية جديدة
            </Link>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              ← الرئيسية
            </Link>
          </div>
        </div>

        {/* CVs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex justify-center items-center h-64">
              <div className="text-gray-400">جاري التحميل...</div>
            </div>
          ) : cvs.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center h-64">
              <p className="text-gray-400 text-lg mb-4">لا توجد سير ذاتية محفوظة</p>
              <Link
                href="/live5"
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors font-semibold"
              >
                ابدأ بإنشاء سيرة ذاتية
              </Link>
            </div>
          ) : (
            cvs.map((cv) => (
              <div
                key={cv.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer"
                onClick={() => router.push(`/live5?id=${cv.id}`)}
              >
                {/* Title */}
                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-3 truncate">
                  {cv.title}
                </h3>

                {/* Completion Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      مؤشر الاكتمال
                    </span>
                    <span className={`text-sm font-bold px-2 py-1 rounded ${getCompletionColor(cv.completion_percentage)}`}>
                      {cv.completion_percentage}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        cv.completion_percentage >= 80
                          ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                          : cv.completion_percentage >= 50
                          ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                          : 'bg-gradient-to-r from-red-400 to-pink-500'
                      }`}
                      style={{ width: `${cv.completion_percentage}%` }}
                    />
                  </div>
                </div>

                {/* Missing Fields */}
                {cv.completion_percentage < 100 && (
                  <div className="mb-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">باقي:</p>
                    <div className="flex flex-wrap gap-1">
                      {getMissingFields(cv.completion_percentage).map((field, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dates */}
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 mb-4">
                  <div>📅 تم الإنشاء: {new Date(cv.created_at).toLocaleDateString('ar-SA')}</div>
                  <div>🔄 آخر تحديث: {new Date(cv.updated_at).toLocaleDateString('ar-SA')}</div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/live5?id=${cv.id}`);
                    }}
                    className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold"
                  >
                    ✏️ تعديل
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCV(cv.id);
                    }}
                    className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
