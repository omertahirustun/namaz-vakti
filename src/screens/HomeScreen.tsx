import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from '../components/AppText';
import SponsorBadge from '../components/SponsorBadge';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DailySection from '../components/DailySection';
import ImsakiyeModal from '../components/ImsakiyeModal';
import WidgetRefresh from '../../modules/widget-refresh';
import { openExactAlarmSettings } from '../notifications';
import { usePrayer } from '../PrayerContext';
import { useTheme } from '../ThemeContext';
import { photoTextShadow, radius, ThemeColors } from '../theme';
import {
  countdownStage,
  CountdownStage,
  dateKey,
  dayPartsTr,
  findCurrent,
  findNext,
  formatCountdown,
  longDateTr,
  pad,
  toDate,
} from '../time';
import { PRAYER_KEYS, PRAYER_NAMES_TR, PrayerKey } from '../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
const PRAYER_ICONS: Record<PrayerKey, IconName> = {
  Fajr: 'moon-waning-crescent',
  Sunrise: 'weather-sunset-up',
  Dhuhr: 'white-balance-sunny',
  Asr: 'weather-partly-cloudy',
  Maghrib: 'weather-sunset-down',
  Isha: 'weather-night',
};

const BOX_ICON = 20;

function formatHm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function HomeScreen() {
  const { place, days, loading, error, refresh, locateMe } = usePrayer();
  const { theme } = useTheme();
  const { colors, heroGradient, prayerColors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayKey = dateKey(now);
  const today = useMemo(() => days.find((d) => d.date === todayKey), [days, todayKey]);
  const [imsakiyeVisible, setImsakiyeVisible] = useState(false);
  const next = useMemo(() => findNext(days, now), [days, now]);
  const nextDate = next ? dateKey(next.at) : null;
  const current = useMemo(() => findCurrent(days, now), [days, now]);
  const currentDate = current ? dateKey(current.at) : null;
  const progress =
    current && next ? Math.min(1, (now.getTime() - current.at.getTime()) / (next.at.getTime() - current.at.getTime())) : 0;

  const [locating, setLocating] = useState(false);
  const onLocate = async () => {
    setLocating(true);
    try {
      const ok = await locateMe();
      if (!ok) Alert.alert('Konum izni gerekli', 'Ayarlardan konum iznini açarak tekrar dene.');
    } catch {
      Alert.alert('Konum alınamadı', 'Konum servislerinin açık olduğundan emin olup tekrar dene.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
      >
        <TouchableOpacity style={styles.placeRow} onPress={onLocate} disabled={locating} activeOpacity={0.7}>
          <Ionicons name="location-sharp" size={18} color={colors.accent} />
          <Text style={styles.place} numberOfLines={1}>
            {place.name}
          </Text>
          {locating ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={16} color={colors.muted} />
          )}
        </TouchableOpacity>
        <Text style={styles.date}>{longDateTr(now)}</Text>
        {today ? <Text style={styles.hijri}>{today.hijri} H</Text> : null}

        <LinearGradient colors={heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          {next ? (
            <>
              {current ? (
                <View style={styles.nowPill}>
                  <View style={styles.nowDot} />
                  <Text style={styles.nowText}>Şu an {PRAYER_NAMES_TR[current.key]} vakti</Text>
                </View>
              ) : null}
              <Text style={styles.heroLabel}>{PRAYER_NAMES_TR[next.key]} vaktine kalan</Text>
              <Countdown msLeft={next.at.getTime() - now.getTime()} styles={styles} />
              {current ? (
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  </View>
                  <View style={styles.progressLabels}>
                    <Text style={styles.progressText}>
                      {PRAYER_NAMES_TR[current.key]} {formatHm(current.at)}
                    </Text>
                    <Text style={styles.progressText}>
                      {PRAYER_NAMES_TR[next.key]} {formatHm(next.at)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <SponsorBadge />
            </>
          ) : loading ? (
            <ActivityIndicator color={colors.onHero} />
          ) : (
            <Text style={styles.heroLabel}>Vakit bilgisi yok</Text>
          )}
        </LinearGradient>

        <ExactAlarmHint styles={styles} colors={colors} />

        {error ? (
          <TouchableOpacity style={styles.error} onPress={refresh}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorHint}>Tekrar denemek için dokun</Text>
          </TouchableOpacity>
        ) : null}

        {today ? (
          <View style={[styles.dayCard, styles.dayCardToday]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayTitle, styles.accent]}>Bugün</Text>
              <Text style={styles.daySub}>
                {dayPartsTr(today.date).dayMonth} {dayPartsTr(today.date).weekday}
              </Text>
            </View>
            <View style={styles.boxes}>
              {PRAYER_KEYS.map((key) => {
                const isCurrent = current?.key === key && currentDate === today.date;
                const isNext = next?.key === key && nextDate === today.date;
                const passed = !isCurrent && toDate(today.date, today.times[key]).getTime() < now.getTime();
                const tint = isCurrent ? colors.onHero : passed ? colors.muted : colors.text;
                const content = (
                  <>
                    <Text style={[styles.boxName, { color: tint }]} numberOfLines={1}>
                      {PRAYER_NAMES_TR[key]}
                    </Text>
                    <MaterialCommunityIcons
                      name={PRAYER_ICONS[key]}
                      size={BOX_ICON}
                      color={isCurrent ? colors.onHero : passed ? colors.muted : prayerColors[key]}
                      style={styles.boxIcon}
                    />
                    <Text style={[styles.boxTime, { color: tint }]}>{today.times[key]}</Text>
                  </>
                );
                if (isCurrent) {
                  return (
                    <LinearGradient
                      key={key}
                      colors={heroGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.box, styles.boxCurrent]}
                    >
                      {content}
                    </LinearGradient>
                  );
                }
                return (
                  <View key={key} style={[styles.box, isNext && styles.boxNext, passed && styles.boxPassed]}>
                    {isNext ? (
                      // Vakit yaklaştıkça kart alttan dolar; dolunca vakit girer ve kart "ŞİMDİ" olur
                      <LinearGradient
                        colors={heroGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.boxFill, { height: `${progress * 100}%` }]}
                      />
                    ) : null}
                    {content}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.imsakiyeCard}
          onPress={() => setImsakiyeVisible(true)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="calendar-month" size={20} color={colors.accent} />
          <Text style={styles.imsakiyeText}>30 günlük imsakiye</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>

        <DailySection date={todayKey} />
      </ScrollView>

      <ImsakiyeModal
        visible={imsakiyeVisible}
        onClose={() => setImsakiyeVisible(false)}
        days={days}
        now={now}
        next={next}
      />
    </SafeAreaView>
  );
}

/**
 * "Alarmlar ve hatırlatıcılar" izni kapalıysa (Android 14+ yeni kurulumda kapalı gelir) bildirimler ve widget'ın
 * vakit/son 10–5 dakika geçişleri dakikalarca gecikebilir; izin açılana kadar kısa bir uyarı gösterilir.
 */
function ExactAlarmHint({ styles, colors }: { styles: ReturnType<typeof makeStyles>; colors: ThemeColors }) {
  const check = () => WidgetRefresh?.canScheduleExactAlarms() ?? true;
  const [allowed, setAllowed] = useState(check);

  useEffect(() => {
    // Kullanıcı ayardan dönünce yeniden bak
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setAllowed(check());
    });
    return () => sub.remove();
  }, []);

  if (allowed) return null;
  return (
    <TouchableOpacity style={styles.alarmHint} onPress={() => openExactAlarmSettings().catch(() => {})} activeOpacity={0.8}>
      <Ionicons name="alarm-outline" size={20} color={colors.highlight} />
      <View style={{ flex: 1 }}>
        <Text style={styles.alarmHintTitle}>Tam vaktinde uyarı için izin ver</Text>
        <Text style={styles.alarmHintText}>
          "Alarmlar ve hatırlatıcılar" kapalı; bildirimler ve widget sayacı gecikebilir. Açmak için dokun.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

/** Son 10 dakikada sayaç kırmızımsı olur ve saniye görünür; son 5 dakikada koyu kırmızı, iri ve hafifçe titrer. */
function Countdown({ msLeft, styles }: { msLeft: number; styles: ReturnType<typeof makeStyles> }) {
  const stage: CountdownStage = countdownStage(msLeft);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (stage !== 'urgent') return;
    const step = (toValue: number) => Animated.timing(shake, { toValue, duration: 45, useNativeDriver: true });
    // Kısa bir sarsıntı, ardından duraklama — sürekli titreme göz yorar
    const loop = Animated.loop(
      Animated.sequence([step(2.5), step(-2.5), step(2), step(-2), step(0), Animated.delay(800)]),
    );
    loop.start();
    return () => {
      loop.stop();
      shake.setValue(0);
    };
  }, [stage, shake]);

  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <Text
        style={[
          styles.countdown,
          stage === 'soon' && styles.countdownSoon,
          stage === 'urgent' && styles.countdownUrgent,
        ]}
      >
        {formatCountdown(msLeft)}
      </Text>
    </Animated.View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  place: { color: colors.text, fontSize: 20, fontWeight: '700', flexShrink: 1, ...photoTextShadow(colors) },
  date: { color: colors.text, marginTop: 6, fontSize: 14, ...photoTextShadow(colors) },
  hijri: { color: colors.accent, marginTop: 2, fontSize: 13, ...photoTextShadow(colors) },
  hero: {
    marginTop: 20,
    borderRadius: radius,
    paddingVertical: 20,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  nowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 12,
  },
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.onHero },
  nowText: { color: colors.onHero, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  progressWrap: { alignSelf: 'stretch', paddingHorizontal: 22, marginTop: 14 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.onHero },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressText: { color: colors.onHero, fontSize: 12, opacity: 0.85, fontVariant: ['tabular-nums'] },
  heroLabel: { color: colors.onHero, fontSize: 15, opacity: 0.9 },
  countdown: { color: colors.onHero, fontSize: 60, fontWeight: '600', marginTop: 6, fontVariant: ['tabular-nums'] },
  countdownSoon: { color: '#FF8A80' },
  countdownUrgent: {
    color: '#B3141E',
    fontSize: 66,
    fontWeight: '800',
  },
  dayCard: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  dayCardToday: { borderColor: colors.accent, borderWidth: 1.5 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, marginBottom: 8 },
  dayTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  daySub: { color: colors.muted, fontSize: 13 },
  accent: { color: colors.accent },
  boxes: { flexDirection: 'row', gap: 4 },
  box: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    // Tüm kutularda aynı kenarlık kalınlığı → hepsi aynı boyda kalır
    borderWidth: 2,
    borderColor: 'transparent',
  },
  boxNext: { borderColor: colors.accent, overflow: 'hidden' },
  boxCurrent: {
    elevation: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  boxPassed: { opacity: 0.55 },
  boxName: { fontSize: 11, fontWeight: '600' },
  boxIcon: { marginVertical: 6 },
  boxFill: { position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0.35 },
  boxTime: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  alarmHint: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.highlight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  alarmHintTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  alarmHintText: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  imsakiyeCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  imsakiyeText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  error: { marginTop: 16, backgroundColor: colors.dangerBg, borderRadius: 12, padding: 14 },
  errorText: { color: colors.danger },
  errorHint: { color: colors.muted, marginTop: 4, fontSize: 12 },
  });
}
