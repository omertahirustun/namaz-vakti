import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from './AppText';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { radius, ThemeColors } from '../theme';
import { dateKey, dayPartsTr, NextPrayer } from '../time';
import { PRAYER_KEYS, PRAYER_NAMES_TR, DayTimes, PrayerKey } from '../types';

const DAY_COUNT = 30;

/** Oruç tutanlar için öne çıkarılan sütunlar: sahur bitişi ve iftar */
const FAST_KEYS: PrayerKey[] = ['Fajr', 'Maghrib'];

interface ImsakiyeModalProps {
  visible: boolean;
  onClose: () => void;
  days: DayTimes[];
  now: Date;
  next: NextPrayer | null;
}

/**
 * Aylık imsakiye tablosunu alttan açılan bir sheet içinde gösterir.
 * Veri/mantık HomeScreen'den taşındı; burada sadece sunum var.
 */
export default function ImsakiyeModal({ visible, onClose, days, now, next }: ImsakiyeModalProps) {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const todayKey = dateKey(now);
  const nextDate = next ? dateKey(next.at) : null;

  // Bugünden itibaren 30 gün (veri bu ay + gelecek ay, yani her zaman yeterli)
  const rows = useMemo(
    () =>
      days
        .filter((d) => d.date >= todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, DAY_COUNT),
    [days, todayKey],
  );

  const scrollRef = useRef<ScrollView>(null);
  const todayYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      if (todayYRef.current != null) {
        scrollRef.current?.scrollTo({ y: Math.max(todayYRef.current - 40, 0), animated: true });
      }
    }, 80);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>30 Günlük İmsakiye</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.legend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>İmsak (sahur bitişi) ve Akşam (iftar) vurgulu</Text>
          </View>
          <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <View style={styles.table}>
              <View style={[styles.tr, styles.thead]}>
                <Text style={[styles.dayCell, styles.th]}>Tarih</Text>
                {PRAYER_KEYS.map((k) => {
                  const fast = FAST_KEYS.includes(k);
                  return (
                    <View key={k} style={[styles.cellBox, fast && styles.fastHead]}>
                      <Text style={[styles.th, fast && styles.fastTh]} numberOfLines={1}>
                        {PRAYER_NAMES_TR[k]}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {rows.map((d, i) => {
                const { day, weekdayShort, dayMonth } = dayPartsTr(d.date);
                const monthShort = dayMonth.split(' ')[1].slice(0, 3);
                const isToday = d.date === todayKey;
                return (
                  <View
                    key={d.date}
                    onLayout={(e) => {
                      if (isToday) todayYRef.current = e.nativeEvent.layout.y;
                    }}
                    style={[
                      styles.tr,
                      i % 2 === 1 && styles.trAlt,
                      isToday && styles.trToday,
                      i === rows.length - 1 && styles.trLast,
                    ]}
                  >
                    <View style={styles.dayCell}>
                      <Text style={[styles.dayText, isToday && styles.todayText]}>
                        {day} {monthShort}
                      </Text>
                      <Text style={[styles.weekdayText, isToday && styles.todayText]}>
                        {isToday ? 'Bugün' : weekdayShort}
                      </Text>
                    </View>
                    {PRAYER_KEYS.map((k) => {
                      const fast = FAST_KEYS.includes(k);
                      const isNext = next?.key === k && nextDate === d.date;
                      return (
                        <View key={k} style={[styles.cellBox, fast && styles.fastCol]}>
                          <Text
                            style={[
                              styles.cell,
                              fast && styles.fastCell,
                              isToday && styles.todayText,
                              isNext && styles.cellNext,
                            ]}
                          >
                            {d.times[k]}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    maxHeight: '80%',
    paddingBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 3, backgroundColor: colors.accent, opacity: 0.6 },
  legendText: { color: colors.muted, fontSize: 11 },
  scroll: { paddingHorizontal: 12 },
  scrollContent: { paddingTop: 10, paddingBottom: 16 },
  // Hafif çizgili tablo: dış çerçeve + satır ve sütun ayırıcıları
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trAlt: { backgroundColor: 'rgba(127,127,127,0.07)' },
  trLast: { borderBottomWidth: 0 },
  trToday: { backgroundColor: colors.cardAlt, borderTopWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.accent },
  thead: { backgroundColor: colors.cardAlt, borderBottomWidth: 1, borderBottomColor: colors.accent },
  th: { color: colors.muted, fontWeight: '700', fontSize: 10.5, textAlign: 'center' },
  dayCell: { width: 54, paddingVertical: 6, paddingHorizontal: 6, justifyContent: 'center' },
  dayText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  weekdayText: { color: colors.muted, fontSize: 10 },
  todayText: { color: colors.accent, fontWeight: '800' },
  cellBox: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  cell: { color: colors.text, fontSize: 12, textAlign: 'center', fontVariant: ['tabular-nums'] },
  // İmsak ve Akşam sütunları: renkli zemin + kalın, büyük yazı
  fastHead: { backgroundColor: colors.accent },
  fastTh: { color: colors.onAccent, fontWeight: '800' },
  fastCol: { backgroundColor: 'rgba(127,127,127,0.12)' },
  fastCell: { fontSize: 14, fontWeight: '800', color: colors.accent },
  cellNext: { textDecorationLine: 'underline' },
  });
}
