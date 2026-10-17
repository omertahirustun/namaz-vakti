import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DayTimes, NotificationSound, PRAYER_KEYS, PRAYER_NAMES_TR, Settings } from './types';
import { dateKey, toDate } from './time';

// Android kanal ayarları (ses, rozet vb.) oluşturulduktan sonra değiştirilemez; bu yüzden her değişiklikte yeni kimlik.
// v3: kendi zil sesimiz (assets/sounds/vakit.wav, burada sentezlendi; app.json'da expo-notifications "sounds").
// v4: ses türü (audioAttributes) açıkça bildirim; v3'te boş kalıyordu ve bazı telefonlarda bildirim sessiz geliyordu.
// Ses seçilebilir olunca her ses kendi kanalında (zil eski v4 kanalında kaldı, kullanıcının kanal ayarları korunsun).
// file: app.json'da expo-notifications "sounds" içindeki dosya; null = telefonun varsayılan bildirim sesi.
const SOUNDS: Record<NotificationSound, { channelId: string; name: string; file: string | null }> = {
  zil: { channelId: 'prayer-times-v4', name: 'Namaz vakitleri (zil)', file: 'vakit.wav' },
  ezan: { channelId: 'prayer-ezan-v1', name: 'Namaz vakitleri (ezan)', file: 'ezan.wav' },
  system: { channelId: 'prayer-system-v1', name: 'Namaz vakitleri (telefonun sesi)', file: null },
};
const OLD_CHANNEL_IDS = ['prayer-times', 'prayer-times-v2', 'prayer-times-v3'];
/** Bildirim, vakit girdikten bu kadar sonra çekmeceden kendiliğinden kalkar (yerel yama: data.dismissAt). */
const DISMISS_AFTER_MS = 60 * 60_000;
// iOS en fazla 64 yerel bildirim planlamaya izin verir (~12 gün). Android'de
// sınır uygulama başına 500 alarm; 30 günü rahat karşılar.
const MAX_SCHEDULED = Platform.OS === 'ios' ? 60 : 200;
/** expo-notifications'ın kendi kurmadığı bildirimlere verdiği kimlik (ExpoPresentationDelegate) */
const FOREIGN_NOTIFICATION_PREFIX = 'expo-notifications://foreign_notifications';

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
    for (const s of Object.values(SOUNDS)) await createChannel(s);
    for (const id of OLD_CHANNEL_IDS) await Notifications.deleteNotificationChannelAsync(id).catch(() => {});
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

async function createChannel(s: (typeof SOUNDS)[NotificationSound]): Promise<void> {
  await Notifications.setNotificationChannelAsync(s.channelId, {
    name: s.name,
    importance: Notifications.AndroidImportance.HIGH,
    // sound verilmezse kanal telefonun varsayılan bildirim sesini çalar
    ...(s.file ? { sound: s.file } : {}),
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    enableVibrate: true,
    vibrationPattern: [0, 250, 200, 250],
    // Uygulama simgesinde "1, 2…" sayacı/noktası çıkmasın
    showBadge: false,
  });
}

/** Seçilen sesin bildirim içeriği ve kanal ayarı (iOS'ta dosya adı ya da 'default') */
function soundFor(sound: NotificationSound) {
  const s = SOUNDS[sound] ?? SOUNDS.zil;
  return { sound: s.file ?? 'default', channelId: s.channelId };
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

interface Planned {
  /** Tetiklenme anı (ms) */
  at: number;
  title: string;
  body: string;
  sound: string;
  channelId: string;
  dismissAt: number;
}

const PLAN_KEY = 'notificationPlan:v1';
/** Native köprüye aynı anda gönderilen planlama sayısı (tek tek await etmek 200 bildirimde saniyeler sürüyordu) */
const SCHEDULE_CHUNK = 25;

function buildPlan(days: DayTimes[], settings: Settings, now: Date): Planned[] {
  const today = dateKey(now);
  const { sound, channelId } = soundFor(settings.sound);
  const upcoming = days.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const plan: Planned[] = [];
  for (const day of upcoming) {
    for (const key of PRAYER_KEYS) {
      if (!settings.enabled[key]) continue;
      const prayerAt = toDate(day.date, day.times[key]).getTime();
      const at = prayerAt - settings.offsetMinutes * 60_000;
      if (at <= now.getTime()) continue;
      if (plan.length >= MAX_SCHEDULED) return plan;
      const name = PRAYER_NAMES_TR[key];
      plan.push({
        at,
        title: `${name} Vakti`,
        body:
          settings.offsetMinutes > 0
            ? `${name} vaktine ${settings.offsetMinutes} dakika kaldı (${day.times[key]})`
            : `${name} vakti girdi (${day.times[key]})`,
        sound,
        channelId,
        dismissAt: prayerAt + DISMISS_AFTER_MS,
      });
    }
  }
  return plan;
}

/**
 * Önceki planla aynı mı? Açılışta, konum ve ayar değişmeden her seferinde 200 bildirimi silip yeniden kurmamak için.
 * Tetiklenmiş olanlar düşüldükten sonra kayıtlı plan yeniyle ve sistemde bekleyen bildirim sayısıyla tutmalı.
 */
async function samePlanScheduled(plan: Planned[], now: number): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PLAN_KEY);
    if (!raw) return false;
    const stored = (JSON.parse(raw) as Planned[]).filter((p) => p.at > now);
    if (JSON.stringify(stored) !== JSON.stringify(plan)) return false;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.length === plan.length;
  } catch {
    return false;
  }
}

async function reschedule(days: DayTimes[], settings: Settings): Promise<number> {
  await dismissStaleNotifications();
  const now = new Date();
  const plan = settings.notificationsEnabled ? buildPlan(days, settings, now) : [];
  if (await samePlanScheduled(plan, now.getTime())) return plan.length;

  await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(PLAN_KEY).catch(() => {});
  if (plan.length === 0) return 0;
  if (!(await ensureNotificationPermission())) return 0;

  for (let i = 0; i < plan.length; i += SCHEDULE_CHUNK) {
    await Promise.all(
      plan.slice(i, i + SCHEDULE_CHUNK).map((p) =>
        Notifications.scheduleNotificationAsync({
          content: { title: p.title, body: p.body, sound: p.sound, data: { dismissAt: p.dismissAt } },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: p.channelId },
        }),
      ),
    );
  }
  await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(plan)).catch(() => {});
  return plan.length;
}

/**
 * Süresi geçmiş (ya da yamadan önce kurulmuş, dismissAt'i olmayan) vakit bildirimlerini çekmeceden kaldırır,
 * uygulama simgesindeki sayacı sıfırlar.
 */
async function dismissStaleNotifications(): Promise<void> {
  try {
    const now = Date.now();
    const shown = await Notifications.getPresentedNotificationsAsync();
    for (const n of shown) {
      // expo-notifications dışında kurulanlar (kalıcı "vakte kalan" bildirimi, modules/ongoing-notification) bu
      // kimlikle gelir; onlar dismissAt taşımaz ve silinmemeli
      if (n.request.identifier.startsWith(FOREIGN_NOTIFICATION_PREFIX)) continue;
      const dismissAt = Number(n.request.content.data?.dismissAt ?? 0);
      if (dismissAt <= now) await Notifications.dismissNotificationAsync(n.request.identifier);
    }
    // Yalnız iOS: expo-notifications Android'de sayacı 0'lamak için uygulamanın TÜM bildirimlerini siliyor
    // (BadgeHelper → cancelAll); vakti girmiş bildirimler ve kalıcı bildirim de gidiyordu. Android'de kanalda
    // rozet zaten kapalı (showBadge: false).
    if (Platform.OS === 'ios') await Notifications.setBadgeCountAsync(0);
  } catch {
    // sayaç/çekmece temizliği başarısız olsa da planlama sürsün
  }
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
