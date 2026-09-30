import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PLACE, DEFAULT_SETTINGS, Place, Settings } from './types';

const SETTINGS_KEY = 'settings:v1';
const PLACE_KEY = 'place:v1';

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      enabled: { ...DEFAULT_SETTINGS.enabled, ...(parsed.enabled ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export async function loadPlace(): Promise<Place> {
  try {
    const raw = await AsyncStorage.getItem(PLACE_KEY);
    return raw ? (JSON.parse(raw) as Place) : DEFAULT_PLACE;
  } catch {
    return DEFAULT_PLACE;
  }
}

export async function savePlace(p: Place): Promise<void> {
  await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(p));
}
