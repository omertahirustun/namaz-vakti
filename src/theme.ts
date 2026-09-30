import { PrayerKey } from './types';

export const colors = {
  bg: '#EEF7F5',
  card: '#FFFFFF',
  cardAlt: '#F1F8F6',
  border: '#D5E9E3',
  text: '#15332D',
  muted: '#6E8C85',
  accent: '#0A8C77',
  onAccent: '#FFFFFF',
  highlight: '#F59E0B',
  green: '#16A34A',
  danger: '#D6453A',
  dangerBg: '#FDECEA',
  history: '#7C3AED',
};

/** Geri sayım kartının gradyanı */
export const heroGradient = ['#0EA58B', '#1FB6C9'] as const;

/** Her vaktin kendi rengi (ikonlarda) */
export const prayerColors: Record<PrayerKey, string> = {
  Fajr: '#6366F1',
  Sunrise: '#F97316',
  Dhuhr: '#EAB308',
  Asr: '#0EA5E9',
  Maghrib: '#F43F5E',
  Isha: '#8B5CF6',
};

export const radius = 16;
