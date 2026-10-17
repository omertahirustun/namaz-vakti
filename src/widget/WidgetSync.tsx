import { useEffect, useRef, useState } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { syncOngoingNotification } from '../ongoing';
import { usePrayer } from '../PrayerContext';
import { useTheme } from '../ThemeContext';

// Widget kütüphaneleri native modülü içe aktarılırken ister; Expo Go'da yok, orada hiç yüklenmesin.
const enabled =
  (Platform.OS === 'android' || Platform.OS === 'ios') &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/**
 * Tema, konum ya da vakitler değişince ve uygulama her öne geldiğinde ana ekrandaki widget'ları yeniden çizer
 * (alarm gecikmiş olsa bile widget uygulama açılınca hemen doğru aşamaya gelir).
 */
export default function WidgetSync() {
  const { themeId } = useTheme();
  const { place, settings, days } = usePrayer();
  const [foregrounds, setForegrounds] = useState(0);
  /** Son çizilen verinin özeti ve öne gelme sayısı; aynı veriyle widget'lar yeniden çizilmez */
  const lastSync = useRef<{ key: string; foregrounds: number; days: unknown } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  // Kalıcı "vakte kalan" bildirimi de aynı veriyle güncellenir (yalnız Android; modül yoksa sessizce geçer)
  useEffect(() => {
    if (days.length === 0) return;
    syncOngoingNotification(days, place.name, settings.ongoingNotification);
  }, [place.name, settings.ongoingNotification, days, foregrounds]);

  useEffect(() => {
    if (!enabled || days.length === 0) return;
    // Aynı veri (öne gelme hariç) zaten çizildiyse tekrar etme; öne gelişte sayaç aşaması için yine çizilir
    const key = [themeId, settings.widgetStyle, place.name, place.latitude, place.longitude, place.diyanetId, settings.method].join('|');
    const last = lastSync.current;
    if (last && last.key === key && last.foregrounds === foregrounds && last.days === days) return;
    const data = { themeId, widgetStyle: settings.widgetStyle, placeName: place.name, days };
    // Widget çizimi JS'te yapılır ve ağırdır; açılış, sekme geçişi ve dokunuş animasyonları bitince başlasın
    const task = InteractionManager.runAfterInteractions(() => {
      // Çizim başlarken işaretlenir; bekleyen iş iptal edildiyse sonraki etki aynı veriyle yine çizer
      lastSync.current = { key, foregrounds, days };
      if (Platform.OS === 'ios') {
        // iOS widget'ı (targets/widget) kendi zaman çizelgesini kurar; burada yalnız veri yazılıp yenilenir
        const { syncIosWidgets } = require('./iosWidget') as typeof import('./iosWidget');
        syncIosWidgets(data, place, settings.method);
        return;
      }
      const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
      const { renderPrayerWidget, WIDGET_NAMES } = require('./PrayerWidget') as typeof import('./PrayerWidget');
      const { scheduleWidgetRefresh } = require('./schedule') as typeof import('./schedule');
      for (const name of WIDGET_NAMES) {
        requestWidgetUpdate({
          widgetName: name,
          renderWidget: (info) => renderPrayerWidget(name, { data, width: info.width, height: info.height }),
        })
          .then(() => scheduleWidgetRefresh(name, days))
          .catch(() => {});
      }
    });
    return () => task.cancel();
  }, [themeId, settings.widgetStyle, place, settings.method, days, foregrounds]);

  return null;
}
