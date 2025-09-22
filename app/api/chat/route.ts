import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { parseDocument, generateAnalysisPrompt } from '@/lib/document-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const message = formData.get('message') as string;
    const file = formData.get('file') as File | null;

    if (!message && !file) {
      return NextResponse.json({ error: 'Message or file is required' }, { status: 400 });
    }

    let prompt = message || '';

    // If a file is uploaded, parse it and generate analysis prompt
    if (file) {
      try {
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const parsedDoc = await parseDocument(file, fileBuffer);
        prompt = generateAnalysisPrompt(parsedDoc, message || undefined);
      } catch (parseError) {
        console.error('Document parsing error:', parseError);
        return NextResponse.json(
          { error: `Failed to parse document: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` },
          { status: 400 }
        );
      }
    } else if (message) {
      // If only message without file, use the message as prompt
      prompt = message;
    }

    const { text } = await generateText({
      model: openai('gpt-4'),
      prompt,
    });

    return NextResponse.json({ response: text });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}