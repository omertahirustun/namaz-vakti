import AsyncStorage from '@react-native-async-storage/async-storage';
import { DayTimes, Place, PRAYER_KEYS, PrayerKey } from './types';
import { pad } from './time';

const BASE = 'https://api.aladhan.com/v1';

interface AladhanDay {
  timings: Record<string, string>;
  date: {
    gregorian: { date: string };
    hijri: { day: string; year: string; month: { number: number } };
  };
}

// API ayları İngilizce transliterasyonla verir ("Rabīʿ al-thānī"); Türkçe adları kullan.
const HIJRI_MONTHS_TR = [
  'Muharrem', 'Safer', 'Rebiülevvel', 'Rebiülahir', 'Cemaziyelevvel', 'Cemaziyelahir',
  'Recep', 'Şaban', 'Ramazan', 'Şevval', 'Zilkade', 'Zilhicce',
];

function parseDay(raw: AladhanDay): DayTimes {
  // "01-09-2026" -> "2026-09-01"
  const [dd, mm, yyyy] = raw.date.gregorian.date.split('-');
  const times = {} as Record<PrayerKey, string>;
  for (const key of PRAYER_KEYS) {
    // "05:12 (+03)" -> "05:12"
    times[key] = raw.timings[key].slice(0, 5);
  }
  const h = raw.date.hijri;
  return {
    date: `${yyyy}-${mm}-${dd}`,
    times,
    hijri: `${Number(h.day)} ${HIJRI_MONTHS_TR[h.month.number - 1]} ${h.year}`,
  };
}

function cacheKey(place: Place, method: number, year: number, month: number): string {
  return `month:v2:${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}:${method}:${year}-${pad(month)}`;
}

async function fetchMonth(place: Place, method: number, year: number, month: number): Promise<DayTimes[]> {
  const url =
    `${BASE}/calendar/${year}/${month}` +
    `?latitude=${place.latitude}&longitude=${place.longitude}&method=${method}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Vakit servisi hata verdi (${res.status})`);
  const json = await res.json();
  if (!json?.data || !Array.isArray(json.data)) throw new Error('Beklenmeyen yanıt');
  return (json.data as AladhanDay[]).map(parseDay);
}

/** Önce önbelleğe bakar; yoksa internetten çeker ve önbelleğe yazar. */
export async function getMonth(
  place: Place,
  method: number,
  year: number,
  month: number,
): Promise<DayTimes[]> {
  const key = cacheKey(place, method, year, month);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) return JSON.parse(cached) as DayTimes[];
  } catch {
    // önbellek okunamazsa internetten dene
  }
  const days = await fetchMonth(place, method, year, month);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(days));
  } catch {
    // yazılamazsa sorun değil
  }
  return days;
}

/** Bu ay + gelecek ay (bildirim planı ve gün geçişleri için). */
export async function getTwoMonths(place: Place, method: number, now: Date): Promise<DayTimes[]> {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const current = await getMonth(place, method, y, m);
  let next: DayTimes[] = [];
  try {
    next = await getMonth(place, method, ny, nm);
  } catch {
    // gelecek ay alınamazsa bu ayla devam et
  }
  return [...current, ...next];
}
