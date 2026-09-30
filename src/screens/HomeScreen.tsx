import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DailySection from '../components/DailySection';
import { usePrayer } from '../PrayerContext';
import { colors, heroGradient, prayerColors, radius } from '../theme';
import { dateKey, dayPartsTr, findCurrent, findNext, formatCountdown, longDateTr, pad, toDate } from '../time';
import { PRAYER_KEYS, PRAYER_NAMES_TR, PrayerKey } from '../types';

const WEEK_DAYS = 7;

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
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayKey = dateKey(now);
  const week = useMemo(
    () => days.filter((d) => d.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date)).slice(0, WEEK_DAYS),
    [days, todayKey],
  );
  const today = week[0]?.date === todayKey ? week[0] : undefined;
  const upcoming = week.filter((d) => d.date !== todayKey);
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
          <Text style={styles.place}>{place.name}</Text>
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
              <Text style={styles.countdown}>{formatCountdown(next.at.getTime() - now.getTime())}</Text>
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
            </>
          ) : loading ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.heroLabel}>Vakit bilgisi yok</Text>
          )}
        </LinearGradient>

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
                const tint = isCurrent ? colors.onAccent : passed ? colors.muted : colors.text;
                const content = (
                  <>
                    <Text style={[styles.boxName, { color: tint }]} numberOfLines={1}>
                      {PRAYER_NAMES_TR[key]}
                    </Text>
                    <MaterialCommunityIcons
                      name={PRAYER_ICONS[key]}
                      size={BOX_ICON}
                      color={isCurrent ? colors.onAccent : passed ? colors.muted : prayerColors[key]}
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
                      <Text style={styles.nowTag}>ŞİMDİ</Text>
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

        {upcoming.length > 0 ? (
          <View style={styles.dayCard}>
            <View style={[styles.tr, styles.thead]}>
              <Text style={[styles.dayCell, styles.th]}>Gün</Text>
              {PRAYER_KEYS.map((k) => (
                <Text key={k} style={[styles.cell, styles.th]} numberOfLines={1}>
                  {PRAYER_NAMES_TR[k]}
                </Text>
              ))}
            </View>
            {upcoming.map((d, i) => {
              const { day, weekdayShort } = dayPartsTr(d.date);
              return (
                <View key={d.date} style={[styles.tr, i === upcoming.length - 1 && styles.trLast]}>
                  <Text style={styles.dayCell}>
                    {day} {weekdayShort}
                  </Text>
                  {PRAYER_KEYS.map((k) => {
                    const isNext = next?.key === k && nextDate === d.date;
                    return (
                      <Text key={k} style={[styles.cell, isNext && styles.cellNext]}>
                        {d.times[k]}
                      </Text>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ) : null}

        <DailySection date={todayKey} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  place: { color: colors.text, fontSize: 20, fontWeight: '700' },
  date: { color: colors.muted, marginTop: 6, fontSize: 14 },
  hijri: { color: colors.accent, marginTop: 2, fontSize: 13 },
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
  nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.onAccent },
  nowText: { color: colors.onAccent, fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  progressWrap: { alignSelf: 'stretch', paddingHorizontal: 22, marginTop: 14 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.onAccent },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  progressText: { color: colors.onAccent, fontSize: 12, opacity: 0.85, fontVariant: ['tabular-nums'] },
  heroLabel: { color: colors.onAccent, fontSize: 15, opacity: 0.9 },
  countdown: { color: colors.onAccent, fontSize: 48, fontWeight: '300', marginTop: 6, fontVariant: ['tabular-nums'] },
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
    borderWidth: 1,
    borderColor: 'transparent',
  },
  boxNext: { borderColor: colors.accent, borderWidth: 2, overflow: 'hidden' },
  boxCurrent: {
    borderWidth: 0,
    elevation: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    transform: [{ scale: 1.06 }],
  },
  nowTag: { color: colors.onAccent, fontSize: 8, fontWeight: '800', letterSpacing: 1, marginTop: 4, opacity: 0.9 },
  boxPassed: { opacity: 0.55 },
  boxName: { fontSize: 11, fontWeight: '600' },
  boxIcon: { marginVertical: 6 },
  boxFill: { position: 'absolute', left: 0, right: 0, bottom: 0, opacity: 0.35 },
  boxTime: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trLast: { borderBottomWidth: 0 },
  thead: { borderBottomWidth: 1, borderBottomColor: colors.accent, paddingTop: 0 },
  th: { color: colors.accent, fontWeight: '700', fontSize: 11 },
  dayCell: { width: 50, color: colors.text, fontSize: 12 },
  cell: { flex: 1, color: colors.text, fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  cellNext: { color: colors.accent, fontWeight: '700' },
  error: { marginTop: 16, backgroundColor: colors.dangerBg, borderRadius: 12, padding: 14 },
  errorText: { color: colors.danger },
  errorHint: { color: colors.muted, marginTop: 4, fontSize: 12 },
});
