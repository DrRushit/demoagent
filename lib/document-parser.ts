import * as XLSX from 'xlsx';
import csv from 'csv-parser';
import { Readable } from 'stream';

export interface ParsedDocument {
  content: string;
  metadata: {
    fileName: string;
    fileType: string;
    fileSize: number;
    pageCount?: number;
    sheetNames?: string[];
    rowCount?: number;
    columnCount?: number;
  };
}

export async function parseDocument(
  file: File,
  fileBuffer: Buffer
): Promise<ParsedDocument> {
  const fileName = file.name;
  const fileType = file.type;
  const fileSize = file.size;
  const extension = fileName.split('.').pop()?.toLowerCase();

  try {
    switch (extension) {
      case 'pdf':
        return await parsePDF(fileBuffer, fileName, fileType, fileSize);
      case 'xlsx':
      case 'xls':
        return await parseExcel(fileBuffer, fileName, fileType, fileSize);
      case 'csv':
        return await parseCSV(fileBuffer, fileName, fileType, fileSize);
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  } catch (error) {
    console.error('Document parsing error:', error);
    throw new Error(`Failed to parse document: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

async function parsePDF(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<ParsedDocument> {
  try {
    // Use the dedicated PDF text extraction API
    const formData = new FormData();
    const file = new File([new Uint8Array(buffer)], fileName, { type: fileType });
    formData.append('file', file);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/parse-pdf`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'PDF text extraction failed');
    }
    
    const data = await response.json();
    
    // Return the extracted text as simple content
    return {
      content: data.content || `PDF file: ${fileName}\n\nNote: Could not extract text content from this PDF.`,
      metadata: {
        fileName,
        fileType,
        fileSize,
        pageCount: data.pageCount || 1,
      },
    };
  } catch (error) {
    console.error('PDF text extraction error:', error);
    
    // Fallback to metadata-only analysis
    return {
      content: `PDF file: ${fileName}\n\nFile Information:\n- File Name: ${fileName}\n- File Type: ${fileType}\n- File Size: ${(fileSize / 1024).toFixed(2)} KB\n- Document Format: PDF\n\nNote: Could not extract text content from this PDF file. Please try uploading a CSV or Excel file for full content analysis, or describe what you're looking for in this PDF and I can provide guidance.`,
      metadata: {
        fileName,
        fileType,
        fileSize,
        pageCount: 1,
      },
    };
  }
}

async function parseExcel(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<ParsedDocument> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  
  let content = '';
  let totalRows = 0;
  let totalColumns = 0;

  // Process each sheet
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    content += `\n\n=== Sheet: ${sheetName} ===\n`;
    
    if (jsonData.length > 0) {
      // Add headers if they exist
      const headers = jsonData[0] as string[];
      if (headers.some(header => header !== undefined && header !== null && header !== '')) {
        content += `Headers: ${headers.join(' | ')}\n`;
      }
      
      // Add data rows
      const dataRows = jsonData.slice(1).filter((row: any) => 
        row.some((cell: any) => cell !== undefined && cell !== null && cell !== '')
      );
      
      content += `Data (${dataRows.length} rows):\n`;
      dataRows.forEach((row, index) => {
        if (index < 10) { // Limit to first 10 rows for content preview
          content += `Row ${index + 1}: ${(row as any[]).join(' | ')}\n`;
        }
      });
      
      if (dataRows.length > 10) {
        content += `... and ${dataRows.length - 10} more rows\n`;
      }
      
      totalRows += dataRows.length;
      totalColumns = Math.max(totalColumns, headers.length);
    }
  }

  return {
    content: content.trim(),
    metadata: {
      fileName,
      fileType,
      fileSize,
      sheetNames,
      rowCount: totalRows,
      columnCount: totalColumns,
    },
  };
}

async function parseCSV(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    const results: any[] = [];
    const stream = Readable.from(buffer);
    
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        try {
          let content = '';
          
          if (results.length > 0) {
            // Get headers
            const headers = Object.keys(results[0]);
            content += `Headers: ${headers.join(' | ')}\n`;
            content += `Data (${results.length} rows):\n`;
            
            // Add data rows (limit to first 20 for content preview)
            results.slice(0, 20).forEach((row, index) => {
              const values = headers.map(header => row[header] || '').join(' | ');
              content += `Row ${index + 1}: ${values}\n`;
            });
            
            if (results.length > 20) {
              content += `... and ${results.length - 20} more rows\n`;
            }
          }

          resolve({
            content: content.trim(),
            metadata: {
              fileName,
              fileType,
              fileSize,
              rowCount: results.length,
              columnCount: results.length > 0 ? Object.keys(results[0]).length : 0,
            },
          });
        } catch (error) {
          reject(error);
        }
      })
      .on('error', reject);
  });
}

export function generateAnalysisPrompt(parsedDoc: ParsedDocument, userMessage?: string): string {
  const { content, metadata } = parsedDoc;
  const isPDF = metadata.fileType === 'application/pdf' || metadata.fileName.toLowerCase().endsWith('.pdf');
  const hasContent = content.length > 200 && !content.includes('Document Analysis Request');
  
  let prompt = `You are analyzing a document to answer a user's question. Please focus on answering their specific question using the document content.\n\n`;
  
  prompt += `Document Information:\n`;
  prompt += `- File: ${metadata.fileName}\n`;
  prompt += `- Type: ${metadata.fileType}\n`;
  prompt += `- Size: ${(metadata.fileSize / 1024).toFixed(2)} KB\n`;
  
  if (metadata.pageCount) {
    prompt += `- Pages: ${metadata.pageCount}\n`;
  }
  if (metadata.sheetNames) {
    prompt += `- Sheets: ${metadata.sheetNames.join(', ')}\n`;
  }
  if (metadata.rowCount) {
    prompt += `- Rows: ${metadata.rowCount}\n`;
  }
  if (metadata.columnCount) {
    prompt += `- Columns: ${metadata.columnCount}\n`;
  }
  
  prompt += `\nDocument Content:\n${content}\n\n`;
  
  if (userMessage) {
    prompt += `USER'S QUESTION: "${userMessage}"\n\n`;
    prompt += `Please answer the user's question using the document content above. If the document doesn't contain enough information to fully answer their question, let them know what information is available and suggest what additional information might be needed.\n\n`;
  } else {
    prompt += `The user has uploaded this document without a specific question. Please provide a comprehensive analysis.\n\n`;
  }
  
  if (isPDF && !hasContent) {
    prompt += `Since this is a PDF with limited text extraction, please:\n`;
    prompt += `1. Answer the user's question based on available metadata and any extracted content\n`;
    prompt += `2. Explain what types of information could be found in this PDF\n`;
    prompt += `3. Suggest alternative ways to get the information they need\n`;
  } else {
    prompt += `Please provide a helpful response that:\n`;
    prompt += `1. Directly answers the user's question using the document content\n`;
    prompt += `2. References specific text, data, or sections from the document when relevant\n`;
    prompt += `3. Highlights key insights, patterns, or trends found in the document\n`;
    prompt += `4. Provides actionable recommendations based on the document findings\n`;
    prompt += `5. If the document doesn't contain enough information to fully answer the question, explain what information is available and what additional details might be needed\n`;
  }
  
  return prompt;
}
