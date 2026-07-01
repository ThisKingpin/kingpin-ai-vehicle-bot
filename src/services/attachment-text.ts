import mammoth from 'mammoth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';
import { env } from '../env.js';
import { withTimeout } from '../utils/timeout.js';

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;
const GEMINI_EXTRACT_MIN = 50;

export type StoryAttachmentKind = 'pdf' | 'docx' | 'text';

export interface StoryAttachmentSource {
  url: string;
  proxyUrl?: string | null;
  filename: string;
  contentType?: string | null;
  size?: number | null;
}

export function detectStoryAttachmentKind(
  filename: string,
  contentType?: string | null,
): StoryAttachmentKind | null {
  const lower = filename.toLowerCase();
  const mime = (contentType ?? '').toLowerCase();

  if (lower.endsWith('.pdf') || mime === 'application/pdf') return 'pdf';
  if (
    lower.endsWith('.docx')
    || lower.endsWith('.doc')
    || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mime === 'application/msword'
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

  if (mime === 'application/octet-stream') {
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'docx';
    if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text';
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

function isDiscordCdnUrl(url: string): boolean {
  return /discord(?:app)?\.(?:com|net)/i.test(url);
}

async function downloadAttachmentBuffer(
  source: StoryAttachmentSource,
  botToken?: string,
): Promise<Buffer> {
  const urls = [source.url, source.proxyUrl].filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  );

  const headers: Record<string, string> = {
    'User-Agent': 'DiscordBot (https://github.com/ThisKingpin/kingpin-ai-vehicle-bot, 1.0)',
  };
  if (botToken && urls.some(isDiscordCdnUrl)) {
    headers.Authorization = `Bot ${botToken.replace(/^Bot\s+/i, '')}`;
  }

  let lastError = 'bilinmeyen hata';

  for (const url of urls) {
    try {
      const response = await withTimeout(
        fetch(url, { headers, redirect: 'follow' }),
        FETCH_TIMEOUT_MS,
        `${source.filename} indirme`,
      );

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (typeof source.size === 'number' && source.size > 0 && buffer.byteLength === 0) {
        lastError = 'bos dosya';
        continue;
      }

      return buffer;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  throw new Error(`${source.filename} indirilemedi (${lastError}).`);
}

async function extractWithGemini(
  kind: StoryAttachmentKind,
  buffer: Buffer,
  filename: string,
): Promise<string> {
  if (env('STAGE_ATTACHMENT_GEMINI') === '0') return '';

  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return '';

  const mimeType = kind === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const modelName = env('GEMINI_MODEL') ?? 'gemini-2.5-flash-lite';
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await withTimeout(
    model.generateContent([
      {
        inlineData: {
          mimeType,
          data: buffer.toString('base64'),
        },
      },
      {
        text:
          'Bu belgedeki tum okunabilir metni oldugu gibi cikar. '
          + 'Sadece duz metin dondur; yorum, ozet veya markdown ekleme.',
      },
    ]),
    90_000,
    `${filename} Gemini metin cikarma`,
  );

  return normalizeExtractedText(result.response.text());
}

export async function parseStoryAttachmentBuffer(
  kind: StoryAttachmentKind,
  buffer: Buffer,
  filename = 'ek',
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
      const text = normalizeExtractedText(result.text ?? '');
      if (text.length >= GEMINI_EXTRACT_MIN) return text;

      const geminiText = await extractWithGemini('pdf', buffer, filename).catch((e) => {
        console.warn(`[attachment-text] PDF Gemini fallback basarisiz (${filename}):`, e);
        return '';
      });
      return geminiText || text;
    } finally {
      await parser.destroy();
    }
  }

  const result = await mammoth.extractRawText({ buffer });
  const text = normalizeExtractedText(result.value ?? '');
  if (text.length >= GEMINI_EXTRACT_MIN) return text;

  const geminiText = await extractWithGemini('docx', buffer, filename).catch((e) => {
    console.warn(`[attachment-text] DOCX Gemini fallback basarisiz (${filename}):`, e);
    return '';
  });
  return geminiText || text;
}

export async function fetchStoryAttachmentText(
  source: StoryAttachmentSource,
  botToken?: string,
): Promise<string> {
  const kind = detectStoryAttachmentKind(source.filename, source.contentType);
  if (!kind) return '';

  if (typeof source.size === 'number' && source.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${source.filename} cok buyuk (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).`,
    );
  }

  const buffer = await downloadAttachmentBuffer(source, botToken);
  return parseStoryAttachmentBuffer(kind, buffer, source.filename);
}
