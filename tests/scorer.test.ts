/// <reference types="node" />

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  diversifyCloseRecommendations,
  loadVehicleCatalog,
  rankVehicles,
  scoreVehicle,
} from '../src/services/scorer.js';
import type { CharacterProfile } from '../src/types.js';

loadVehicleCatalog();

function profile(overrides: Partial<CharacterProfile>): CharacterProfile {
  return {
    income_level: 'mid',
    origin: 'urban',
    age_group: 'adult',
    job_type: 'civilian',
    lifestyle: 'practical',
    flashiness: 3,
    vehicle_need: 'daily transport',
    dominant_vibes: ['practical'],
    personality: ['calm'],
    ...overrides,
  };
}

function topClass(profileData: CharacterProfile): string | undefined {
  const catalog = loadVehicleCatalog();
  const top = rankVehicles(profileData, 1)[0].vehicle;
  return catalog.vehicles.find((v) => v.model === top)?.class;
}

function topVehicleEntry(profileData: CharacterProfile) {
  const catalog = loadVehicleCatalog();
  const top = rankVehicles(profileData, 1)[0];
  const entry = catalog.vehicles.find((v) => v.model === top.vehicle);
  return { top, entry };
}

describe('scoreVehicle', () => {
  it('whitelist araclari skorlar', () => {
    const catalog = loadVehicleCatalog();
    const seminole = catalog.vehicles.find((v) => v.model === 'seminole')!;
    const score = scoreVehicle(
      profile({
        origin: 'suburban',
        lifestyle: 'family',
        vehicle_need: 'suv - aile ve kamp',
        dominant_vibes: ['family', 'camping', 'outdoor', 'practical'],
      }),
      seminole,
    );
    assert.ok(score > 60);
  });

  it('bad_fit dusuk skor uretir', () => {
    const catalog = loadVehicleCatalog();
    const voodoo = catalog.vehicles.find((v) => v.model === 'voodoo')!;
    // primo: professional/reliable sedan — police profiline voodoo'dan daha uygun olmalı
    const primo = catalog.vehicles.find((v) => v.model === 'primo')!;
    const police = profile({
      job_type: 'police',
      lifestyle: 'professional',
      dominant_vibes: ['law_enforcement', 'official', 'disciplined'],
    });
    assert.ok(scoreVehicle(police, voodoo) < scoreVehicle(police, primo));
  });
});

describe('rankVehicles', () => {
  it('15 yas altina motorlu arac yerine BMX verir', () => {
    const underage = profile({
      age: 15,
      age_group: 'young',
      vehicle_need: 'okula gidip gelmek icin ehliyetsiz ulasim',
      dominant_vibes: ['student', 'no_license', 'budget'],
    });
    assert.equal(topClass(underage), 'bmx');
  });

  it('universite/kurye/ilk arac profilinde compact onceliklidir', () => {
    const studentCourier = profile({
      age: 19,
      age_group: 'young',
      job_type: 'worker',
      income_level: 'low',
      vehicle_need: 'ilk arac, kurye isi, sehir ici ekonomik ulasim',
      dominant_vibes: ['student', 'delivery', 'starter_car', 'budget'],
      personality: ['young', 'practical'],
    });
    assert.equal(topClass(studentCourier), 'compact');
  });

  it('Sandy Shores ciftci/tamirci profilinde offroad veya is araci onceliklidir', () => {
    const sandyWorker = profile({
      origin: 'rural',
      job_type: 'mechanic',
      income_level: 'lower_mid',
      vehicle_need: 'Sandy Shores tamirci, hurda ve arazi yollari',
      dominant_vibes: ['sandy_shores', 'mechanic', 'rural', 'scrapper'],
      personality: ['tough', 'practical'],
    });
    const vehicleClass = topClass(sandyWorker);
    assert.ok(vehicleClass === 'offroad' || vehicleClass === 'van' || vehicleClass === 'muscle');
  });

  it('aile/kamp hikayesinde SUV veya van onceliklidir', () => {
    const familyCamper = profile({
      lifestyle: 'family',
      vehicle_need: 'aile, hafta sonu kamp, sehir disi yolculuk',
      dominant_vibes: ['family', 'camping', 'outdoor', 'suburban'],
      personality: ['mature', 'practical'],
    });
    const vehicleClass = topClass(familyCamper);
    assert.ok(vehicleClass === 'suv' || vehicleClass === 'van');
  });

  it('explicit lowrider koleksiyoncu/old-school hikayesinde Voodoo onceliklidir', () => {
    const lowriderGang = profile({
      job_type: 'criminal',
      lifestyle: 'criminal',
      vehicle_need: 'lowrider koleksiyoneri, eski okul mahalle klasigi ve klasik Amerikan cruiser',
      dominant_vibes: ['lowrider', 'old_school_gang', 'collector', 'old_school'],
      personality: ['street_smart', 'proud', 'old_school'],
    });
    const top = rankVehicles(lowriderGang, 3).map((r) => r.vehicle);
    assert.ok(top.includes('voodoo'), `Lowrider profili voodoo icermeli, top: ${top.join(', ')}`);
  });

  it('modern zengin ceteci lowrider yerine sedan/SUV/modern guclu arac alir', () => {
    const modernGang = profile({
      age: 28,
      income_level: 'high',
      job_type: 'criminal',
      lifestyle: 'flashy',
      flashiness: 6,
      vehicle_need: '2026 modern cete, zengin gorunumlu temiz SUV veya sedan, dikkat cekmeden guc gosteren arac',
      dominant_vibes: ['modern_gang', 'rich_criminal', 'clean_look', 'high_status'],
      personality: ['ambitious', 'bold'],
    });
    const top = rankVehicles(modernGang, 3);
    const topModels = top.map((r) => r.vehicle);
    const catalog = loadVehicleCatalog();
    const topClasses = top.map((r) => catalog.vehicles.find((v) => v.model === r.vehicle)?.class);
    assert.ok(!topModels.includes('voodoo'), `Voodoo modern gang top-3 olmamali: ${topModels.join(', ')}`);
    assert.ok(topClasses.some((c) => c === 'sedan' || c === 'suv' || c === 'muscle'));
  });

  it('gang kelimesi tek basina lowrider top-1 yapmaz', () => {
    const plainGang = profile({
      job_type: 'criminal',
      lifestyle: 'criminal',
      vehicle_need: 'gang uyesi, 2026 sehirde gezen temiz gorunumlu arac',
      dominant_vibes: ['gang', 'urban', 'clean_look'],
      personality: ['street_smart'],
    });
    assert.notEqual(rankVehicles(plainGang, 1)[0].vehicle, 'voodoo');
  });

  it('low-profile criminal dikkat cekmeyen sedan/compact/SUV alir', () => {
    const lowProfile = profile({
      income_level: 'mid',
      job_type: 'criminal',
      lifestyle: 'low_profile',
      flashiness: 2,
      vehicle_need: 'low profile criminal, dikkat cekmeyen sivil gorunumlu temiz plaka arac',
      dominant_vibes: ['low_profile_criminal', 'clean_look', 'urban'],
      personality: ['calm', 'careful'],
    });
    const catalog = loadVehicleCatalog();
    const top = rankVehicles(lowProfile, 1)[0];
    const vehicleClass = catalog.vehicles.find((v) => v.model === top.vehicle)?.class;
    assert.ok(vehicleClass === 'sedan' || vehicleClass === 'compact' || vehicleClass === 'suv');
    assert.notEqual(top.vehicle, 'voodoo');
  });

  it('polis/belediye/orta yas profilinde resmi sedan onceliklidir', () => {
    const official = profile({
      age: 42,
      age_group: 'middle_aged',
      job_type: 'police',
      lifestyle: 'professional',
      vehicle_need: 'eski polis, belediye ve guvenlik isleri icin resmi sedan',
      dominant_vibes: ['law_enforcement', 'official', 'disciplined', 'low_profile'],
      personality: ['mature', 'serious'],
    });
    const top = rankVehicles(official, 3).map((r) => r.vehicle);
    assert.ok(top.includes('emperor') || top.includes('premier') || top.includes('primo'),
      `Polis profili sedana yonelmeli, top: ${top.join(', ')}`);
  });

  it('kadin karakterde babadan kalan arac sinyali eski/yadigar araci one alir', () => {
    const inherited = profile({
      gender: 'female',
      age: 24,
      age_group: 'young',
      income_level: 'lower_mid',
      vehicle_need: 'babasindan kalan aile yadigari eski arac, kasabada kullaniliyor',
      dominant_vibes: ['father_legacy', 'inherited', 'sentimental', 'small_town'],
      personality: ['modest', 'family_oriented'],
    });
    const top = rankVehicles(inherited, 3).map((r) => r.vehicle);
    // Mevcut katalogda eski/yadigar araçlar: emperor (old_school, reliable), glendale (classic, old_school)
    assert.ok(top.includes('emperor') || top.includes('glendale') || top.includes('manana'),
      `Yadigar profili eski/klasik araca yonelmeli, top: ${top.join(', ')}`);
  });

  it('sert ve ciddi karakterde daha ciddi/tough gorunumlu arac onerir', () => {
    const catalog = loadVehicleCatalog();
    const seriousTough = profile({
      gender: 'male',
      age: 31,
      lifestyle: 'low_profile',
      vehicle_need: 'sert ciddi az konusan karakter, dayanikli ve ciddi gorunumlu arac',
      dominant_vibes: ['serious', 'tough', 'low_profile', 'disciplined'],
      personality: ['serious', 'tough'],
    });
    const top = rankVehicles(seriousTough, 1)[0];
    const entry = catalog.vehicles.find((v) => v.model === top.vehicle);
    // Sert/ciddi düşük profilli karakter: flashy değil, yüksek attention_level yok
    assert.ok((entry?.flashiness ?? 10) <= 4, `Sert profil düşük flashiness almalı: ${top.vehicle}`);
    assert.ok((entry?.attention_level ?? 10) <= 4, `Sert profil düşük attention_level almalı: ${top.vehicle}`);
  });

  it('her zaman 1-100 arasi skor doner', () => {
    const ranked = rankVehicles(profile({ dominant_vibes: ['practical', 'worker'] }), 5);
    assert.equal(ranked.length, 5);
    for (const item of ranked) {
      assert.ok(item.score >= 0 && item.score <= 100);
      assert.ok(item.reason.length > 10);
    }
  });

  it('kasiyer dusuk gelir profilinde performance/status arac one cikmaz', () => {
    const cashier = profile({
      age: 20,
      age_group: 'young',
      income_level: 'low',
      job_type: 'worker',
      career_stage: 'new_worker',
      life_stage: 'first_vehicle',
      financial_pressure: 'high',
      family_support: 'limited',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'kasiyer isi, ise gidip gelmek icin ekonomik ilk arac',
      dominant_vibes: ['worker', 'starter_car', 'budget', 'practical'],
      personality: ['modest', 'practical'],
    });
    const { top, entry } = topVehicleEntry(cashier);
    assert.ok(entry?.utility_tags?.some((tag) => ['starter_car', 'daily_driver', 'fuel_economy'].includes(tag)), top.vehicle);
    assert.ok((entry?.flashiness ?? 10) <= 3, top.vehicle);
  });

  it('yeni tamirci pahali/status arac yerine pratik/uygun arac alir', () => {
    const newMechanic = profile({
      age: 22,
      age_group: 'young',
      income_level: 'lower_mid',
      job_type: 'mechanic',
      career_stage: 'new_worker',
      life_stage: 'early_career',
      financial_pressure: 'medium',
      vehicle_purpose: 'work',
      vehicle_need: 'yeni tamirci, ufak alet ve parca tasiyacak is araci',
      dominant_vibes: ['mechanic', 'worker', 'practical', 'service'],
      personality: ['hardworking', 'practical'],
    });
    const { top, entry } = topVehicleEntry(newMechanic);
    // Status/performance araç almamalı — flashiness düşük ve muscle/sports sınıfı değil
    assert.ok((entry?.flashiness ?? 10) < 5, `Yeni tamirci flashy olmayan arac almali: ${top.vehicle}`);
    assert.notEqual(entry?.class, 'sports');
    assert.notEqual(entry?.class, 'muscle');
  });

  it('universite ogrencisi Buffalo STX mantigina kaymadan ekonomik ilk arac alir', () => {
    const student = profile({
      age: 19,
      age_group: 'young',
      income_level: 'low',
      job_type: 'civilian',
      career_stage: 'student',
      life_stage: 'first_vehicle',
      financial_pressure: 'high',
      family_support: 'limited',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'universite ogrencisi, okula gidip gelmek icin yakit ekonomik ilk arac',
      dominant_vibes: ['student', 'starter_car', 'budget', 'city'],
      personality: ['young', 'practical'],
    });
    const { top, entry } = topVehicleEntry(student);
    assert.ok(entry?.utility_tags?.some((tag) => ['starter_car', 'daily_driver', 'fuel_economy'].includes(tag)), top.vehicle);
    assert.notEqual(entry?.class, 'muscle');
  });

  it('sehirli customs/audio-wrap profili Duneloader yerine utility/service sınıfina gider', () => {
    const urbanCustoms = profile({
      age: 21,
      age_group: 'young',
      income_level: 'lower_mid',
      origin: 'urban',
      job_type: 'worker',
      career_stage: 'new_worker',
      life_stage: 'early_career',
      financial_pressure: 'medium',
      family_support: 'limited',
      vehicle_purpose: 'equipment_transport',
      vehicle_need: 'sehir ici mahallede buyumus, aile garajinda ses sistemi ve kaplama isi ogreniyor, mahalle musterilerine hizmet veriyor, parca ve ekipman tasimasi lazim',
      dominant_vibes: ['working_class', 'urban', 'practical', 'service', 'equipment_transport', 'car_audio', 'wrap'],
      personality: ['hardworking', 'ambitious', 'practical'],
    });
    const topThree = rankVehicles(urbanCustoms, 3);
    const { top, entry } = topVehicleEntry(urbanCustoms);
    // Şehirli ekipman profili: rural-only (rebel) almamalı, flashy de olmamalı
    assert.ok(!topThree.some((item) => item.vehicle === 'rebel'),
      `Sehirli profil rural-only rebel almamali: ${topThree.map((i) => i.vehicle).join(', ')}`);
    assert.ok((entry?.flashiness ?? 10) < 5, `Sehirli ekipman profili flashy olmayan arac almali: ${top.vehicle}`);
  });

  it('sehir ici is profili rural-only hurda araclarini kolay almaz', () => {
    const cityWorker = profile({
      age: 25,
      age_group: 'adult',
      income_level: 'lower_mid',
      origin: 'urban',
      job_type: 'mechanic',
      career_stage: 'stable_worker',
      vehicle_purpose: 'work',
      vehicle_need: 'Los Santos icinde servis isi yapan tamirci, musteri araci alir getirir, gunluk sehir ici is kullanimina uygun arac',
      dominant_vibes: ['urban', 'service', 'worker', 'practical'],
      personality: ['hardworking', 'practical'],
    });
    const topFive = rankVehicles(cityWorker, 5).map((item) => item.vehicle);
    // rebel: rural-only cezası alır, şehir tamircisinin top-5'inde çıkmamalı
    assert.ok(!topFive.includes('rebel'), topFive.join(', '));
  });

  it('Rural hurda/kasabadan sehire is profilinde offroad/pickup one cikar', () => {
    const scrapWorker = profile({
      age: 24,
      age_group: 'adult',
      income_level: 'lower_mid',
      origin: 'rural',
      job_type: 'mechanic',
      career_stage: 'stable_worker',
      life_stage: 'early_career',
      vehicle_purpose: 'equipment_transport',
      vehicle_need: 'Blaine County ve Sandy Shores civarinda hurda sahasi isletiyor, kaynak cekici motor tamiri yapar, kasabadan sehire hurda parca ve ekipman tasima isi',
      dominant_vibes: ['rural', 'sandy_shores', 'scrapper', 'mechanic', 'workhorse'],
      personality: ['hardworking', 'rough', 'practical'],
    });
    const catalog = loadVehicleCatalog();
    const topThree = rankVehicles(scrapWorker, 3);
    const topClasses = topThree.map((item) => catalog.vehicles.find((v) => v.model === item.vehicle)?.class);
    // Rural hurda profili: offroad, pickup veya van üstün olmalı
    assert.ok(
      topClasses.some((c) => c === 'offroad' || c === 'pickup' || c === 'van'),
      `Rural hurda profili offroad/pickup/van almalı: ${topThree.map((i) => i.vehicle).join(', ')}`,
    );
  });

  it('sehir ici ama sucsuz working-class aile lowrider/muscle otomatik almaz', () => {
    const workingClass = profile({
      age: 23,
      age_group: 'young',
      income_level: 'lower_mid',
      origin: 'urban',
      job_type: 'worker',
      lifestyle: 'practical',
      financial_pressure: 'medium',
      family_support: 'stable',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'sehir ici mahallede buyudu, ailesi calisiyor, suc gecmisi yok, ise gidip gelmek icin sade arac',
      dominant_vibes: ['working_class', 'practical', 'low_profile', 'urban'],
      personality: ['modest', 'practical'],
    });
    const { top, entry } = topVehicleEntry(workingClass);
    assert.notEqual(top.vehicle, 'voodoo');
    assert.notEqual(entry?.class, 'muscle');
  });

  it('basketbol hobisi tek basina sports/performance arac tetiklemez', () => {
    const basketball = profile({
      age: 20,
      age_group: 'young',
      income_level: 'low',
      career_stage: 'student',
      life_stage: 'first_vehicle',
      financial_pressure: 'high',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'universite ogrencisi, basketbol oynuyor, okula ve antrenmana ekonomik ulasim',
      dominant_vibes: ['student', 'sport', 'active', 'budget'],
      personality: ['active', 'disciplined'],
    });
    const { top, entry } = topVehicleEntry(basketball);
    assert.ok((entry?.flashiness ?? 10) <= 3, top.vehicle);
    assert.notEqual(entry?.class, 'muscle');
  });

  it('gelir progression sinyali bugunku ilk araci abartmaz', () => {
    const progression = profile({
      age: 19,
      age_group: 'young',
      income_level: 'low',
      career_stage: 'new_worker',
      life_stage: 'first_vehicle',
      financial_pressure: 'high',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'ilk arac Asea gibi olmali, isler buyuyunce Bobcat XL, basarili olunca daha iyi sedan hedefliyor',
      dominant_vibes: ['starter_car', 'ambitious', 'practical', 'budget'],
      personality: ['ambitious', 'practical'],
    });
    const { top, entry } = topVehicleEntry(progression);
    assert.ok(entry?.utility_tags?.some((tag) => ['starter_car', 'daily_driver', 'fuel_economy'].includes(tag)), top.vehicle);
    assert.ok(top.reason.includes('Sebepler:'), top.reason);
  });

  it('hikayede is amaci yoksa yeni calisan sebebi is odakli yazmaz', () => {
    const earlyCareer = profile({
      age: 21,
      age_group: 'young',
      income_level: 'lower_mid',
      career_stage: 'new_worker',
      life_stage: 'early_career',
      vehicle_purpose: 'daily_commute',
      vehicle_need: 'sehir ici gunluk ulasim, okul ve sosyal hayat icin ekonomik arac',
      dominant_vibes: ['urban', 'practical', 'starter_car'],
      personality: ['calm', 'practical'],
    });
    const top = rankVehicles(earlyCareer, 1)[0];
    assert.ok(!top.reason.includes('is kullanimi'), top.reason);
    assert.ok(!top.reason.includes('is odakli'), top.reason);
  });
});

describe('diversifyCloseRecommendations', () => {
  const closeRecommendations = [
    { vehicle: 'premier', label: 'Declasse Premier', score: 100, reason: 'a' },
    { vehicle: 'primo',   label: 'Albany Primo',     score: 100, reason: 'b' },
    { vehicle: 'emperor', label: 'Albany Emperor',   score: 98,  reason: 'c' },
    { vehicle: 'bjxl',   label: 'Karin BeeJay XL',  score: 96,  reason: 'd' },
    { vehicle: 'voodoo', label: 'Declasse Voodoo',   score: 80,  reason: 'e' },
  ];

  it('top skora 5 puan yakin adaylari seed ile cesitlendirir', () => {
    const firstVehicles = new Set(
      Array.from({ length: 20 }, (_, i) =>
        diversifyCloseRecommendations(closeRecommendations, `seed-${i}`)[0].vehicle,
      ),
    );
    assert.ok(firstVehicles.size > 1);
    assert.ok(!firstVehicles.has('voodoo'));
  });

  it('5 puandan uzak adaylari yakin skor havuzuna sokmaz', () => {
    const diversified = diversifyCloseRecommendations(closeRecommendations, 'seed-1');
    assert.equal(diversified[diversified.length - 1].vehicle, 'voodoo');
  });

  it('ayni seed ayni siralamayi uretir', () => {
    assert.deepEqual(
      diversifyCloseRecommendations(closeRecommendations, 'same-seed'),
      diversifyCloseRecommendations(closeRecommendations, 'same-seed'),
    );
  });
});
