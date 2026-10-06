import { requireOptionalNativeModule } from 'expo';

interface WidgetRefreshNative {
  scheduleRefresh(widgetName: string, atMillis: number): boolean;
  canScheduleExactAlarms(): boolean;
}

// Expo Go'da ve iOS'ta yok; çağıranlar null'u sessizce geçer.
export default requireOptionalNativeModule<WidgetRefreshNative>('WidgetRefresh');
