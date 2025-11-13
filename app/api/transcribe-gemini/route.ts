import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    console.log('📥 Gemini Direct: Received file:', file.name, 'Size:', file.size, 'bytes');

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Audio = buffer.toString('base64');

    console.log('🤖 Using Gemini 2.0 Flash for direct transcription...');

    // Initialize Gemini model with audio support
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp'
    });

    // Create the request with audio inline data
    const result = await model.generateContent([
      {
        text: `استمع إلى هذا الملف الصوتي واكتب النص المنطوق بالضبط كما سمعته.

قواعد التفريغ:
- اكتب كل كلمة تماماً كما نطقت
- إذا كان النص بالعربية، اكتب بالعربية الفصحى
- إذا كان بالإنجليزية، اكتب بالإنجليزية
- لا تضف أي تعليقات أو توضيحات
- فقط النص المنطوق:

النص:`
      },
      {
        inlineData: {
          data: base64Audio,
          mimeType: file.type || 'audio/webm'
        }
      }
    ]);

    const response = await result.response;
    const text = response.text().trim();

    const duration = Date.now() - startTime;

    console.log('✅ Gemini transcription successful');
    console.log('📝 Text:', text.substring(0, 100), '...');
    console.log('⏱️  Duration:', duration, 'ms');

    // Return with enhanced response
    return NextResponse.json({
      success: true,
      text: text,
      duration_ms: duration,
      model: 'gemini-2.0-flash-exp',
      provider: 'Google Gemini Direct'
    });

  } catch (error: any) {
    console.error('❌ Gemini transcription error:', error);
    console.error('Error details:', error.message);

    return NextResponse.json({
      success: false,
      error: error.message || 'Transcription failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
