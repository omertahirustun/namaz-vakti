import { DayTimes, PRAYER_KEYS, PrayerKey } from './types';

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-09-29" + "05:12" -> yerel saatte Date */
export function toDate(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export interface NextPrayer {
  key: PrayerKey;
  at: Date;
}

/** Şu andan sonraki ilk vakti bulur (yarının imsakına kadar bakar). */
export function findNext(days: DayTimes[], now: Date): NextPrayer | null {
  const today = dateKey(now);
  const upcoming = days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  for (const day of upcoming) {
    for (const key of PRAYER_KEYS) {
      const at = toDate(day.date, day.times[key]);
      if (at.getTime() > now.getTime()) return { key, at };
    }
  }
  return null;
}

/** İçinde bulunulan vakit: şu andan önceki son vakit (imsaktan önceyse dünün yatsısı). */
export function findCurrent(days: DayTimes[], now: Date): NextPrayer | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let current: NextPrayer | null = null;
  for (const day of sorted) {
    for (const key of PRAYER_KEYS) {
      const at = toDate(day.date, day.times[key]);
      if (at.getTime() > now.getTime()) return current ?? previousIsha(day);
      current = { key, at };
    }
  }
  return current;
}

/**
 * Ayın 1'inde gece yarısından sonra dünün verisi yüklü değildir; dünün yatsısı
 * yerine bugünkü yatsının bir gün öncesini kullan (günler arası fark 1–2 dk).
 */
function previousIsha(day: DayTimes): NextPrayer {
  const at = toDate(day.date, day.times.Isha);
  at.setDate(at.getDate() - 1);
  return { key: 'Isha', at };
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const DAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function longDateTr(d: Date): string {
  return `${d.getDate()} ${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}, ${DAYS_TR[d.getDay()]}`;
}

const DAYS_SHORT_TR = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** "2026-10-02" -> { weekday: "Cuma", weekdayShort: "Cum", day: 2, dayMonth: "2 Ekim" } */
export function dayPartsTr(dateStr: string): { weekday: string; weekdayShort: string; day: number; dayMonth: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  return { weekday: DAYS_TR[wd], weekdayShort: DAYS_SHORT_TR[wd], day: d, dayMonth: `${d} ${MONTHS_TR[m - 1]}` };
}
