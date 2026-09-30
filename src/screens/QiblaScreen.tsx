import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePrayer } from '../PrayerContext';
import { qiblaBearing } from '../location';
import { colors } from '../theme';

const SIZE = 280;

export default function QiblaScreen() {
  const { place } = usePrayer();
  const [heading, setHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);

  const bearing = useMemo(() => qiblaBearing(place.latitude, place.longitude), [place]);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setDenied(true);
        return;
      }
      const s = await Location.watchHeadingAsync((h) => {
        // trueHeading yoksa (-1) manyetik yönü kullan
        setHeading(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
      });
      if (cancelled) s.remove();
      else sub = s;
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  const rotation = heading === null ? 0 : (bearing - heading + 360) % 360;
  const diff = Math.min(rotation, 360 - rotation);
  const aligned = heading !== null && diff < 5;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Kıble</Text>
      <Text style={styles.sub}>
        {place.name} · Kâbe yönü {Math.round(bearing)}°
      </Text>

      <View style={styles.center}>
        <View style={[styles.dial, aligned && styles.dialAligned]}>
          <Text style={[styles.mark, styles.markTop]}>ÜST</Text>
          <View style={[styles.needleWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
            <MaterialCommunityIcons name="navigation" size={64} color={aligned ? colors.green : colors.accent} />
            <View style={[styles.needleLine, { backgroundColor: aligned ? colors.green : colors.accent }]} />
          </View>
          <View style={styles.dot} />
        </View>

        <Text style={[styles.status, aligned && { color: colors.green }]}>
          {denied
            ? 'Konum izni verilmedi'
            : heading === null
              ? 'Pusula başlatılıyor…'
              : aligned
                ? 'Kıbleye dönüksün'
                : `Ok yönüne dön (${Math.round(diff)}° fark)`}
        </Text>
        <Text style={styles.hint}>
          Telefonu düz tut. Sapma varsa cihazı havada 8 çizerek pusulayı kalibre et ve metal cisimlerden uzak dur.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  mark: { position: 'absolute', color: colors.muted, fontSize: 11, letterSpacing: 2 },
  markTop: { top: 10 },
  needleWrap: { position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', paddingTop: 22 },
  needleLine: { width: 3, height: SIZE / 2 - 100, marginTop: 4, borderRadius: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.text },
  status: { color: colors.accent, fontSize: 18, fontWeight: '600', marginTop: 28 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, paddingHorizontal: 16, lineHeight: 18 },
});
