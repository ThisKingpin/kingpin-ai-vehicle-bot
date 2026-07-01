import { randomUUID } from 'node:crypto';

export interface StageImportForm {
  importId: string;
  threadId: string;
  forumChannelId: string;
  discordId: string;
  threadTitle: string | null;
  characterName: string | null;
  normalizedCharacterName: string | null;
  storyText: string | null;
  sourceType: 'text' | 'pdf' | 'mixed' | 'unknown';
  status: 'approved' | 'needs_review';
}

const queue: StageImportForm[] = [];
const seenThreadIds = new Set<string>();
let pending: StageImportForm | null = null;

export function enqueueStageImport(
  form: Omit<StageImportForm, 'importId'>,
): boolean {
  if (seenThreadIds.has(form.threadId)) return false;
  seenThreadIds.add(form.threadId);
  queue.push({ ...form, importId: randomUUID() });
  return true;
}

/** Bot restart / re-sync: bos hikayeli konulari tekrar kuyruga alabilmek icin. */
export function clearStageImportSeen(): void {
  seenThreadIds.clear();
  pending = null;
}

export function pullNextStageImport(): StageImportForm | null {
  if (pending) return null;
  const next = queue.shift();
  if (!next) return null;
  pending = next;
  return next;
}

export function ackStageImport(threadId: string, success: boolean): boolean {
  if (!pending || pending.threadId !== threadId) return false;
  if (!success) {
    queue.unshift(pending);
    seenThreadIds.delete(threadId);
  }
  pending = null;
  return true;
}

export function getStageImportQueueSize(): number {
  return queue.length + (pending ? 1 : 0);
}
