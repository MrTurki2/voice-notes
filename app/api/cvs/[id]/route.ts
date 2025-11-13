import { NextRequest, NextResponse } from 'next/server';
import { getCVById, updateCV, deleteCV, calculateCompletionPercentage } from '@/lib/db';

// GET single CV
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const cv = getCVById(id);

    if (!cv) {
      return NextResponse.json(
        { success: false, error: 'CV not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      cv: {
        ...cv,
        data: JSON.parse(cv.data)
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT update CV
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const { data } = await request.json();

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Data is required' },
        { status: 400 }
      );
    }

    const cvData = typeof data === 'string' ? JSON.parse(data) : data;
    const completionPercentage = calculateCompletionPercentage(cvData);

    updateCV(id, JSON.stringify(cvData), completionPercentage);

    return NextResponse.json({
      success: true,
      completion_percentage: completionPercentage
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE CV
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    deleteCV(id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
