import type { WidgetData } from './PrayerWidget';
import type { Place } from '../types';

/** targets/widget/PrayerData.swift ile aynı ortak alan (App Group) ve anahtar */
const APP_GROUP = 'group.com.adezyonmedya.haydinamaza';
const STORAGE_KEY = 'widgetData';

/**
 * iOS widget'larının okuduğu veriyi ortak alana yazar ve widget'ları yeniler. Widget veri azalınca
 * (uygulama uzun süre açılmazsa) vakitleri kendisi çekebilsin diye konum ve hesaplama yöntemi de yazılır.
 * Expo Go'da ExtensionStorage'ın yerel modülü yok; kütüphane o zaman sessizce hiçbir şey yapmaz.
 */
export function syncIosWidgets(data: WidgetData, place: Place, method: number): void {
  const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
  const storage = new ExtensionStorage(APP_GROUP);
  storage.set(
    STORAGE_KEY,
    JSON.stringify({ ...data, latitude: place.latitude, longitude: place.longitude, method }),
  );
  ExtensionStorage.reloadWidget();
}
