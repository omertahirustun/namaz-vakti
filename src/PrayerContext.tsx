import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getTwoMonths } from './api';
import { getCurrentPlace } from './location';
import { rescheduleNotifications } from './notifications';
import { loadPlace, loadSettings, savePlace, saveSettings } from './storage';
import { DEFAULT_PLACE, DEFAULT_SETTINGS, DayTimes, Place, Settings } from './types';

interface PrayerContextValue {
  place: Place;
  settings: Settings;
  days: DayTimes[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Önceki ayarı alan fonksiyon da verilebilir; art arda değişiklikler birbirini ezmez. */
  updateSettings: (patch: Partial<Settings> | ((prev: Settings) => Partial<Settings>)) => Promise<void>;
  locateMe: () => Promise<boolean>;
}

const PrayerContext = createContext<PrayerContextValue | null>(null);

/** Değişince vakitlerin yeniden çekilmesi gereken ayarlar */
const DATA_KEYS: (keyof Settings)[] = ['method'];
/** Değişince yalnız bildirim planının yeniden kurulması gereken ayarlar (geri kalanlar hiçbir şeyi yeniden yüklemez) */
const NOTIFICATION_KEYS: (keyof Settings)[] = ['notificationsEnabled', 'offsetMinutes', 'enabled', 'sound'];

function changed(prev: Settings, next: Settings, keys: (keyof Settings)[]): boolean {
  return keys.some((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
}

function samePlace(a: Place, b: Place): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude && a.name === b.name && a.diyanetId === b.diyanetId;
}

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DayTimes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Geri çağırmalar ref'lerden okur ki kimlikleri sabit kalsın (her değişiklikte tüm ekranlar yeniden çizilmesin)
  const settingsRef = useRef(settings);
  const placeRef = useRef(place);
  const daysRef = useRef(days);
  const loadId = useRef(0);

  const applyPlace = useCallback((p: Place) => {
    if (samePlace(placeRef.current, p)) return;
    placeRef.current = p;
    setPlace(p);
  }, []);

  /**
   * Vakitleri çeker (önbellekten anında) ve bildirimleri planlar. Ekranda zaten vakit varken yükleme göstergesi
   * açılmaz; yalnız ilk açılışta ve kullanıcı aşağı çekip yenileyince görünür.
   */
  const load = useCallback(async (p: Place, s: Settings, showSpinner = false) => {
    const id = ++loadId.current;
    if (showSpinner || daysRef.current.length === 0) setLoading(true);
    setError(null);
    try {
      const data = await getTwoMonths(p, s.method, new Date());
      // Bu arada daha yeni bir yükleme başladıysa eski sonucu uygulama
      if (id !== loadId.current) return;
      // Önbellekten aynı vakitler geldiyse dizi kimliğini koru (widget'lar ve ekranlar boşuna yenilenmesin)
      if (JSON.stringify(data) !== JSON.stringify(daysRef.current)) {
        daysRef.current = data;
        setDays(data);
      }
      setLoading(false);
      await rescheduleNotifications(data, s);
    } catch (e) {
      if (id === loadId.current) {
        setError(e instanceof Error ? e.message : 'Vakitler alınamadı. İnternet bağlantını kontrol et.');
      }
    } finally {
      if (id === loadId.current) setLoading(false);
    }
  }, []);

  // İlk açılış: kayıtlı yerle hemen göster, sonra arka planda güncel konumu al.
  useEffect(() => {
    (async () => {
      const [p, s] = await Promise.all([loadPlace(), loadSettings()]);
      applyPlace(p);
      settingsRef.current = s;
      setSettings(s);
      await load(p, s);

      let fresh: Place | null = null;
      try {
        fresh = await getCurrentPlace();
      } catch {
        // konum alınamazsa kayıtlı yerle devam
      }
      if (!fresh) return;
      // Aynı bölgedeysek (önbellek anahtarıyla aynı hassasiyet) ve ilçe değişmediyse vakitler değişmez
      const sameArea =
        fresh.latitude.toFixed(2) === p.latitude.toFixed(2) && fresh.longitude.toFixed(2) === p.longitude.toFixed(2);
      // Ters geocode bu sefer başarısız olduysa bilinen ilçeyi kaybetme
      if (sameArea && !fresh.diyanetId && p.diyanetId) fresh = { ...fresh, diyanetId: p.diyanetId };
      // Aynı bölgede ad da aynıysa kayıtlı yeri koru (küçük GPS oynamaları her açılışta yeniden çizim yaptırmasın)
      if (sameArea && fresh.name === p.name && fresh.diyanetId === p.diyanetId) return;
      applyPlace(fresh);
      await savePlace(fresh);
      if (!sameArea || fresh.diyanetId !== p.diyanetId) await load(fresh, settingsRef.current);
    })();
  }, [load, applyPlace]);

  const refresh = useCallback(async () => {
    await load(placeRef.current, settingsRef.current, true);
  }, [load]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings> | ((prev: Settings) => Partial<Settings>)) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      settingsRef.current = next;
      setSettings(next);
      await saveSettings(next);
      if (changed(prev, next, DATA_KEYS)) await load(placeRef.current, next);
      else if (changed(prev, next, NOTIFICATION_KEYS) && daysRef.current.length > 0) {
        await rescheduleNotifications(daysRef.current, next);
      }
    },
    [load],
  );

  const locateMe = useCallback(async () => {
    const p = await getCurrentPlace();
    if (!p) return false;
    applyPlace(p);
    await savePlace(p);
    await load(p, settingsRef.current);
    return true;
  }, [load, applyPlace]);

  const value = useMemo(
    () => ({ place, settings, days, loading, error, refresh, updateSettings, locateMe }),
    [place, settings, days, loading, error, refresh, updateSettings, locateMe],
  );

  return <PrayerContext.Provider value={value}>{children}</PrayerContext.Provider>;
}

export function usePrayer(): PrayerContextValue {
  const ctx = useContext(PrayerContext);
  if (!ctx) throw new Error('usePrayer, PrayerProvider içinde kullanılmalı');
  return ctx;
}
