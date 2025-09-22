import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';

export async function POST(request: NextRequest) {
  try {
    console.log('PDF text extraction API called');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    console.log('Processing PDF file:', file.name, 'Size:', file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log('Buffer created, size:', buffer.length);
    
    // Use pdf-parse for simple text extraction
    console.log('Extracting text using pdf-parse...');
    const data = await pdf(buffer);
    
    console.log('PDF parsing completed');
    console.log('Text length:', data.text.length);
    console.log('Number of pages:', data.numpages);
    console.log('Sample text:', data.text.substring(0, 200));
    
    return NextResponse.json({
      content: data.text,
      pageCount: data.numpages,
    });
  } catch (error) {
    console.error('PDF text extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract text from PDF', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
