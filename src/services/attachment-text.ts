import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export type StoryAttachmentKind = 'pdf' | 'docx' | 'text';

export function detectStoryAttachmentKind(
  filename: string,
  contentType?: string | null,
): StoryAttachmentKind | null {
  const lower = filename.toLowerCase();
  const mime = (contentType ?? '').toLowerCase();

  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx')
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (
    lower.endsWith('.txt')
    || lower.endsWith('.md')
    || mime.startsWith('text/')
  ) {
    return 'text';
  }

  return null;
}

export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseStoryAttachmentBuffer(
  kind: StoryAttachmentKind,
  buffer: Buffer,
): Promise<string> {
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Dosya cok buyuk (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`);
  }

  if (kind === 'text') {
    return normalizeExtractedText(buffer.toString('utf8'));
  }

  if (kind === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeExtractedText(result.text ?? '');
    } finally {
      await parser.destroy();
    }
  }

  const result = await mammoth.extractRawText({ buffer });
  return normalizeExtractedText(result.value ?? '');
}

export async function fetchStoryAttachmentText(
  url: string,
  filename: string,
  contentType?: string | null,
  size?: number | null,
): Promise<string> {
  const kind = detectStoryAttachmentKind(filename, contentType);
  if (!kind) return '';

  if (typeof size === 'number' && size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${filename} cok buyuk (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${filename} indirilemedi (${response.status}).`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return parseStoryAttachmentBuffer(kind, buffer);
}
