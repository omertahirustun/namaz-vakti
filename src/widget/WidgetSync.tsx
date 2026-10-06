import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { usePrayer } from '../PrayerContext';
import { useTheme } from '../ThemeContext';

// Widget kütüphanesi native modülü içe aktarılırken ister; Expo Go'da yok, orada hiç yüklenmesin.
const enabled = Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

/**
 * Tema, konum ya da vakitler değişince ve uygulama her öne geldiğinde ana ekrandaki widget'ları yeniden çizer
 * (alarm gecikmiş olsa bile widget uygulama açılınca hemen doğru aşamaya gelir).
 */
export default function WidgetSync() {
  const { themeId } = useTheme();
  const { place, days } = usePrayer();
  const [foregrounds, setForegrounds] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegrounds((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled || days.length === 0) return;
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
    const { renderPrayerWidget, WIDGET_NAMES } = require('./PrayerWidget') as typeof import('./PrayerWidget');
    const { scheduleWidgetRefresh } = require('./schedule') as typeof import('./schedule');
    const data = { themeId, placeName: place.name, days };
    for (const name of WIDGET_NAMES) {
      requestWidgetUpdate({
        widgetName: name,
        renderWidget: (info) => renderPrayerWidget(name, { data, width: info.width, height: info.height }),
      })
        .then(() => scheduleWidgetRefresh(name, days))
        .catch(() => {});
    }
  }, [themeId, place.name, days, foregrounds]);

  return null;
}
