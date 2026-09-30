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

export function PrayerProvider({ children }: { children: React.ReactNode }) {
  const [place, setPlace] = useState<Place>(DEFAULT_PLACE);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DayTimes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef(settings);
  const loadId = useRef(0);

  const load = useCallback(async (p: Place, s: Settings) => {
    const id = ++loadId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getTwoMonths(p, s.method, new Date());
      // Bu arada daha yeni bir yükleme başladıysa eski sonucu uygulama
      if (id !== loadId.current) return;
      setDays(data);
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
      setPlace(p);
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
      setPlace(fresh);
      await savePlace(fresh);
      // Aynı bölgedeysek (önbellek anahtarıyla aynı hassasiyet) vakitler değişmez
      const moved =
        fresh.latitude.toFixed(2) !== p.latitude.toFixed(2) || fresh.longitude.toFixed(2) !== p.longitude.toFixed(2);
      if (moved) await load(fresh, settingsRef.current);
    })();
  }, [load]);

  const refresh = useCallback(async () => {
    await load(place, settingsRef.current);
  }, [load, place]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings> | ((prev: Settings) => Partial<Settings>)) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
      settingsRef.current = next;
      setSettings(next);
      await saveSettings(next);
      await load(place, next);
    },
    [load, place],
  );

  const locateMe = useCallback(async () => {
    const p = await getCurrentPlace();
    if (!p) return false;
    setPlace(p);
    await savePlace(p);
    await load(p, settingsRef.current);
    return true;
  }, [load]);

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
