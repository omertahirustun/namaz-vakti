import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking, Platform } from 'react-native';

// Her turda farklı ağlardaki iki sunucu aynı anda denenir, önce yanıt veren kullanılır.
// overpass-api.de makinelerine bazı ağlardan IPv4 ile hiç ulaşılamıyor (yalnız IPv6 çalışıyor);
// openstreetmap.fr ise IPv4'te açık. Tek kurumun sunucularına bağlı kalmamak için ikisi birlikte.
// Bağımsız aynalardan kumi.systems, private.coffee, mail.ru, osm.jp, openstreetmap.ru 2026-10'da
// kapalıydı; osm.ch yalnız İsviçre verisi tutuyor.
const OVERPASS_ROUNDS = [
  ['https://lz4.overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'],
  ['https://z.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter'],
];
// IPv6'sı bozuk ağlarda Android'in OkHttp'si IPv6'da ~10 sn bekleyip sonra IPv4'e geçiyor;
// süre bu geçişe yetecek kadar uzun olmalı.
const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_KEY = 'mosques:v1';
/** Önbellekteki liste, arandığı yere bu kadar yakınken gösterilir (metre). */
const CACHE_MAX_DRIFT_M = 1_000;
/** Önce yakın çevreye bak; hiç cami yoksa (kırsal bölge) aramayı genişlet. */
const SEARCH_RADII_M = [2_000, 10_000];
const MAX_RESULTS = 40;

export interface Mosque {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  /** Metre */
  distance: number;
  /** Kullanıcıdan camiye yön, gerçek kuzeye göre (0–360°) */
  bearing: number;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const rad = Math.PI / 180;

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dl = (lon2 - lon1) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

async function fetchOverpass(url: string, query: string, signal: AbortSignal): Promise<OverpassElement[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass kullanım kuralları uygulamanın kendini tanıtmasını istiyor
      'User-Agent': 'HaydiNamaza/1.0 (com.adezyonmedya.haydinamaza)',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = await res.json();
  return (json?.elements ?? []) as OverpassElement[];
}

/** Sunuculardan ilk başarılı yanıtı döndürür, kalan istekleri iptal eder; hepsi başarısızsa hata. */
function firstSuccess(urls: string[], query: string): Promise<OverpassElement[]> {
  const controllers = urls.map(() => new AbortController());
  const timer = setTimeout(() => controllers.forEach((c) => c.abort()), REQUEST_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    let failed = 0;
    urls.forEach((url, i) => {
      fetchOverpass(url, query, controllers[i].signal).then(
        (elements) => {
          clearTimeout(timer);
          controllers.forEach((c, j) => j !== i && c.abort());
          resolve(elements);
        },
        (e) => {
          if (++failed < urls.length) return;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error('Cami servisi yanıt vermedi'));
        },
      );
    });
  });
}

async function queryOverpass(query: string): Promise<OverpassElement[]> {
  let lastError: unknown;
  for (const urls of OVERPASS_ROUNDS) {
    try {
      return await firstSuccess(urls, query);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

interface CachedMosques {
  latitude: number;
  longitude: number;
  mosques: Pick<Mosque, 'id' | 'name' | 'latitude' | 'longitude'>[];
}

/** Uzaklık ve yönü verilen konuma göre (yeniden) hesaplar, yakından uzağa sıralar. */
function measureFrom(
  latitude: number,
  longitude: number,
  list: Pick<Mosque, 'id' | 'name' | 'latitude' | 'longitude'>[],
): Mosque[] {
  return list
    .map((m) => ({
      ...m,
      distance: distanceMeters(latitude, longitude, m.latitude, m.longitude),
      bearing: bearingDeg(latitude, longitude, m.latitude, m.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_RESULTS);
}

/**
 * Son aramanın sonucunu döndürür; kullanıcı o yerden fazla uzaklaştıysa null.
 * Overpass yoğunken bile liste anında açılsın diye kullanılır.
 */
export async function loadCachedMosques(latitude: number, longitude: number): Promise<Mosque[] | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedMosques;
    if (distanceMeters(latitude, longitude, cached.latitude, cached.longitude) > CACHE_MAX_DRIFT_M) return null;
    return measureFrom(latitude, longitude, cached.mosques);
  } catch {
    return null;
  }
}

/** Konuma en yakın camileri (OpenStreetMap) mesafeye göre sıralı döndürür ve önbelleğe yazar. */
export async function findNearbyMosques(latitude: number, longitude: number): Promise<Mosque[]> {
  for (const radius of SEARCH_RADII_M) {
    // Camiler OSM'de nokta (node) ya da bina çizgisi (way) olarak girilir; out center ikisine de koordinat verir.
    const query =
      `[out:json][timeout:15];` +
      `nwr["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${latitude},${longitude});` +
      `out center tags;`;
    const elements = await queryOverpass(query);

    const found: CachedMosques['mosques'] = [];
    for (const el of elements) {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat == null || lon == null) continue;
      found.push({
        id: `${el.type}/${el.id}`,
        name: el.tags?.['name:tr'] ?? el.tags?.name ?? null,
        latitude: lat,
        longitude: lon,
      });
    }
    if (found.length > 0) {
      const mosques = measureFrom(latitude, longitude, found);
      const cache: CachedMosques = { latitude, longitude, mosques };
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
      return mosques;
    }
  }
  return [];
}

export function formatDistance(m: number): string {
  if (m < 1_000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1_000).toFixed(m < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

const DIRECTIONS_TR = ['Kuzey', 'Kuzeydoğu', 'Doğu', 'Güneydoğu', 'Güney', 'Güneybatı', 'Batı', 'Kuzeybatı'];

export function directionName(bearing: number): string {
  return DIRECTIONS_TR[Math.round(bearing / 45) % 8];
}

/** Camiyi telefonun harita uygulamasında açar (Android: seçili harita uygulaması, iOS: Apple Haritalar). */
export async function openInMaps(m: Mosque): Promise<void> {
  const label = encodeURIComponent(m.name ?? 'Cami');
  const native =
    Platform.OS === 'ios'
      ? `maps:?q=${label}&ll=${m.latitude},${m.longitude}`
      : `geo:${m.latitude},${m.longitude}?q=${m.latitude},${m.longitude}(${label})`;
  try {
    await Linking.openURL(native);
  } catch {
    // Harita uygulaması yoksa tarayıcıda Google Haritalar
    await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`);
  }
}
