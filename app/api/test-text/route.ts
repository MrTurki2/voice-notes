import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function GET() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "أنت مساعد ذكي ومفيد" },
        { role: "user", content: "قل مرحبا بالعربية في جملة قصيرة" }
      ],
    });

    return NextResponse.json({
      success: true,
      message: completion.choices[0].message.content,
      model: completion.model,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
