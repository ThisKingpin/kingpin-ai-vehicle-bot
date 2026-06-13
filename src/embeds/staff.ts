import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbedField,
} from 'discord.js';
import type { PendingRequest, ScoredVehicle } from '../types.js';
import { getReviewFlag } from '../services/analysis.js';
import { applyVehicleImage } from '../services/vehicle-image.js';

function formatActor(adminId?: string): string {
  if (!adminId) return '-';
  if (adminId.startsWith('ai:')) return `AI Otomatik (<@${adminId.slice(3)}>)`;
  if (adminId === 'ai_auto') return 'AI Otomatik';
  return `<@${adminId}>`;
}

export function buildStaffEmbed(pending: PendingRequest): EmbedBuilder {
  const profile = pending.analysis.character_profile;
  const manual = getReviewFlag(pending.analysis, pending.recommendations);

  const fields: APIEmbedField[] = [
    { name: 'Karakter', value: pending.characterName, inline: true },
    { name: 'CitizenID', value: pending.citizenid, inline: true },
    { name: 'Sunucu', value: pending.serverName, inline: true },
    { name: 'Discord', value: `<@${pending.discordId}>`, inline: true },
    { name: 'Request ID', value: pending.requestId, inline: false },
    {
      name: 'Profil',
      value: [
        `Gelir: ${profile.income_level}`,
        `Koken: ${profile.origin}`,
        `Meslek: ${profile.job_type}`,
        `Yasam: ${profile.lifestyle}`,
        `Flash: ${profile.flashiness}/10`,
        `Vibes: ${profile.dominant_vibes.join(', ')}`,
      ].join('\n'),
      inline: false,
    },
  ];

  pending.recommendations.forEach((rec, i) => {
    fields.push({
      name: `#${i + 1} ${rec.label} (${rec.score})`,
      value: rec.reason,
      inline: false,
    });
  });

  if (pending.analysis.rejected_vehicle_types?.length) {
    fields.push({
      name: 'Reddedilen siniflar',
      value: pending.analysis.rejected_vehicle_types
        .map((r) => `**${r.type}**: ${r.reason}`)
        .join('\n'),
      inline: false,
    });
  }

  fields.push({
    name: 'Hikaye ozeti',
    value: pending.storyText.slice(0, 900) + (pending.storyText.length > 900 ? '...' : ''),
    inline: false,
  });

  const embed = new EmbedBuilder()
    .setTitle(manual ? 'Arac Basvurusu — Manuel Inceleme Onerilir' : 'Arac Basvurusu — Onay Bekliyor')
    .setColor(manual ? 0xffaa00 : 0x3498db)
    .addFields(fields)
    .setFooter({ text: `Risk: ${pending.analysis.risk ?? 'low'}` })
    .setTimestamp();

  return embed;
}

export function buildRecommendationButtons(pending: PendingRequest): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current = new ActionRowBuilder<ButtonBuilder>();

  pending.recommendations.forEach((rec, index) => {
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder<ButtonBuilder>();
    }
    current.addComponents(
      new ButtonBuilder()
        .setCustomId(`ai_vehicle:approve:${pending.requestId}:${rec.vehicle}`)
        .setLabel(`Onayla: ${rec.vehicle}`)
        .setStyle(ButtonStyle.Success),
    );
    if (index === pending.recommendations.length - 1) {
      current.addComponents(
        new ButtonBuilder()
          .setCustomId(`ai_vehicle:reject:${pending.requestId}`)
          .setLabel('Reddet')
          .setStyle(ButtonStyle.Danger),
      );
    }
  });

  if (current.components.length > 0) rows.push(current);
  return rows;
}

export function buildPlayerGrantedEmbed(
  characterName: string,
  granted: { label: string; model: string; garage: string; score: number; reason: string },
  alternatives: ScoredVehicle[],
): EmbedBuilder {
  const altText =
    alternatives.length > 1
      ? '\n\n**Diger uygun araclar:**\n' +
        alternatives
          .slice(1, 4)
          .map((r, i) => `${i + 2}. ${r.label} (${r.score})`)
          .join('\n')
      : '';

  const embed = new EmbedBuilder()
    .setTitle('Araciniz verildi')
    .setDescription(
      `**${characterName}** icin hikayeniz analiz edildi ve araciniz garajiniza eklendi.\n\n` +
        `**${granted.label}** (\`${granted.model}\`)\n` +
        `Skor: ${granted.score} — ${granted.reason}\n` +
        `Garaj: **${granted.garage}**` +
        altText,
    )
    .setColor(0x2ecc71)
    .setTimestamp();

  applyVehicleImage(embed, granted.model);
  return embed;
}

/** @deprecated Staff onay akisi kaldirildi; sadece log/audit icin */
export function buildPlayerResultEmbed(
  characterName: string,
  recommendations: ScoredVehicle[],
): EmbedBuilder {
  return buildPlayerGrantedEmbed(
    characterName,
    {
      label: recommendations[0]?.label ?? '-',
      model: recommendations[0]?.vehicle ?? '-',
      garage: '-',
      score: recommendations[0]?.score ?? 0,
      reason: recommendations[0]?.reason ?? '',
    },
    recommendations,
  );
}

export function buildAuditEmbed(
  pending: PendingRequest,
  grant: { label: string; model: string; garage: string },
): EmbedBuilder {
  const profile = pending.analysis.character_profile;
  const embed = new EmbedBuilder()
    .setTitle('AI Otomatik Arac Verildi')
    .setColor(0x2ecc71)
    .addFields(
      { name: 'Karakter', value: pending.characterName, inline: true },
      { name: 'CitizenID', value: pending.citizenid, inline: true },
      { name: 'Arac', value: `${grant.label} (${grant.model})`, inline: true },
      { name: 'Garaj', value: grant.garage, inline: true },
      { name: 'Discord', value: `<@${pending.discordId}>`, inline: true },
      {
        name: 'Profil',
        value: `${profile.job_type} | ${profile.income_level} | ${profile.dominant_vibes.slice(0, 4).join(', ')}`,
        inline: false,
      },
    )
    .setFooter({ text: pending.requestId })
    .setTimestamp();

  applyVehicleImage(embed, grant.model);
  return embed;
}

export function buildLogEmbed(
  action: string,
  pending: Partial<PendingRequest> & { adminId?: string; model?: string; error?: string },
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`AI Arac Log — ${action}`)
    .setColor(action === 'granted' ? 0x2ecc71 : 0xe74c3c)
    .addFields(
      { name: 'Request', value: pending.requestId ?? '-', inline: true },
      { name: 'CitizenID', value: pending.citizenid ?? '-', inline: true },
      { name: 'Model', value: pending.model ?? '-', inline: true },
      { name: 'Admin', value: formatActor(pending.adminId), inline: true },
      { name: 'Detay', value: pending.error ?? '-', inline: false },
    )
    .setTimestamp();
}
