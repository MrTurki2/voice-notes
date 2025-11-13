import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const imageFile = formData.get('image') as File | null;
    const contextText = formData.get('context') as string | null;
    const mode = formData.get('mode') as string || 'accurate'; // accurate, summary, keywords

    if (!audioFile) {
      return NextResponse.json({ success: false, error: 'No audio file provided' }, { status: 400 });
    }

    console.log('🎯 Smart Transcription:');
    console.log('  - Audio:', audioFile.name, audioFile.size, 'bytes');
    console.log('  - Image:', imageFile ? imageFile.name : 'none');
    console.log('  - Context:', contextText || 'none');
    console.log('  - Mode:', mode);

    // Convert audio to base64
    const audioBytes = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(audioBytes);
    const base64Audio = audioBuffer.toString('base64');

    // Prepare multimodal input
    const parts: any[] = [];

    // Build smart prompt based on mode
    let prompt = '';

    if (mode === 'summary') {
      prompt = `استمع إلى هذا الملف الصوتي واكتب ملخصاً شاملاً للمحتوى:

📝 المطلوب:
- ملخص شامل للأفكار الرئيسية
- النقاط المهمة
- أي توصيات أو استنتاجات

`;
    } else if (mode === 'keywords') {
      prompt = `استمع إلى هذا الملف الصوتي واستخرج:

🔑 الكلمات المفتاحية والمواضيع الرئيسية
📊 تصنيف المحتوى (تعليمي، ترفيهي، إخباري، إلخ)
💡 الأفكار الأساسية

`;
    } else {
      // accurate mode
      prompt = `استمع إلى هذا الملف الصوتي واكتب تفريغاً دقيقاً كاملاً:

📝 قواعد التفريغ:
- اكتب كل كلمة بالضبط كما نُطقت
- حافظ على علامات الترقيم المناسبة
- إذا كان النص بالعربية اكتب بالعربية، وإذا كان بالإنجليزية اكتب بالإنجليزية
- إذا كان هناك مصطلحات تقنية، اكتبها بدقة

`;
    }

    // Add context if provided
    if (contextText) {
      prompt += `\n📌 السياق: ${contextText}\n\n`;
    }

    // Add image analysis if provided
    if (imageFile) {
      const imageBytes = await imageFile.arrayBuffer();
      const imageBuffer = Buffer.from(imageBytes);
      const base64Image = imageBuffer.toString('base64');

      prompt += `🖼️ تم تزويدك بصورة مرفقة. انظر إلى الصورة واستخدم محتواها لفهم سياق الصوت بشكل أفضل.\n\n`;

      parts.push({
        text: prompt
      });

      parts.push({
        inlineData: {
          data: base64Image,
          mimeType: imageFile.type
        }
      });
    } else {
      parts.push({
        text: prompt
      });
    }

    // Add audio
    parts.push({
      inlineData: {
        data: base64Audio,
        mimeType: audioFile.type || 'audio/webm'
      }
    });

    // Add final instruction
    parts.push({
      text: '\n\n✍️ النص:'
    });

    console.log('🤖 Processing with Gemini 2.0 Flash (Multimodal)...');

    // Initialize Gemini model
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: mode === 'accurate' ? 0.1 : 0.7,
        topK: mode === 'accurate' ? 20 : 40,
        topP: mode === 'accurate' ? 0.8 : 0.95,
      }
    });

    // Generate content
    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text().trim();

    const duration = Date.now() - startTime;

    console.log('✅ Smart transcription successful');
    console.log('📝 Length:', text.length, 'characters');
    console.log('⏱️  Duration:', duration, 'ms');

    // Analyze the response to extract metadata
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);
    const language = hasArabic && hasEnglish ? 'mixed' : hasArabic ? 'arabic' : 'english';

    return NextResponse.json({
      success: true,
      text: text,
      metadata: {
        mode: mode,
        language: language,
        wordCount: wordCount,
        hasImage: !!imageFile,
        hasContext: !!contextText,
        duration_ms: duration,
        model: 'gemini-2.0-flash-exp',
        provider: 'Google Gemini Smart'
      }
    });

  } catch (error: any) {
    console.error('❌ Smart transcription error:', error);
    console.error('Error details:', error.message);

    return NextResponse.json({
      success: false,
      error: error.message || 'Transcription failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 });
  }
}
