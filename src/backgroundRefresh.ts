import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { getTwoMonths } from './api';
import { rescheduleNotifications } from './notifications';
import { loadPlace, loadSettings, loadThemeId } from './storage';

const TASK = 'refresh-prayer-plan';

/**
 * iOS en fazla 64 yerel bildirim planlatır (~12 gün); uygulama uzun süre açılmasa da bildirimler kesilmesin ve
 * widget'ın verisi tazelensin diye iOS arada bir (sistem uygun gördükçe, en sık 15 dk'da bir) bu görevi çalıştırır.
 * Android'de 200 bildirim (30 gün) planlandığı ve widget'lar kendini yenilediği için gerekmez.
 */
const enabled = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

if (enabled) {
  TaskManager.defineTask(TASK, async () => {
    try {
      const [place, settings, themeId] = await Promise.all([loadPlace(), loadSettings(), loadThemeId()]);
      const days = await getTwoMonths(place, settings.method, new Date());
      await rescheduleNotifications(days, settings);
      const { syncIosWidgets } = require('./widget/iosWidget') as typeof import('./widget/iosWidget');
      syncIosWidgets({ themeId, placeName: place.name, days }, place, settings.method);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Uygulama açılışında bir kez çağrılır; görev zaten kayıtlıysa dokunmaz. */
export async function registerBackgroundRefresh(): Promise<void> {
  if (!enabled) return;
  try {
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 6 * 60 });
  } catch {
    // arka plan yenilemesi kapalıysa (Ayarlar > Genel > Arka Planda Yenile) uygulama açılışları yeter
  }
}
