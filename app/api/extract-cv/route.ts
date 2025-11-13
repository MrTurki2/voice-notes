import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, currentCV } = await request.json();

    if (!text) {
      return NextResponse.json(
        { success: false, error: 'No text provided' },
        { status: 400 }
      );
    }

    // Use GPT-4O-mini to extract CV information from speech
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت مساعد ذكي متخصص في استخراج معلومات السيرة الذاتية من الكلام الطبيعي.

المهمة: استخرج المعلومات التالية من كلام المستخدم وأضفها للسيرة الموجودة:
- الاسم الكامل
- العمر أو تاريخ الميلاد
- الجنس
- الجنسية
- رقم الهاتف
- البريد الإلكتروني
- المدينة/البلد
- المسمى الوظيفي المطلوب
- الملخص الشخصي
- الخبرات العملية (الشركة، المنصب، الفترة، الوصف)
- التعليم (الجامعة/المدرسة، الشهادة، التخصص، السنة)
- المهارات (تقنية وشخصية)
- اللغات ومستوى الإتقان
- الشهادات
- الهوايات

قواعد مهمة:
1. استخرج فقط المعلومات المذكورة صراحة
2. احتفظ بالمعلومات السابقة ولا تحذفها
3. أضف المعلومات الجديدة فقط
4. إذا ذكر المستخدم تصحيح، عدّل المعلومة المطلوبة
5. لا تخترع معلومات غير موجودة
6. رتب الخبرات والتعليم من الأحدث للأقدم

أرجع JSON فقط بهذا الشكل:
{
  "personalInfo": {
    "fullName": "",
    "age": "",
    "gender": "",
    "nationality": "",
    "phone": "",
    "email": "",
    "location": "",
    "title": ""
  },
  "summary": "",
  "experience": [
    {
      "company": "",
      "position": "",
      "period": "",
      "description": ""
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "year": ""
    }
  ],
  "skills": {
    "technical": [],
    "soft": []
  },
  "languages": [
    {
      "language": "",
      "level": ""
    }
  ],
  "certificates": [],
  "hobbies": []
}`
        },
        {
          role: "user",
          content: `السيرة الذاتية الحالية:\n${JSON.stringify(currentCV, null, 2)}\n\nالكلام الجديد:\n${text}\n\nاستخرج المعلومات وحدّث السيرة.`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const extractedData = JSON.parse(completion.choices[0].message.content || '{}');

    return NextResponse.json({
      success: true,
      cv: extractedData
    });
  } catch (error: any) {
    console.error('CV extraction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}
