import OngoingNotification from '../modules/ongoing-notification';
import { dateKey, toDate } from './time';
import { DayTimes, PRAYER_KEYS, PRAYER_NAMES_TR } from './types';

/** Kalıcı "vakte kalan" bildirimi bu cihazda kullanılabilir mi (Android derlemesi) */
export const ongoingSupported = OngoingNotification != null;

/**
 * Kalıcı bildirimin vakitlerini (gün gün, açık hâlde günün altı vakti de gösterilir) yerel modüle yazar.
 * Bildirim sonraki vakitlere kendi alarmıyla geçtiği için
 * elimizdeki tüm günler (bu ay + gelecek ay) verilir; uygulama haftalarca açılmasa da çalışmaya devam eder.
 */
export function syncOngoingNotification(days: DayTimes[], placeName: string, enabled: boolean): void {
  if (!OngoingNotification) return;
  const today = dateKey(new Date());
  const payload = days
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      prayers: PRAYER_KEYS.map((key) => ({
        at: toDate(d.date, d.times[key]).getTime(),
        name: PRAYER_NAMES_TR[key],
        time: d.times[key],
      })),
    }));
  try {
    OngoingNotification.sync(enabled, placeName, JSON.stringify(payload));
  } catch {
    // bildirim kurulamazsa uygulama etkilenmesin
  }
}
