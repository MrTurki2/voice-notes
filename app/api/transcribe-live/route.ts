import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    console.log('🎤 Live: Received file:', file.name, 'Type:', file.type, 'Size:', file.size, 'bytes');

    // Skip very small files
    if (file.size < 15000) {
      console.log('⏭️ Skipping - file too small (need 15KB+)');
      return NextResponse.json({
        success: true,
        text: '',
        duration_ms: Date.now() - startTime
      });
    }

    console.log('🚀 Transcribing with Groq...');

    // Transcribe with Groq Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: file,
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      temperature: 0.0,
    });

    const duration = Date.now() - startTime;
    const text = transcription.text;

    if (!text || !text.trim()) {
      console.log('⚠️ Empty transcription');
      return NextResponse.json({
        success: true,
        text: '',
        duration_ms: duration
      });
    }

    console.log('✅ Transcription:', text.substring(0, 50), '...');
    console.log('⏱️  Duration:', duration, 'ms');

    return NextResponse.json({
      success: true,
      text: text,
      duration_ms: duration,
      model: 'whisper-large-v3-turbo',
      provider: 'Groq'
    });

  } catch (error: any) {
    console.error('❌ Transcription error:', error);
    console.error('Error details:', error.message);

    return NextResponse.json({
      success: true, // Return success to avoid blocking
      text: '',
      error: error.message,
      duration_ms: Date.now() - startTime
    });
  }
}
