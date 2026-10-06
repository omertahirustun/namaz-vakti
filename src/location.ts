import * as Location from 'expo-location';
import { Place } from './types';

const FIX_TIMEOUT_MS = 10_000;

/**
 * Taze konum ister; kapalı alanda / zayıf GPS'te gelmezse ya da hata verirse
 * cihazın bildiği son konuma düşer. Vakit hesabı için birkaç km sapma önemsiz.
 */
async function getPosition(): Promise<Location.LocationObject> {
  try {
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);
    if (fresh) return fresh;
  } catch {
    // son bilinen konuma düş
  }
  const last = await Location.getLastKnownPositionAsync();
  if (!last) throw new Error('Konum bulunamadı');
  return last;
}

/** Konum iznini ister, konumu ve şehir adını döndürür. İzin yoksa null. */
export async function getCurrentPlace(): Promise<Place | null> {
  const coords = await getCurrentCoords();
  if (!coords) return null;
  const { latitude, longitude } = coords;

  let name = 'Konumum';
  try {
    const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
    // Türkiye'de city boş gelir: ilçe subregion'da, il region'da ("Altındağ, Ankara").
    const town = addr?.city ?? addr?.subregion;
    const province = addr?.region;
    if (town && province && town !== province) name = `${town}, ${province}`;
    else if (town ?? province) name = (town ?? province)!;
  } catch {
    // ters geocode başarısızsa varsayılan ad kalır
  }
  return { latitude, longitude, name };
}

/** Konum iznini ister ve koordinatları döndürür. İzin yoksa null. */
export async function getCurrentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const { latitude, longitude } = (await getPosition()).coords;
  return { latitude, longitude };
}

const KAABA = { lat: 21.4225, lon: 39.8262 };

/** Verilen noktadan Kâbe'ye gerçek kuzeye göre yön (0–360°). */
export function qiblaBearing(latitude: number, longitude: number): number {
  const rad = Math.PI / 180;
  const p1 = latitude * rad;
  const p2 = KAABA.lat * rad;
  const dl = (KAABA.lon - longitude) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/** Verilen noktadan Kâbe'ye büyük daire uzaklığı (km). */
export function kaabaDistanceKm(latitude: number, longitude: number): number {
  const rad = Math.PI / 180;
  const dp = (KAABA.lat - latitude) * rad;
  const dl = (KAABA.lon - longitude) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(latitude * rad) * Math.cos(KAABA.lat * rad) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}
