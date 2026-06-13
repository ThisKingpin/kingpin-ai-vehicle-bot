import { z } from 'zod';

export const CharacterProfileSchema = z.object({
  income_level: z.enum(['low', 'lower_mid', 'mid', 'upper_mid', 'high']),
  origin: z.enum(['rural', 'small_town', 'suburban', 'urban', 'unknown']),
  age_group: z.enum(['young', 'adult', 'middle_aged', 'old']),
  age: z.number().int().min(0).max(120).optional(),
  gender: z.enum(['male', 'female', 'unknown']).optional(),
  job_type: z.enum(['police', 'worker', 'criminal', 'business', 'unemployed', 'mechanic', 'civilian', 'other']),
  lifestyle: z.enum(['practical', 'flashy', 'low_profile', 'family', 'criminal', 'professional', 'drifter', 'ambitious']),
  flashiness: z.number().min(1).max(10),
  vehicle_need: z.string(),
  vehicle_purpose: z.enum(['daily_commute', 'work', 'equipment_transport', 'family', 'recreation', 'status', 'project', 'weekend']).optional(),
  financial_pressure: z.enum(['low', 'medium', 'high']).optional(),
  family_support: z.enum(['none', 'limited', 'stable', 'wealthy']).optional(),
  life_stage: z.enum(['first_vehicle', 'early_career', 'established', 'successful']).optional(),
  career_stage: z.enum(['student', 'new_worker', 'stable_worker', 'small_business', 'established_professional']).optional(),
  dominant_vibes: z.array(z.string()).min(1),
  personality: z.array(z.string()).optional(),
  risk_level: z.enum(['low', 'medium', 'high']).optional(),
});

export const AiAnalysisSchema = z.object({
  character_profile: CharacterProfileSchema,
  rejected_vehicle_types: z.array(z.object({
    type: z.string(),
    reason: z.string(),
  })).optional(),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  needs_admin_review: z.boolean().optional(),
});

export type CharacterProfile = z.infer<typeof CharacterProfileSchema>;
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

export interface VehicleEntry {
  model: string;
  label: string;
  class: string;
  price_tier: string;
  vibes: string[];
  fits_jobs: string[];
  fits_personality: string[];
  bad_fits: string[];
  flashiness: number;
  attention_level: number;
  realism_score: number;
  min_age?: number;
  license_type?: 'car' | 'motorcycle' | 'bicycle';
  utility_tags?: string[];
}

export interface VehicleCatalog {
  version: number;
  vehicles: VehicleEntry[];
}

export interface ScoredVehicle {
  vehicle: string;
  label: string;
  score: number;
  reason: string;
}

export interface VerifyCharacterResponse {
  success: boolean;
  citizenid?: string;
  characterName?: string;
  job?: Record<string, unknown>;
  vehiclesVersion?: number;
  error?: string;
  code?: string;
}

export interface PendingRequest {
  requestId: string;
  grantToken: string;
  citizenid: string;
  characterName: string;
  discordId: string;
  serverName: string;
  storyText: string;
  storyHash?: string;
  vehiclesVersion?: number;
  analysis: AiAnalysis;
  recommendations: ScoredVehicle[];
}
