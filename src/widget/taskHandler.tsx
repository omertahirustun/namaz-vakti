import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadWidgetData, renderPrayerWidget } from './PrayerWidget';
import { scheduleWidgetRefresh } from './schedule';

/** Uygulama kapalıyken Android widget'ı eklediğinde/yenilediğinde çalışır (her iki widget türü için). */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED') return;
  const data = await loadWidgetData();
  renderWidget(
    renderPrayerWidget(widgetInfo.widgetName, { data, width: widgetInfo.width, height: widgetInfo.height }),
  );
  if (data) scheduleWidgetRefresh(widgetInfo.widgetName, data.days);
}
