// Widget'taki canlı geri sayımı Android'in Chronometer'ı işletir; metni hep "H:MM:SS" (1 saat ve üstü)
// ya da "MM:SS" verir. Uygulamadaki gibi baştaki sıfırları ve saniyesiz hali, Chronometer'ın format
// dizesiyle (Java String.format, "%.4s" = ilk 4 karakter) elde ediyoruz. 1 saatten az kalınca Chronometer'ın
// kendi "MM:SS" metni olduğu gibi gösterilir; son 10 / 5 dakikada renk ve boy da değişir. Biçim kalan süreye göre değiştiği için widget
// 10 saat, 1 saat, 10 dakika ve 5 dakika kala da yeniden çizilmeli (bkz. nextWidgetRefreshAt).

import type { ColorProp } from 'react-native-android-widget';
import { CountdownStage, SOON_MS, URGENT_MS } from '../time';

const HOUR = 3_600_000;

/** Kalan süreye göre Chronometer formatı: "02:36", 1 saatten az kalınca "59:59", "09:59"… */
export function countdownFormat(msLeft: number): string {
  if (msLeft >= 10 * HOUR) return '%.5s'; // "10:36:15" -> "10:36"
  if (msLeft >= HOUR) return '0%.4s'; // "2:36:15" -> "02:36"
  return '%s'; // "59:59" olduğu gibi
}

/** Son 10 dakikada kırmızımsı, son 5 dakikada koyu kırmızı; ikisi de gölgesiz (düz) çizilir. */
export const STAGE_COLORS: Record<Exclude<CountdownStage, 'normal'>, ColorProp> = {
  soon: '#FF8A80',
  urgent: '#C8102E',
};

/** Widget'ın bir sonraki yenilenmesi: vakit girişi ya da biçimin/rengin değiştiği an. */
export function nextWidgetRefreshAt(nextAt: Date, now: Date): number {
  const at = nextAt.getTime();
  // 10 dakika sınırı 1 sn erken: tam 10:00 kala son 10 dakika rengiyle çizilsin
  const candidates = [at - 10 * HOUR, at - HOUR, at - SOON_MS - 1_000, at - URGENT_MS, at].filter(
    (t) => t > now.getTime(),
  );
  // 1 sn pay: sınırın öbür tarafında çizilsin (vakit girişinde eski vakti bulmasın)
  return Math.min(...candidates) + 1_000;
}
