import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import fs from 'fs';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save temporarily
    const tempPath = `/tmp/${Date.now()}-${file.name}`;
    fs.writeFileSync(tempPath, buffer);

    // Transcribe with Groq (Whisper Large V3)
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-large-v3-turbo",
      language: "ar", // Arabic
      response_format: "json",
      temperature: 0.0, // More deterministic
    });

    // Clean up
    fs.unlinkSync(tempPath);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      text: transcription.text,
      duration_ms: duration,
      model: "whisper-large-v3-turbo",
      provider: "Groq"
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        duration_ms: duration
      },
      { status: 500 }
    );
  }
}
