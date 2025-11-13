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

    console.log('Extracting CV from text:', text);
    console.log('Current CV:', currentCV);

    // Use GPT-4O-mini to extract CV information from speech
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت مساعد ذكي متخصص في استخراج معلومات السيرة الذاتية من الكلام الطبيعي باللغة العربية.

المهمة: استخرج المعلومات الجديدة فقط من كلام المستخدم:
- الاسم الكامل (name)
- البريد الإلكتروني (email)
- رقم الجوال (phone)
- المهارات (skills) - كقائمة
- الخبرات العملية (experience) - الشركة، المنصب، الفترة
- التعليم (education) - الدرجة، التخصص، السنة

قواعد مهمة جداً:
1. استخرج فقط المعلومات المذكورة صراحة في النص الجديد
2. **لا تعيد كتابة المعلومات السابقة** - أرجع فقط المعلومات الجديدة
3. إذا لم يذكر المستخدم معلومة جديدة، اترك الحقل فارغاً تماماً ("")
4. لا تخترع معلومات غير موجودة
5. إذا كانت القيم فارغة، أرجع "" أو [] حسب نوع الحقل

أرجع JSON فقط بهذا الشكل (مع القيم الجديدة فقط):
{
  "name": "",
  "email": "",
  "phone": "",
  "skills": [],
  "experience": [],
  "education": []
}

مثال:
- إذا قال "اسمي أحمد" → {"name": "أحمد", "email": "", "phone": "", "skills": [], "experience": [], "education": []}
- إذا قال "أعمل في شركة التقنية" → {"name": "", "email": "", "phone": "", "skills": [], "experience": [{"company": "شركة التقنية", "position": "", "period": ""}], "education": []}`
        },
        {
          role: "user",
          content: `السيرة الذاتية الحالية:
${JSON.stringify(currentCV, null, 2)}

الكلام الجديد من المستخدم:
"${text}"

استخرج المعلومات وحدّث السيرة. احتفظ بجميع المعلومات السابقة وأضف الجديدة فقط.`
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const extractedData = JSON.parse(completion.choices[0].message.content || '{}');

    console.log('Extracted CV data:', extractedData);

    // Merge with existing CV data - only update if new data is provided
    const mergedCV = {
      name: extractedData.name && extractedData.name.trim() !== '' ? extractedData.name : currentCV.name || '',
      email: extractedData.email && extractedData.email.trim() !== '' ? extractedData.email : currentCV.email || '',
      phone: extractedData.phone && extractedData.phone.trim() !== '' ? extractedData.phone : currentCV.phone || '',
      skills: [...new Set([...(currentCV.skills || []), ...(extractedData.skills || []).filter((s: string) => s.trim() !== '')])],
      experience: [
        ...(currentCV.experience || []),
        ...(extractedData.experience || []).filter((exp: any) =>
          exp.company && exp.company.trim() !== '' &&
          exp.position && exp.position.trim() !== ''
        )
      ],
      education: [
        ...(currentCV.education || []),
        ...(extractedData.education || []).filter((edu: any) =>
          edu.degree && edu.degree.trim() !== '' &&
          edu.field && edu.field.trim() !== ''
        )
      ]
    };

    console.log('Merged CV:', mergedCV);

    return NextResponse.json({
      success: true,
      cv: mergedCV
    });
  } catch (error: any) {
    console.error('CV extraction error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'خطأ في استخراج المعلومات'
      },
      { status: 500 }
    );
  }
}
