/**
 * STAGE — MySQL Bağlantısı
 *
 * Bot, FiveM sunucusunun MySQL/MariaDB veritabanına doğrudan bağlanır.
 * Bağlantı bilgileri .env dosyasından okunur.
 * STAGE_DB_HOST tanımlanmamışsa modül pool oluşturmaz; stage servisleri
 * başlatılmaz ve mevcut bot işlevselliği etkilenmez.
 */

import mysql2 from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';
import { env } from '../env.js';

let _pool: Pool | null = null;

export function getStagePool(): Pool | null {
  return _pool;
}

/** STAGE_DB_HOST tanımlıysa pool oluşturur. */
export function initStagePool(): Pool | null {
  const host = env('STAGE_DB_HOST');
  if (!host) return null;

  _pool = mysql2.createPool({
    host,
    port:               Number(env('STAGE_DB_PORT') ?? '3306'),
    user:               env('STAGE_DB_USER') ?? 'root',
    password:           env('STAGE_DB_PASS') ?? '',
    database:           env('STAGE_DB_NAME') ?? 'fivem',
    waitForConnections: true,
    connectionLimit:    5,
    queueLimit:         0,
    timezone:           '+00:00',
    charset:            'utf8mb4',
  });

  return _pool;
}

// ─── Sorgular ────────────────────────────────────────────────────────────────

export interface StageForm {
  id:                        number;
  thread_id:                 string;
  forum_channel_id:          string;
  discord_id:                string;
  thread_title:              string | null;
  character_name:            string | null;
  normalized_character_name: string | null;
  story_text:                string | null;
  source_type:               'text' | 'pdf' | 'mixed' | 'unknown';
  status:                    'approved' | 'needs_review' | 'rejected';
  analysis_status:           'not_started' | 'queued' | 'analyzing' | 'done' | 'failed';
  vehicle:                   string | null;
  vehicle_label:             string | null;
  analysis_reason:           string | null;
  claimed_citizenid:         string | null;
}

/** Thread zaten DB'de kayıtlı mı? */
export async function threadExists(pool: Pool, threadId: string): Promise<boolean> {
  const [rows] = await pool.execute<mysql2.RowDataPacket[]>(
    'SELECT 1 FROM `stage_character_forms` WHERE `thread_id` = ? LIMIT 1',
    [threadId],
  );
  return rows.length > 0;
}

/** Yeni forum thread kaydını ekle. */
export async function insertForm(pool: Pool, data: {
  threadId:               string;
  forumChannelId:         string;
  discordId:              string;
  threadTitle:            string | null;
  characterName:          string | null;
  normalizedCharacterName: string | null;
  storyText:              string | null;
  sourceType:             'text' | 'pdf' | 'mixed' | 'unknown';
  status:                 'approved' | 'needs_review';
}): Promise<void> {
  await pool.execute(
    `INSERT INTO \`stage_character_forms\`
     (\`thread_id\`, \`forum_channel_id\`, \`discord_id\`, \`thread_title\`,
      \`character_name\`, \`normalized_character_name\`,
      \`story_text\`, \`source_type\`, \`status\`, \`analysis_status\`)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_started')`,
    [
      data.threadId,
      data.forumChannelId,
      data.discordId,
      data.threadTitle,
      data.characterName,
      data.normalizedCharacterName,
      data.storyText,
      data.sourceType,
      data.status,
    ],
  );
}

/** analysis_status = 'queued' olan bir kaydı kilitle ve döndür. */
export async function claimQueuedForm(pool: Pool): Promise<StageForm | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.execute<mysql2.RowDataPacket[]>(
      `SELECT * FROM \`stage_character_forms\`
       WHERE \`analysis_status\` = 'queued'
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );

    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }

    const form = rows[0] as StageForm;

    await conn.execute(
      `UPDATE \`stage_character_forms\`
       SET \`analysis_status\` = 'analyzing', \`analysis_started_at\` = NOW()
       WHERE \`id\` = ?`,
      [form.id],
    );

    await conn.commit();
    return form;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Analiz başarılı sonucu yaz. */
export async function markAnalysisDone(pool: Pool, id: number, vehicle: string, vehicleLabel: string, reason: string): Promise<void> {
  await pool.execute(
    `UPDATE \`stage_character_forms\`
     SET \`analysis_status\`     = 'done',
         \`analysis_finished_at\` = NOW(),
         \`vehicle\`              = ?,
         \`vehicle_label\`        = ?,
         \`analysis_reason\`      = ?
     WHERE \`id\` = ?`,
    [vehicle, vehicleLabel, reason, id],
  );
}

/** Analiz başarısız. */
export async function markAnalysisFailed(pool: Pool, id: number): Promise<void> {
  await pool.execute(
    `UPDATE \`stage_character_forms\`
     SET \`analysis_status\` = 'failed', \`analysis_finished_at\` = NOW()
     WHERE \`id\` = ?`,
    [id],
  );
}
