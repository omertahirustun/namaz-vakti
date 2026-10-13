export type PrayerKey = 'Fajr' | 'Sunrise' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export const PRAYER_KEYS: PrayerKey[] = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export const PRAYER_NAMES_TR: Record<PrayerKey, string> = {
  Fajr: 'İmsak',
  Sunrise: 'Güneş',
  Dhuhr: 'Öğle',
  Asr: 'İkindi',
  Maghrib: 'Akşam',
  Isha: 'Yatsı',
};

export interface DayTimes {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm, cihazın yerel saatinde */
  times: Record<PrayerKey, string>;
  hijri: string;
}

export interface Place {
  latitude: number;
  longitude: number;
  name: string;
}

export interface Settings {
  notificationsEnabled: boolean;
  /** Vakitten kaç dakika önce bildirim gelsin (0 = tam vaktinde) */
  offsetMinutes: number;
  enabled: Record<PrayerKey, boolean>;
  /** Aladhan hesaplama yöntemi (13 = Diyanet) */
  method: number;
  /** Ana ekran widget'larının görünümü ('theme' = uygulamanın seçili teması) */
  widgetStyle: WidgetStyle;
}

export type WidgetStyle = 'theme' | 'transparent' | 'gray' | 'black' | 'white';

export const WIDGET_STYLES: { id: WidgetStyle; label: string }[] = [
  { id: 'theme', label: 'Tema' },
  { id: 'transparent', label: 'Şeffaf' },
  { id: 'gray', label: 'Gri' },
  { id: 'black', label: 'Siyah' },
  { id: 'white', label: 'Beyaz' },
];

export const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  offsetMinutes: 0,
  enabled: { Fajr: true, Sunrise: false, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
  method: 13,
  widgetStyle: 'theme',
};

export const DEFAULT_PLACE: Place = {
  latitude: 41.0082,
  longitude: 28.9784,
  name: 'İstanbul',
};

export const CALC_METHODS: { id: number; label: string }[] = [
  { id: 13, label: 'Diyanet İşleri Başkanlığı' },
  { id: 3, label: 'Muslim World League' },
  { id: 2, label: 'ISNA (Kuzey Amerika)' },
  { id: 4, label: 'Umm al-Qura (Mekke)' },
  { id: 5, label: 'Mısır Genel Otoritesi' },
];
