import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import Compass from '../../modules/compass';
import CalibrationOverlay, { CompassQuality } from '../components/CalibrationOverlay';
import { loadCompassCalibrated, saveCompassCalibrated } from '../storage';
import { usePrayer } from '../PrayerContext';
import { kaabaDistanceKm, qiblaBearing } from '../location';
import { useTheme } from '../ThemeContext';
import { photoTextShadow, radius, ThemeColors } from '../theme';

const SIZE = 280;

/** Yedek yol (expo-location) için açısal yumuşatma (EMA) katsayısı — yerel modül kendisi süzer. */
const HEADING_ALPHA = 0.2;
/** Yedek yolda bu kadar küçük değişimler titreşim sayılıp yok sayılır (derece). */
const DEAD_BAND_DEG = 1;
/** Yedek yolda iğnenin seyrek gelen güncellemeler arasında yumuşakça dönmesi için animasyon süresi. */
const ROTATE_DURATION_MS = 150;
/** Durum metninin (derece/aligned) ekranda güncellenme sıklığı — gereksiz render'ı önler. */
const DISPLAY_THROTTLE_MS = 200;
/** Yerel modül yolunda kadranın güncellenmesi için en küçük yön değişimi (derece) */
const MIN_STEP_DEG = 0.2;

/** a açısından b açısına en kısa yönde imzalı fark, [-180, 180) aralığında. */
function angleDiffSigned(a: number, b: number) {
  return ((b - a + 540) % 360) - 180;
}

/** Kadranın çentikleri: her 2°, 10° ve 30°'de uzun, ana yönlerde en uzun. */
const TICKS = Array.from({ length: 180 }, (_, i) => i * 2);
const CARDINALS = [
  { deg: 0, label: 'K' },
  { deg: 90, label: 'D' },
  { deg: 180, label: 'G' },
  { deg: 270, label: 'B' },
];
const DEGREE_LABELS = Array.from({ length: 12 }, (_, i) => i * 30);
const DIRECTIONS_8 = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
/** Telefon yönü ile kıble arasındaki dilimin rengi (kıbleye dönünce yeşile döner) */
const ARC_COLOR = '#D4A055';
/** Bu kadar dereceden yakınsa "kıbleye dönük" sayılır. */
const ALIGNED_DEG = 5;
/** Kalibrasyon ekranı doğruluk "iyi" olunca en az bu kadar açık kalsın (kullanıcı 8'i görsün)… */
const CALIBRATION_MIN_MS = 3000;
/** …ve "iyi" bu kadar süre bozulmadan sürsün */
const GOOD_HOLD_MS = 1500;
/** Doğruluk bu kadar süre düşük kalırsa kalibrasyon ekranı kendiliğinden açılır */
const LOW_HOLD_MS = 1500;

/**
 * Sensörün tahmini hatası biliniyorsa (Android'de füzyon sensörü, iOS'ta headingAccuracy) ona, yoksa
 * manyetometrenin kalibrasyon düzeyine göre. Kıble için ±10° üstü "iyi" sayılmaz.
 */
function compassQuality(level: number, accuracyDeg: number): CompassQuality {
  // 0 da "bilinmiyor": bazı cihazlar (ve emülatör) tahmin yapmadığında 0 gönderiyor
  if (accuracyDeg > 0) return accuracyDeg <= 10 ? 'good' : accuracyDeg <= 20 ? 'medium' : 'low';
  return level >= 3 ? 'good' : level === 2 ? 'medium' : 'low';
}

function directionLabel(deg: number) {
  return DIRECTIONS_8[Math.round(deg / 45) % 8];
}

/** 2424 -> "2.424" */
function formatKm(km: number) {
  return String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Kadran geometrisi (merkezden yarıçaplar), boyuta göre. */
function dialGeometry(size: number) {
  const c = size / 2;
  const tickOuter = c - 50;
  const arcOuter = tickOuter - 24;
  return {
    c,
    numberR: c - 20,
    tickOuter,
    arcOuter,
    arcInner: arcOuter - c * 0.26,
    cardinalR: tickOuter - 46,
  };
}

/** Merkezden r uzaklıkta, tepeden saat yönünde deg derecedeki nokta. */
function polar(c: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.sin(a), y: c - r * Math.cos(a) };
}

/** Tepeden (0°) delta derecesine uzanan halka dilimi. */
function arcPath(c: number, ro: number, ri: number, delta: number) {
  const sweep = delta > 0 ? 1 : 0;
  const large = Math.abs(delta) > 180 ? 1 : 0;
  const o0 = polar(c, ro, 0);
  const o1 = polar(c, ro, delta);
  const i1 = polar(c, ri, delta);
  const i0 = polar(c, ri, 0);
  return `M${o0.x} ${o0.y} A${ro} ${ro} 0 ${large} ${sweep} ${o1.x} ${o1.y} L${i1.x} ${i1.y} A${ri} ${ri} 0 ${large} ${1 - sweep} ${i0.x} ${i0.y} Z`;
}

/**
 * Ekranın tepesinden (telefonun baktığı yön) kıbleye uzanan dilim. Pusula ~60 Hz veri gönderdiği için kendi
 * state'iyle yalnız bu katman yeniden çizilir; ana ekran saniyede birkaç kez güncellenir.
 */
const QiblaArc = memo(function QiblaArc({
  size,
  color,
  register,
}: {
  size: number;
  color: string;
  register: (setter: (delta: number) => void) => void;
}) {
  const [delta, setDelta] = useState<number | null>(null);
  useEffect(() => {
    register((d) => setDelta((prev) => (prev !== null && Math.abs(prev - d) < 0.4 ? prev : d)));
  }, [register]);
  const g = dialGeometry(size);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {delta !== null && Math.abs(delta) >= 0.5 ? (
        <Path d={arcPath(g.c, g.arcOuter, g.arcInner, delta)} fill={color} opacity={0.9} />
      ) : null}
    </Svg>
  );
});

export default function QiblaScreen() {
  const { place } = usePrayer();
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [displayHeading, setDisplayHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  /** Pusula doğruluğu (yalnız yerel modülde bilinir; expo-location yedeğinde 'unknown' kalır) */
  const [quality, setQuality] = useState<CompassQuality>('unknown');
  const [accuracyDeg, setAccuracyDeg] = useState<number | null>(null);
  const qualityRef = useRef<CompassQuality>('unknown');
  const accuracyDegRef = useRef<number | null>(null);
  const lastAccuracyUpdateRef = useRef(0);
  /** Kalibrasyon ekranı açık mı; pusula yerine gösterilir */
  const [calibrating, setCalibrating] = useState(false);
  const calibrationStartRef = useRef(0);
  /** Bu odaklanmada düşük doğruluk yüzünden bir kez açıldı mı (Atla'dan sonra tekrar tekrar açılmasın) */
  const autoShownRef = useRef(false);

  const startCalibration = useCallback(() => {
    calibrationStartRef.current = Date.now();
    setCalibrating(true);
  }, []);
  const finishCalibration = useCallback(() => {
    setCalibrating(false);
    saveCompassCalibrated().catch(() => {});
  }, []);

  const bearing = useMemo(() => qiblaBearing(place.latitude, place.longitude), [place]);
  const distanceKm = useMemo(() => kaabaDistanceKm(place.latitude, place.longitude), [place]);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 340);

  // Kıble dilimi her sensör okumasında güncellenir (bkz. QiblaArc)
  const bearingRef = useRef(bearing);
  bearingRef.current = bearing;
  const arcSetterRef = useRef<((delta: number) => void) | null>(null);
  const registerArc = useCallback((setter: (delta: number) => void) => {
    arcSetterRef.current = setter;
  }, []);

  // Animasyonlu, "unwrap" edilmiş (0/360 sarmayan) birikimli açı. Dial bunun
  // negatifi kadar döner ki K harfi her zaman gerçek kuzeyi göstersin.
  const headingAnim = useRef(new Animated.Value(0)).current;

  const filteredSinRef = useRef<number | null>(null);
  const filteredCosRef = useRef<number | null>(null);
  const prevNormalizedRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);
  const lastDisplayUpdateRef = useRef(0);

  const resetHeading = useCallback(() => {
    filteredSinRef.current = null;
    filteredCosRef.current = null;
    prevNormalizedRef.current = null;
  }, []);

  /** Süzülmüş yönü kadrana uygular. `animate` yalnız seyrek veri gelen yedek yolda kullanılır. */
  const applyHeading = useCallback(
    (deg: number, animate: boolean) => {
      const now = Date.now();
      arcSetterRef.current?.(angleDiffSigned(deg, bearingRef.current));
      if (prevNormalizedRef.current === null) {
        // İlk okuma: doğrudan başlat, animasyona gerek yok.
        prevNormalizedRef.current = deg;
        accumulatedRef.current = deg;
        headingAnim.setValue(deg);
        setDisplayHeading(deg);
        lastDisplayUpdateRef.current = now;
        return;
      }
      const delta = angleDiffSigned(prevNormalizedRef.current, deg);
      // Yerel modül ~60 Hz gönderiyor; gözle görülmeyen değişimde kadranı (20'ye yakın dönen görünüm) hiç
      // güncellemeyiz, yoksa telefon dururken bile JS iş parçacığı dolup dokunuşlar gecikiyor
      if (!animate && Math.abs(delta) < MIN_STEP_DEG) return;
      prevNormalizedRef.current = deg;
      accumulatedRef.current += delta;
      if (animate) {
        Animated.timing(headingAnim, {
          toValue: accumulatedRef.current,
          duration: ROTATE_DURATION_MS,
          useNativeDriver: true,
        }).start();
      } else {
        // Yerel modül ~60 Hz gönderiyor; her kareyi doğrudan yazmak animasyondan daha akıcı
        headingAnim.setValue(accumulatedRef.current);
      }
      if (now - lastDisplayUpdateRef.current >= DISPLAY_THROTTLE_MS) {
        lastDisplayUpdateRef.current = now;
        setDisplayHeading(deg);
      }
    },
    [headingAnim],
  );

  /** Yedek yol: expo-location'ın seyrek ve gürültülü yönünü süzer. */
  const handleLocationHeading = useCallback(
    (h: Location.LocationHeadingObject) => {
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

      if (prevNormalizedRef.current !== null && Math.abs(angleDiffSigned(prevNormalizedRef.current, filteredDeg)) < DEAD_BAND_DEG) {
        return; // küçük titreşimleri yok say
      }
      applyHeading(filteredDeg, true);
    },
    [applyHeading],
  );

  // Sensör yalnız Kıble sekmesi açıkken çalışır (sekmeler arka planda bağlı kalıyor, pil yemesin)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let cleanup: (() => void) | undefined;
      resetHeading();
      autoShownRef.current = false;
      qualityRef.current = 'unknown';
      accuracyDegRef.current = null;
      setQuality('unknown');
      setAccuracyDeg(null);
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setDenied(true);
          return;
        }
        setDenied(false);
        const compass = Compass;
        if (compass?.isAvailable()) {
          const sub = compass.addListener('onHeading', (e) => {
            // ~60 Hz geliyor; aynı değerle bile setState ekranı (180 çentikli kadran) yeniden çizdirebiliyor,
            // bu yüzden yalnız değişince ve sık değilse yazılır
            const q = compassQuality(e.accuracy, e.accuracyDeg ?? -1);
            if (q !== qualityRef.current) {
              qualityRef.current = q;
              setQuality(q);
            }
            const now = Date.now();
            const deg = e.accuracyDeg > 0 ? Math.round(e.accuracyDeg) : null;
            if (deg !== accuracyDegRef.current && now - lastAccuracyUpdateRef.current >= DISPLAY_THROTTLE_MS) {
              lastAccuracyUpdateRef.current = now;
              accuracyDegRef.current = deg;
              setAccuracyDeg(deg);
            }
            applyHeading(e.heading, false);
          });
          compass.start(place.latitude, place.longitude);
          // İlk kez açılışta, doğruluk iyi görünse de bir kez kalibrasyon adımı (sensörler "iyi" deyip
          // yine de sapabiliyor; kullanıcı da 8 çizmeyi öğrenmiş olur)
          if (!(await loadCompassCalibrated()) && !cancelled) {
            autoShownRef.current = true;
            startCalibration();
          }
          cleanup = () => {
            sub.remove();
            compass.stop();
          };
        } else {
          const s = await Location.watchHeadingAsync(handleLocationHeading);
          if (cancelled) s.remove();
          else cleanup = () => s.remove();
        }
      })();
      return () => {
        cancelled = true;
        cleanup?.();
      };
    }, [applyHeading, handleLocationHeading, resetHeading, startCalibration, place.latitude, place.longitude]),
  );

  // Doğruluk bir süre düşük kalırsa kalibrasyon ekranı kendiliğinden açılır (her odaklanmada en çok bir kez)
  useEffect(() => {
    if (calibrating || quality !== 'low' || autoShownRef.current) return;
    const id = setTimeout(() => {
      autoShownRef.current = true;
      startCalibration();
    }, LOW_HOLD_MS);
    return () => clearTimeout(id);
  }, [quality, calibrating, startCalibration]);

  // Kalibrasyon ekranı doğruluk iyi olup öyle kalınca kendiliğinden kapanır
  useEffect(() => {
    if (!calibrating || quality !== 'good') return;
    const shownFor = Date.now() - calibrationStartRef.current;
    const id = setTimeout(finishCalibration, Math.max(GOOD_HOLD_MS, CALIBRATION_MIN_MS - shownFor));
    return () => clearTimeout(id);
  }, [quality, calibrating, finishCalibration]);

  // Kadran (çentik, derece, harfler, kıble çizgisi) telefonla birlikte döner: birikimli açının tersi kadar
  // döndürülür, böylece K her zaman gerçek kuzeyi gösterir. Yazılar ise aynı açı kadar geri döndürülüp dik tutulur.
  // Doğrusal interpolasyon aralık dışına da uzanır (unwrap edilmiş büyük/negatif değerler dahil).
  const dialRotate = headingAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg'],
  });
  const uprightRotate = headingAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const g = dialGeometry(size);
  const signedDiff = displayHeading === null ? null : angleDiffSigned(displayHeading, bearing);
  const absDiff = signedDiff === null ? null : Math.abs(signedDiff);
  const aligned = absDiff !== null && absDiff < ALIGNED_DEG;
  const arcColor = aligned ? colors.green : ARC_COLOR;
  const qiblaRounded = Math.round(bearing) % 360;

  /** Kadranda dönen, ama ekranda hep dik duran yazı. */
  const label = (key: string, deg: number, r: number, text: string, style: object) => {
    const p = polar(g.c, r, deg);
    return (
      <Animated.View
        key={key}
        style={[styles.labelBox, { left: p.x - 30, top: p.y - 15, transform: [{ rotate: uprightRotate }] }]}
      >
        <Text style={style}>{text}</Text>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Kıble</Text>
      </View>

      <View style={styles.center}>
        {calibrating ? (
          <CalibrationOverlay colors={colors} quality={quality} accuracyDeg={accuracyDeg} onSkip={finishCalibration} />
        ) : (
          <>
            <View style={{ width: size, height: size }}>
              {/* Sabit katman: zemin, artı işareti, orta daire ve kıble dilimi */}
              <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
                <Circle cx={g.c} cy={g.c} r={g.c - 2} fill={colors.card} />
                {theme.background ? <Circle cx={g.c} cy={g.c} r={g.c - 2} fill="#000" opacity={0.3} /> : null}
                <Line x1={g.c - g.arcInner} y1={g.c} x2={g.c + g.arcInner} y2={g.c} stroke={colors.muted} strokeWidth={1} opacity={0.5} />
                <Line x1={g.c} y1={g.c - g.arcInner} x2={g.c} y2={g.c + g.arcInner} stroke={colors.muted} strokeWidth={1} opacity={0.5} />
                <Circle cx={g.c} cy={g.c} r={g.arcInner * 0.48} fill={aligned ? colors.green : colors.text} opacity={aligned ? 0.25 : 0.07} />
              </Svg>
              <QiblaArc size={size} color={arcColor} register={registerArc} />

              {/* Dönen kadran */}
              <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: dialRotate }] }]}>
                <Svg width={size} height={size}>
                  {TICKS.map((deg) => {
                    const major = deg % 30 === 0;
                    const cardinal = deg % 90 === 0;
                    const len = cardinal ? 22 : major ? 18 : deg % 10 === 0 ? 12 : 8;
                    const a = polar(g.c, g.tickOuter, deg);
                    const b = polar(g.c, g.tickOuter - len, deg);
                    return (
                      <Line
                        key={deg}
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={major ? colors.text : colors.muted}
                        strokeWidth={cardinal ? 3 : major ? 2.5 : 1}
                        opacity={major ? 1 : 0.7}
                      />
                    );
                  })}
                  {/* Kuzey: kırmızı üçgen */}
                  <Polygon
                    points={[polar(g.c, g.tickOuter + 4, 0), polar(g.c, g.tickOuter + 15, -4), polar(g.c, g.tickOuter + 15, 4)]
                      .map((p) => `${p.x},${p.y}`)
                      .join(' ')}
                    fill={colors.danger}
                  />
                  {/* Kıble çizgisi */}
                  {(() => {
                    const a = polar(g.c, g.arcOuter - 6, bearing);
                    const b = polar(g.c, g.tickOuter + 14, bearing);
                    return <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={arcColor} strokeWidth={4} strokeLinecap="round" />;
                  })()}
                </Svg>

                {DEGREE_LABELS.filter((deg) => Math.abs(angleDiffSigned(deg, bearing)) > 14).map((deg) =>
                  label(`n${deg}`, deg, g.numberR, String(deg), styles.degreeLabel),
                )}
                {label('qibla', bearing, g.numberR + 2, String(qiblaRounded), [styles.qiblaLabel, { color: arcColor }])}
                {CARDINALS.map((c) => label(`c${c.deg}`, c.deg, g.cardinalR, c.label, styles.cardinalLabel))}
              </Animated.View>

              {/* Sabit yön çizgisi: telefonun baktığı yön (ekranın tepesi) */}
              <View
                pointerEvents="none"
                style={[
                  styles.pointer,
                  {
                    left: g.c - 2.5,
                    top: g.c - g.tickOuter - 12,
                    height: g.tickOuter - g.arcOuter + 12,
                    backgroundColor: aligned ? colors.green : colors.text,
                  },
                ]}
              />
            </View>

            <View style={styles.readout}>
              {denied ? (
                <Text style={styles.statusText}>Konum izni verilmedi</Text>
              ) : signedDiff === null ? (
                <Text style={styles.statusText}>Pusula başlatılıyor…</Text>
              ) : aligned ? (
                <View style={styles.bigRow}>
                  <MaterialCommunityIcons name="check-circle" size={40} color={colors.green} />
                  <Text style={[styles.alignedText, { color: colors.green }]}>Kıbleye dönüksün</Text>
                </View>
              ) : (
                <View style={styles.bigRow}>
                  <MaterialCommunityIcons
                    name={signedDiff > 0 ? 'arrow-right-bottom' : 'arrow-left-bottom'}
                    size={36}
                    color={colors.text}
                    style={styles.turnIcon}
                  />
                  <Text style={styles.bigDegrees}>{Math.round(absDiff ?? 0)}°</Text>
                  <Text style={styles.bigWord}>{signedDiff > 0 ? 'sağa' : 'sola'}</Text>
                </View>
              )}
              {displayHeading !== null ? (
                <Text style={styles.info}>
                  Yön {Math.round(displayHeading) % 360}° {directionLabel(displayHeading)} · Kıble {qiblaRounded}°
                </Text>
              ) : null}
              <Text style={styles.info}>
                {place.name} · Kâbe'ye {formatKm(distanceKm)} km
              </Text>
              <Text style={[styles.hint, quality === 'low' && { color: colors.danger }]}>
                {quality === 'low'
                  ? `Doğruluk düşük${accuracyDeg !== null ? ` (±${accuracyDeg}°)` : ''} · Kalibre etmen gerekiyor`
                  : quality === 'medium'
                    ? `Doğruluk orta${accuracyDeg !== null ? ` (±${accuracyDeg}°)` : ''} · Kalibre etmek yönü düzeltir`
                    : `Telefonu düz tutun, metal cisimlerden uzak durun${accuracyDeg !== null ? ` · ±${accuracyDeg}°` : ''}`}
              </Text>
              {Compass?.isAvailable() && !denied ? (
                <TouchableOpacity style={styles.calibrateButton} onPress={startCalibration} hitSlop={8}>
                  <MaterialCommunityIcons name="rotate-3d-variant" size={18} color={colors.accent} />
                  <Text style={styles.calibrateText}>Kalibre et</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    title: { color: colors.text, fontSize: 24, fontWeight: '700', ...photoTextShadow(colors) },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    labelBox: { position: 'absolute', width: 60, height: 30, alignItems: 'center', justifyContent: 'center' },
    degreeLabel: { fontSize: 13, color: colors.muted },
    qiblaLabel: { fontSize: 18, fontWeight: '800' },
    cardinalLabel: { fontSize: 22, fontWeight: '500', color: colors.text },
    pointer: { position: 'absolute', width: 5, borderRadius: 2.5 },

    readout: {
      alignItems: 'center',
      marginTop: 20,
      width: '100%',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radius,
      backgroundColor: colors.card,
    },
    bigRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 10 },
    turnIcon: { marginBottom: 14 },
    bigDegrees: { color: colors.text, fontSize: 64, fontWeight: '300', lineHeight: 72 },
    bigWord: { color: colors.text, fontSize: 36, fontWeight: '300', marginBottom: 8 },
    alignedText: { fontSize: 26, fontWeight: '600', marginBottom: 4 },
    statusText: { color: colors.muted, fontSize: 18, fontWeight: '500' },
    info: { color: colors.text, fontSize: 15, marginTop: 8, textAlign: 'center' },
    hint: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10, lineHeight: 18 },
    calibrateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    calibrateText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  });
}
