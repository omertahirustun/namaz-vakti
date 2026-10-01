import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePrayer } from '../PrayerContext';
import { qiblaBearing } from '../location';
import { useTheme } from '../ThemeContext';
import { ThemeColors } from '../theme';

const SIZE = 280;

/** Açısal yumuşatma (EMA) katsayısı — düşük değer daha yumuşak ama daha yavaş tepki verir. */
const HEADING_ALPHA = 0.2;
/** Bu kadar küçük değişimler titreşim sayılıp yok sayılır (derece). */
const DEAD_BAND_DEG = 1;
/** Pusula iğnesinin her güncellemede yumuşakça dönmesi için animasyon süresi. */
const ROTATE_DURATION_MS = 150;
/** Durum metninin (derece/aligned) ekranda güncellenme sıklığı — gereksiz render'ı önler. */
const DISPLAY_THROTTLE_MS = 200;

/** a açısından b açısına en kısa yönde imzalı fark, [-180, 180) aralığında. */
function angleDiffSigned(a: number, b: number) {
  return ((b - a + 540) % 360) - 180;
}

const TICK_DEGREES = Array.from({ length: 36 }, (_, i) => i * 10);
const CARDINALS: { deg: number; label: string; accent?: boolean }[] = [
  { deg: 0, label: 'K', accent: true },
  { deg: 90, label: 'D' },
  { deg: 180, label: 'G' },
  { deg: 270, label: 'B' },
];
const DEGREE_LABEL_DEGREES = [30, 60, 120, 150, 210, 240, 300, 330];

export default function QiblaScreen() {
  const { place } = usePrayer();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [displayHeading, setDisplayHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);

  const bearing = useMemo(() => qiblaBearing(place.latitude, place.longitude), [place]);

  // Animasyonlu, "unwrap" edilmiş (0/360 sarmayan) birikimli açı. Dial bunun
  // negatifi kadar döner ki K harfi her zaman gerçek kuzeyi göstersin.
  const headingAnim = useRef(new Animated.Value(0)).current;

  const filteredSinRef = useRef<number | null>(null);
  const filteredCosRef = useRef<number | null>(null);
  const prevNormalizedRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const lastDisplayUpdateRef = useRef(0);

  const handleHeading = useCallback((h: Location.LocationHeadingObject) => {
    const raw = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
    if (raw == null || Number.isNaN(raw) || raw < 0) return;

    const rad = (raw * Math.PI) / 180;
    const sinR = Math.sin(rad);
    const cosR = Math.cos(rad);

    if (filteredSinRef.current === null || filteredCosRef.current === null) {
      filteredSinRef.current = sinR;
      filteredCosRef.current = cosR;
    } else {
      filteredSinRef.current += HEADING_ALPHA * (sinR - filteredSinRef.current);
      filteredCosRef.current += HEADING_ALPHA * (cosR - filteredCosRef.current);
    }

    let filteredDeg = (Math.atan2(filteredSinRef.current, filteredCosRef.current) * 180) / Math.PI;
    if (filteredDeg < 0) filteredDeg += 360;

    if (prevNormalizedRef.current === null) {
      // İlk okuma: doğrudan başlat, animasyona gerek yok.
      prevNormalizedRef.current = filteredDeg;
      accumulatedRef.current = filteredDeg;
      headingAnim.setValue(accumulatedRef.current);
      setDisplayHeading(filteredDeg);
      lastDisplayUpdateRef.current = Date.now();
      return;
    }

    const delta = angleDiffSigned(prevNormalizedRef.current, filteredDeg);
    if (Math.abs(delta) < DEAD_BAND_DEG) return; // küçük titreşimleri yok say

    prevNormalizedRef.current = filteredDeg;
    accumulatedRef.current += delta;

    Animated.timing(headingAnim, {
      toValue: accumulatedRef.current,
      duration: ROTATE_DURATION_MS,
      useNativeDriver: true,
    }).start();

    const now = Date.now();
    if (now - lastDisplayUpdateRef.current >= DISPLAY_THROTTLE_MS) {
      lastDisplayUpdateRef.current = now;
      setDisplayHeading(filteredDeg);
    }
  }, [headingAnim]);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDenied(true);
        return;
      }
      const s = await Location.watchHeadingAsync(handleHeading);
      if (cancelled) s.remove();
      else sub = s;
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [handleHeading]);

  // Dial (harf + çentik + derece halkası) telefonla birlikte döner: kadran
  // birikimli açının tersi kadar döndürülür, böylece K her zaman gerçek
  // kuzeyi gösterir. Doğrusal interpolasyon olduğundan aralık dışına da
  // sorunsuz uzanır (unwrap edilmiş büyük/negatif değerler dahil).
  const dialRotate = headingAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg'],
  });

  const diff = displayHeading === null ? null : Math.abs(angleDiffSigned(displayHeading, bearing));
  const aligned = diff !== null && diff < 5;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Kıble</Text>
      <Text style={styles.sub}>
        {place.name} · Kâbe yönü {Math.round(bearing)}°
      </Text>

      <View style={styles.center}>
        <View style={[styles.dial, aligned && styles.dialAligned]}>
          {/* Sabit referans işareti: telefonun baktığı yön (ekranın tepesi) */}
          <View style={styles.referenceMark} />

          <Animated.View style={[styles.ring, { transform: [{ rotate: dialRotate }] }]}>
            {TICK_DEGREES.map((deg) => (
              <View key={`tick-${deg}`} style={[styles.markWrap, { transform: [{ rotate: `${deg}deg` }] }]}>
                <View style={[styles.tick, deg % 90 === 0 && styles.tickLong]} />
              </View>
            ))}

            {DEGREE_LABEL_DEGREES.map((deg) => (
              <View key={`label-${deg}`} style={[styles.markWrap, { transform: [{ rotate: `${deg}deg` }] }]}>
                <View style={[styles.degreeLabelWrap, { transform: [{ rotate: `${-deg}deg` }] }]}>
                  <Text style={styles.degreeLabel}>{deg}</Text>
                </View>
              </View>
            ))}

            {CARDINALS.map((c) => (
              <View key={`cardinal-${c.deg}`} style={[styles.markWrap, { transform: [{ rotate: `${c.deg}deg` }] }]}>
                <View style={[styles.cardinalLabelWrap, { transform: [{ rotate: `${-c.deg}deg` }] }]}>
                  <Text style={[styles.cardinalLabel, c.accent && styles.cardinalAccent]}>{c.label}</Text>
                </View>
              </View>
            ))}

            <View style={[styles.needleWrap, { transform: [{ rotate: `${bearing}deg` }] }]}>
              <MaterialCommunityIcons name="navigation" size={56} color={aligned ? colors.green : colors.accent} />
              <View style={[styles.needleLine, { backgroundColor: aligned ? colors.green : colors.accent }]} />
            </View>
          </Animated.View>

          <View style={styles.dot} />
        </View>

        <Text style={[styles.status, aligned && { color: colors.green }]}>
          {denied
            ? 'Konum izni verilmedi'
            : displayHeading === null
              ? 'Pusula başlatılıyor…'
              : aligned
                ? 'Kıbleye dönüksün'
                : `Ok yönüne dön (${Math.round(diff ?? 0)}° fark)`}
        </Text>
        <Text style={styles.hint}>
          Telefonu düz tut. Sapma varsa cihazı havada 8 çizerek pusulayı kalibre et ve metal cisimlerden uzak dur.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 12 },
  sub: { color: colors.muted, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dial: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialAligned: { borderColor: colors.green },

  referenceMark: {
    position: 'absolute',
    top: -6,
    width: 4,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },

  ring: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE },
  markWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
  },

  tick: { width: 2, height: 8, marginTop: 6, backgroundColor: colors.border, borderRadius: 1 },
  tickLong: { height: 14, backgroundColor: colors.muted },

  degreeLabelWrap: { marginTop: 22 },
  degreeLabel: { fontSize: 9, color: colors.muted, opacity: 0.8 },

  cardinalLabelWrap: { marginTop: 18 },
  cardinalLabel: { fontSize: 15, fontWeight: '700', color: colors.muted, letterSpacing: 1 },
  cardinalAccent: { color: colors.danger },

  needleWrap: { position: 'absolute', top: 0, left: 0, width: SIZE, height: SIZE, alignItems: 'center', paddingTop: 22 },
  needleLine: { width: 3, height: SIZE / 2 - 100, marginTop: 4, borderRadius: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text },
  status: { color: colors.accent, fontSize: 18, fontWeight: '600', marginTop: 28 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 16, lineHeight: 18 },
  });
}
