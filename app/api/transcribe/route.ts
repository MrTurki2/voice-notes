import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
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

    // Transcribe
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: "whisper-1",
      language: "ar", // Arabic
    });

    // Clean up
    fs.unlinkSync(tempPath);

    return NextResponse.json({
      success: true,
      text: transcription.text,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Test endpoint using the sample file
export async function GET() {
  try {
    const filePath = './public/test/sample.mp3';

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "whisper-1",
    });

    return NextResponse.json({
      success: true,
      text: transcription.text,
      file: 'public/test/sample.mp3'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
