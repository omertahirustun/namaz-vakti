import { ImageSourcePropType } from 'react-native';
import { PrayerKey } from './types';

export interface ThemeColors {
  bg: string;
  card: string;
  cardAlt: string;
  /** card/cardAlt'ın opak karşılıkları: fotoğrafın görünmemesi gereken yüzeyler (alttan açılan pencere, butonlar) */
  solid: string;
  solidAlt: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  /** Geri sayım degradesi (heroGradient) üstündeki yazı rengi */
  onHero: string;
  highlight: string;
  green: string;
  danger: string;
  dangerBg: string;
  history: string;
}

export interface PhotoCredit {
  author: string;
  license: string;
}

export type ThemeId = 'default' | 'mecca' | 'medina' | 'aqsa';

export interface ThemeDefinition {
  id: ThemeId;
  /** Ayarlar ekranında gösterilen isim */
  label: string;
  colors: ThemeColors;
  /** Geri sayım kartının gradyanı */
  heroGradient: readonly [string, string];
  /** Her vaktin kendi rengi (ikonlarda) */
  prayerColors: Record<PrayerKey, string>;
  /** Kök seviyede arka plan fotoğrafı; yoksa düz renk (colors.bg) kullanılır */
  background?: ImageSourcePropType;
  /** Fotoğrafın okunabilirlik için üstüne konan koyu yarı saydam örtü rengi */
  overlay?: string;
  /** Ayarlar ekranındaki küçük önizleme kartı için küçültülmüş görsel */
  thumbnail?: ImageSourcePropType;
  statusBar: 'light' | 'dark';
  photoCredit?: PhotoCredit;
}

export const radius = 16;

/**
 * Fotoğraflı temalarda (zemin şeffaf) kartın dışında, doğrudan fotoğrafın üstünde duran yazılar için gölge;
 * örtü hafif olduğundan gölgesiz yazı kalabalık fotoğrafta kayboluyor. Düz temada boş döner.
 */
export function photoTextShadow(colors: ThemeColors) {
  return colors.bg === 'transparent'
    ? { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }
    : {};
}

/** Her vaktin kendi rengi (ikonlarda) — temalar arasında sabit, fotoğraflı kartların üstünde de okunur kalır */
const prayerColors: Record<PrayerKey, string> = {
  Fajr: '#6366F1',
  Sunrise: '#F97316',
  Dhuhr: '#EAB308',
  Asr: '#0EA5E9',
  Maghrib: '#F43F5E',
  Isha: '#8B5CF6',
};

const defaultTheme: ThemeDefinition = {
  id: 'default',
  label: 'Varsayılan Tema',
  colors: {
    // Sponsor (Adezyon Medya) logosunun lacivert-mavisi (#213A9F) ve beyazı: zemin bu mavinin çok açık tonu
    bg: '#E6EBF7',
    card: '#FFFFFF',
    cardAlt: '#EEF1FA',
    solid: '#FFFFFF',
    solidAlt: '#EEF1FA',
    border: '#C5CEEC',
    text: '#141F4D',
    muted: '#5A6690',
    accent: '#213A9F',
    onAccent: '#FFFFFF',
    onHero: '#FFFFFF',
    highlight: '#F59E0B',
    green: '#16A34A',
    danger: '#D6453A',
    dangerBg: '#FDECEA',
    history: '#7C3AED',
  },
  heroGradient: ['#3A55C8', '#1B2D82'],
  prayerColors,
  statusBar: 'dark',
};

const meccaTheme: ThemeDefinition = {
  id: 'mecca',
  label: 'Mescid-i Haram',
  colors: {
    bg: 'transparent',
    card: 'rgba(17,15,12,0.7)',
    cardAlt: 'rgba(38,32,18,0.58)',
    solid: '#1C1914',
    solidAlt: '#2C261A',
    border: 'rgba(212,175,110,0.35)',
    text: '#F6EFE2',
    muted: '#C7B89C',
    accent: '#D8AF68',
    onAccent: '#1C1406',
    onHero: '#FFF8EA',
    highlight: '#F2C14E',
    green: '#4ADE80',
    danger: '#F87171',
    dangerBg: 'rgba(248,113,113,0.18)',
    history: '#C9A6FF',
  },
  heroGradient: ['#A07834', '#5C4214'],
  prayerColors,
  background: require('../assets/themes/mecca.jpg'),
  overlay: 'rgba(5,4,2,0.22)',
  thumbnail: require('../assets/themes/thumbs/mecca.jpg'),
  statusBar: 'light',
};

const medinaTheme: ThemeDefinition = {
  id: 'medina',
  label: 'Mescid-i Nebevi',
  colors: {
    bg: 'transparent',
    card: 'rgba(23,30,24,0.68)',
    cardAlt: 'rgba(33,42,31,0.56)',
    solid: '#1A221B',
    solidAlt: '#283226',
    border: 'rgba(199,216,186,0.3)',
    text: '#F3EFE2',
    muted: '#C9D2C0',
    accent: '#7FB885',
    onAccent: '#0E1A10',
    onHero: '#F7F5EC',
    highlight: '#E7C878',
    green: '#4ADE80',
    danger: '#F87171',
    dangerBg: 'rgba(248,113,113,0.18)',
    history: '#C9A6FF',
  },
  heroGradient: ['#2F6E3D', '#4F8F58'],
  prayerColors,
  background: require('../assets/themes/medina.jpg'),
  overlay: 'rgba(5,10,6,0.2)',
  thumbnail: require('../assets/themes/thumbs/medina.jpg'),
  statusBar: 'light',
};

const aqsaTheme: ThemeDefinition = {
  id: 'aqsa',
  label: 'Mescid-i Aksa',
  colors: {
    bg: 'transparent',
    card: 'rgba(12,22,44,0.7)',
    cardAlt: 'rgba(24,38,70,0.58)',
    solid: '#101B35',
    solidAlt: '#1D2C4F',
    border: 'rgba(214,180,92,0.35)',
    text: '#F4F1E6',
    muted: '#B9C4DA',
    accent: '#E3BC5A',
    onAccent: '#1A1405',
    onHero: '#FFF8E6',
    highlight: '#F2C94C',
    green: '#4ADE80',
    danger: '#F87171',
    dangerBg: 'rgba(248,113,113,0.18)',
    history: '#C9A6FF',
  },
  heroGradient: ['#1F4C8F', '#B08A2E'],
  prayerColors,
  background: require('../assets/themes/aqsa.jpg'),
  overlay: 'rgba(8,16,36,0.22)',
  thumbnail: require('../assets/themes/thumbs/aqsa.jpg'),
  statusBar: 'light',
};

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  default: defaultTheme,
  mecca: meccaTheme,
  medina: medinaTheme,
  aqsa: aqsaTheme,
};

/** Ayarlarda gösterilen temalar (sırasıyla) */
export const THEME_ORDER: ThemeId[] = ['mecca', 'medina', 'aqsa', 'default'];

/** İlk açılışta ve kayıtlı tema artık listede yoksa kullanılan tema */
export const DEFAULT_THEME_ID: ThemeId = 'default';

export function isThemeId(v: unknown): v is ThemeId {
  return v === 'default' || v === 'mecca' || v === 'medina' || v === 'aqsa';
}
