import WidgetRefresh from '../../modules/widget-refresh';
import { findNext } from '../time';
import { DayTimes } from '../types';
import { nextWidgetRefreshAt } from './countdown';

/**
 * Widget'ı vakit girdiğinde (ve geri sayım biçimi değiştiğinde) yeniletmek için tek seferlik alarm kurar
 * (yalnız Android derlemesinde). Her widget türünün kendi alarmı vardır.
 */
export function scheduleWidgetRefresh(widgetName: string, days: DayTimes[]): void {
  if (!WidgetRefresh) return;
  const now = new Date();
  const next = findNext(days, now);
  // Veri biterse (ör. gelecek ay alınamadı) yarım saatlik periyodik güncelleme devam eder
  if (!next) return;
  try {
    WidgetRefresh.scheduleRefresh(widgetName, nextWidgetRefreshAt(next.at, now));
  } catch {
    // alarm kurulamazsa periyodik güncellemeye kalır
  }
}
