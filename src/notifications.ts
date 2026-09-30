import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DayTimes, PRAYER_KEYS, PRAYER_NAMES_TR, Settings } from './types';
import { dateKey, toDate } from './time';

const CHANNEL_ID = 'prayer-times';
// iOS en fazla 64 yerel bildirim planlamaya izin verir (~12 gün). Android'de
// sınır uygulama başına 500 alarm; 30 günü rahat karşılar.
const MAX_SCHEDULED = Platform.OS === 'ios' ? 60 : 200;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Namaz vakitleri',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

// Planlamalar sırayla çalışır; aynı anda iki planlama birbirinin
// silme/kurma adımlarına karışıp bildirimleri çoğaltmasın.
let queue: Promise<unknown> = Promise.resolve();

/** Tüm eski planları siler, önümüzdeki günler için yenilerini kurar. */
export function rescheduleNotifications(days: DayTimes[], settings: Settings): Promise<number> {
  const run = queue.then(() => reschedule(days, settings));
  queue = run.catch(() => {});
  return run;
}

async function reschedule(days: DayTimes[], settings: Settings): Promise<number> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.notificationsEnabled) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  const now = new Date();
  const today = dateKey(now);
  const upcoming = days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  let count = 0;
  for (const day of upcoming) {
    for (const key of PRAYER_KEYS) {
      if (!settings.enabled[key]) continue;
      const fireAt = new Date(toDate(day.date, day.times[key]).getTime() - settings.offsetMinutes * 60_000);
      if (fireAt.getTime() <= now.getTime()) continue;
      if (count >= MAX_SCHEDULED) return count;

      const name = PRAYER_NAMES_TR[key];
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${name} Vakti`,
          body:
            settings.offsetMinutes > 0
              ? `${name} vaktine ${settings.offsetMinutes} dakika kaldı (${day.times[key]})`
              : `${name} vakti girdi (${day.times[key]})`,
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
          channelId: CHANNEL_ID,
        },
      });
      count += 1;
    }
  }
  return count;
}

/** Android 12+ (API 31): "Alarmlar ve hatırlatıcılar" izni; yoksa bildirimler gecikebilir. */
export const needsExactAlarmSetting = Platform.OS === 'android' && Number(Platform.Version) >= 31;

export async function openExactAlarmSettings(): Promise<void> {
  await IntentLauncher.startActivityAsync('android.settings.REQUEST_SCHEDULE_EXACT_ALARM', {
    data: `package:${Application.applicationId}`,
  });
}

/** Pil optimizasyonu listesi; bazı üreticiler (Xiaomi, Huawei…) alarmları burada durdurur. */
export async function openBatterySettings(): Promise<void> {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
}
