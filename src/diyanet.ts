import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayTimes, PrayerKey } from './types';
import { dateKey } from './time';
import PROVINCES from './data/diyanet-places.json';

/**
 * Diyanet'in resmi ilçe takvimi (ezanvakti.emushaf.net, Diyanet verisini aynen verir). Aladhan'ın
 * "Diyanet" yöntemi aynı takvimi formülle yaklaşık hesaplıyor; Akşam ve Yatsı çoğu gün 1 dk erken çıkıyordu.
 */
const BASE = 'https://ezanvakti.emushaf.net';
const TIMEOUT_MS = 15_000;

interface Province {
  /** Diyanet'teki il adı ("İSTANBUL") */
  n: string;
  /** [ilçe kimliği, ilçe adı] */
  d: [string, string][];
}

/** "İstanbul", "ISTANBUL", "Eyüpsultan" → "ISTANBUL", "EYUPSULTAN" (ı/İ, aksanlar ve boşluklar gider) */
function fold(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '');
}

/**
 * Ters geocode'un il ve ilçe adından Diyanet ilçe kimliğini bulur. İlçe Diyanet listesinde yoksa
 * (ör. Kadıköy, Çankaya) ilin merkez takvimi kullanılır; Diyanet de onları merkeze bağlar.
 */
export function findDiyanetId(province: string | null | undefined, towns: (string | null | undefined)[]): string | null {
  if (!province) return null;
  const p = fold(province.replace(/\s+(province|ili)$/i, ''));
  if (!p) return null;
  const match =
    (PROVINCES as Province[]).find((x) => fold(x.n) === p) ??
    (PROVINCES as Province[]).find((x) => p.length >= 4 && (fold(x.n).startsWith(p) || p.startsWith(fold(x.n))));
  if (!match) return null;
  for (const town of towns) {
    if (!town) continue;
    const t = fold(town);
    const hit = match.d.find(([, name]) => fold(name) === t);
    if (hit) return hit[0];
  }
  const center = match.d.find(([, name]) => fold(name) === fold(match.n)) ?? match.d[0];
  return center ? center[0] : null;
}

interface DiyanetDay {
  /** "14.10.2026" */
  MiladiTarihKisa: string;
  /** "3 Cemaziyelevvel 1448" */
  HicriTarihUzun: string;
  Imsak: string;
  Gunes: string;
  Ogle: string;
  Ikindi: string;
  Aksam: string;
  Yatsi: string;
}

const FIELDS: Record<PrayerKey, keyof DiyanetDay> = {
  Fajr: 'Imsak',
  Sunrise: 'Gunes',
  Dhuhr: 'Ogle',
  Asr: 'Ikindi',
  Maghrib: 'Aksam',
  Isha: 'Yatsi',
};

function parseDay(raw: DiyanetDay): DayTimes {
  const [dd, mm, yyyy] = raw.MiladiTarihKisa.split('.');
  const times = {} as Record<PrayerKey, string>;
  for (const key of Object.keys(FIELDS) as PrayerKey[]) times[key] = String(raw[FIELDS[key]]).slice(0, 5);
  return { date: `${yyyy}-${mm}-${dd}`, times, hijri: raw.HicriTarihUzun };
}

async function fetchDays(id: string): Promise<DayTimes[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/vakitler/${id}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Diyanet vakitleri alınamadı (${res.status})`);
    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) throw new Error('Beklenmeyen yanıt');
    return (json as DiyanetDay[]).map(parseDay);
  } finally {
    clearTimeout(timer);
  }
}

interface Cached {
  /** Çekildiği gün (YYYY-MM-DD) */
  fetched: string;
  days: DayTimes[];
}

/**
 * İlçenin bugünden itibaren ~30 günlük takvimi. Servis tek seferde ~30 gün verdiği için günde en fazla bir kez
 * çekilir (imsakiye 30 günü dolu kalsın); çekilemezse önbellekte bugün ve sonrası varsa o kullanılır.
 */
export async function getDiyanetDays(id: string, now: Date): Promise<DayTimes[]> {
  const key = `diyanet:v1:${id}`;
  const today = dateKey(now);
  let cached: Cached | null = null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) cached = JSON.parse(raw) as Cached;
  } catch {
    // önbellek okunamazsa internetten dene
  }
  if (cached && cached.fetched === today) return cached.days;
  try {
    const days = await fetchDays(id);
    try {
      await AsyncStorage.setItem(key, JSON.stringify({ fetched: today, days } satisfies Cached));
    } catch {
      // yazılamazsa sorun değil
    }
    return days;
  } catch (e) {
    // Birkaç günlük eski veri bildirim planı için yetmez; o zaman Aladhan'a düşülsün
    if (cached && cached.days.filter((d) => d.date >= today).length >= 3) return cached.days;
    throw e;
  }
}
