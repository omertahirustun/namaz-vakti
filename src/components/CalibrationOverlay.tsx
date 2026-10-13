import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Text from './AppText';
import { radius, ThemeColors } from '../theme';

/** Pusula doğruluğu: sensörün tahmini hatasından (ya da kalibrasyon düzeyinden) türetilir */
export type CompassQuality = 'unknown' | 'low' | 'medium' | 'good';

const QUALITY_LABEL: Record<CompassQuality, string> = {
  unknown: 'Ölçülüyor…',
  low: 'Düşük',
  medium: 'Orta',
  good: 'İyi',
};

const W = 220;
const H = 110;
const LOOP_MS = 2600;

// Yatık 8 (Gerono lemniskatı): x = sin t, y = sin t · cos t. Telefon simgesi bu noktalar arasında kayar.
const SAMPLES = 48;
const POINTS = Array.from({ length: SAMPLES + 1 }, (_, i) => {
  const t = (i / SAMPLES) * 2 * Math.PI;
  return { x: Math.sin(t) * (W / 2 - 18), y: Math.sin(t) * Math.cos(t) * (H - 24) };
});
const INPUT = POINTS.map((_, i) => i / SAMPLES);
const PATH = POINTS.map((p, i) => `${i ? 'L' : 'M'}${W / 2 + p.x} ${H / 2 + p.y}`).join(' ');

/**
 * Kıble pusulasından önce gösterilen kalibrasyon adımı: telefonu havada 8 çizerek çevirme animasyonu ve
 * canlı doğruluk. Doğruluk iyileşince ekran kendiliğinden kapanır (bkz. QiblaScreen).
 */
export default function CalibrationOverlay({
  colors,
  quality,
  accuracyDeg,
  onSkip,
}: {
  colors: ThemeColors;
  quality: CompassQuality;
  accuracyDeg: number | null;
  onSkip: () => void;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: LOOP_MS, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const translateX = progress.interpolate({ inputRange: INPUT, outputRange: POINTS.map((p) => p.x) });
  const translateY = progress.interpolate({ inputRange: INPUT, outputRange: POINTS.map((p) => p.y) });
  // Gerçekte telefon da yolu izlerken eğilip döner; simge hafifçe sallanır
  const rotate = progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['-25deg', '20deg', '-25deg', '20deg', '-25deg'] });

  const level = quality === 'good' ? 3 : quality === 'medium' ? 2 : quality === 'low' ? 1 : 0;
  const levelColor = quality === 'good' ? colors.green : quality === 'medium' ? '#D4A055' : colors.danger;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Pusulayı kalibre et</Text>
      <Text style={styles.body}>
        Telefonu havada birkaç kez 8 çizerek çevir. Mıknatıslı kılıf, hoparlör ve metal eşyalardan uzak dur.
      </Text>

      <View style={styles.stage}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Path d={PATH} stroke={colors.muted} strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" fill="none" opacity={0.6} />
        </Svg>
        <Animated.View style={[styles.phone, { transform: [{ translateX }, { translateY }, { rotate }] }]}>
          <MaterialCommunityIcons name="cellphone" size={40} color={colors.accent} />
        </Animated.View>
      </View>

      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>Doğruluk</Text>
        <View style={styles.bars}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.bar, { backgroundColor: i <= level ? levelColor : colors.border }]} />
          ))}
        </View>
        <Text style={[styles.meterValue, { color: level ? levelColor : colors.muted }]}>
          {QUALITY_LABEL[quality]}
          {accuracyDeg !== null ? ` · ±${Math.round(accuracyDeg)}°` : ''}
        </Text>
      </View>

      <TouchableOpacity onPress={onSkip} style={styles.skip} hitSlop={10}>
        <Text style={styles.skipText}>{quality === 'good' ? 'Tamam' : 'Atla'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      width: '100%',
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 20,
      borderRadius: radius,
      backgroundColor: colors.card,
    },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    body: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    stage: { width: W, height: H, marginVertical: 28, alignItems: 'center', justifyContent: 'center' },
    phone: { position: 'absolute' },
    meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    meterLabel: { color: colors.muted, fontSize: 14 },
    bars: { flexDirection: 'row', gap: 4 },
    bar: { width: 22, height: 8, borderRadius: 4 },
    meterValue: { fontSize: 14, fontWeight: '700' },
    skip: { marginTop: 20, paddingHorizontal: 28, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    skipText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  });
}
