import { NextRequest, NextResponse } from 'next/server';
import { getAllCVs, createCV, calculateCompletionPercentage } from '@/lib/db';

// GET all CVs
export async function GET() {
  try {
    const cvs = getAllCVs();
    return NextResponse.json({ success: true, cvs });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// POST create new CV
export async function POST(request: NextRequest) {
  try {
    const { title, data } = await request.json();

    if (!title || !data) {
      return NextResponse.json(
        { success: false, error: 'Title and data are required' },
        { status: 400 }
      );
    }

    const cvData = typeof data === 'string' ? JSON.parse(data) : data;
    const completionPercentage = calculateCompletionPercentage(cvData);

    const id = createCV(title, JSON.stringify(cvData), completionPercentage);

    return NextResponse.json({
      success: true,
      id,
      completion_percentage: completionPercentage
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
