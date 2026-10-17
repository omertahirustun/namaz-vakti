import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, useWindowDimensions, Vibration, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
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
  /** Yüzün kenarı (dışında tema renginde çerçeve) */
  const face = c - 12;
  return {
    c,
    face,
    tickOuter: face - 5,
    /** Derece sayıları, ana yön harfleri ve Kâbe rozeti bu halkada */
    labelR: face - 40,
    /** Telefon yönünden kıbleye uzanan ince dilim */
    arcOuter: face - 62,
    arcInner: face - 70,
    /** İbre ucu */
    needleR: face - 64,
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
 * Ekranın tepesinden (telefonun baktığı yön) kıbleye uzanan ince dilim. Pusula ~60 Hz veri gönderdiği için kendi
 * state'iyle yalnız bu katman yeniden çizilir.
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
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      {delta !== null && Math.abs(delta) >= 0.5 ? (
        <Path d={arcPath(g.c, g.arcOuter, g.arcInner, delta)} fill={color} opacity={0.55} />
      ) : null}
    </Svg>
  );
});

const GOLD = '#D4A055';
const GOLD_DARK = '#9C7130';
const GOLD_LIGHT = '#F1D39A';
const BADGE = 38;

/** Kâbe: altın çerçeveli rozet içinde siyah küp, altın kuşak ve kapı */
function KaabaBadge({ glow }: { glow: string }) {
  const s = BADGE;
  const h = s / 2;
  return (
    <Svg width={s} height={s}>
      <Defs>
        <LinearGradient id="kGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="1" stopColor={GOLD_DARK} />
        </LinearGradient>
      </Defs>
      <Circle cx={h} cy={h} r={h - 1} fill="url(#kGold)" stroke={glow} strokeWidth={1.5} />
      <Rect x={h - 9} y={h - 9} width={18} height={18} rx={2} fill="#141414" />
      <Rect x={h - 9} y={h - 5} width={18} height={3.2} fill={GOLD_LIGHT} />
      <Rect x={h + 2} y={h + 2} width={4} height={7} rx={0.8} fill={GOLD} />
    </Svg>
  );
}

/**
 * Kadran: tema renginde çerçeve, ışıklı yüz, dönen çentik/yazı halkası, kıble ibresi ve Kâbe rozeti, tepede sabit
 * yön üçgeni. 180 çentikli SVG pahalı; yön değiştikçe yalnız Animated dönüşü (native) değişir, bu bileşen ise yalnız
 * boyut, tema, kıble açısı ya da hizalanma değişince yeniden çizilir. Kıbleye dönünce Kâbe büyür, çevrede yeşil
 * ışık nabız gibi atar.
 */
const Dial = memo(function Dial({
  size,
  colors,
  photo,
  bearing,
  aligned,
  registerArc,
  dialRotate,
  uprightRotate,
  styles,
}: {
  size: number;
  colors: ThemeColors;
  photo: boolean;
  bearing: number;
  aligned: boolean;
  registerArc: (setter: (delta: number) => void) => void;
  dialRotate: Animated.AnimatedInterpolation<string>;
  uprightRotate: Animated.AnimatedInterpolation<string>;
  styles: ReturnType<typeof makeStyles>;
}) {
  const g = dialGeometry(size);
  const markColor = aligned ? colors.green : GOLD;

  // Açılışta kadran yaylanarak belirir
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 50, useNativeDriver: true }).start();
  }, [enter]);

  // Hizalanınca Kâbe rozeti büyür, yeşil hâle nabız gibi atar
  const alignAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(alignAnim, { toValue: aligned ? 1 : 0, friction: 5, tension: 90, useNativeDriver: true }).start();
    if (!aligned) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [aligned, alignAnim, pulse]);

  const badgeScale = alignAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const glowOpacity = Animated.multiply(alignAnim, pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] }));
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.045] });

  /** Kadranda dönen, ama ekranda hep dik duran yazı. */
  const label = (key: string, deg: number, text: string, style: object) => {
    const p = polar(g.c, g.labelR, deg);
    return (
      <Animated.View
        key={key}
        style={[styles.labelBox, { left: p.x - 30, top: p.y - 15, transform: [{ rotate: uprightRotate }] }]}
      >
        <Text style={style}>{text}</Text>
      </Animated.View>
    );
  };

  const badge = polar(g.c, g.labelR, bearing);
  const tip = polar(g.c, g.needleR, bearing);
  const tail = polar(g.c, 22, bearing + 180);
  const side = (d: number) => polar(g.c, 7, bearing + d);
  const faceBase = photo ? '#10131C' : colors.card;

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity: enter,
        transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}
    >
      {/* Kıbleye dönünce dışta yeşil ışık */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.glow,
          { borderColor: colors.green, opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />

      {/* Sabit katman: çerçeve ve ışıklı yüz */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bezel" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.95} />
            <Stop offset="1" stopColor={colors.text} stopOpacity={0.9} />
          </LinearGradient>
          <RadialGradient id="face" cx="50%" cy="38%" r="70%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={photo ? 0.1 : 0.9} />
            <Stop offset="0.55" stopColor={faceBase} stopOpacity={photo ? 0.75 : 1} />
            <Stop offset="1" stopColor={photo ? '#000000' : colors.border} stopOpacity={photo ? 0.85 : 1} />
          </RadialGradient>
        </Defs>
        <Circle cx={g.c} cy={g.c} r={g.c - 1} fill="url(#bezel)" />
        <Circle cx={g.c} cy={g.c} r={g.face} fill="url(#face)" />
        <Circle cx={g.c} cy={g.c} r={g.face} fill="none" stroke="#000" strokeOpacity={0.12} strokeWidth={1} />
      </Svg>

      <QiblaArc size={size} color={markColor} register={registerArc} />

      {/* Dönen kadran: çentikler, sayılar, ana yönler, ibre ve Kâbe */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: dialRotate }] }]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="needle" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={aligned ? colors.green : GOLD_LIGHT} />
              <Stop offset="1" stopColor={aligned ? colors.green : GOLD_DARK} />
            </LinearGradient>
          </Defs>
          {TICKS.map((deg) => {
            const major = deg % 30 === 0;
            const cardinal = deg % 90 === 0;
            const len = cardinal ? 16 : major ? 12 : deg % 10 === 0 ? 8 : 4;
            const a = polar(g.c, g.tickOuter, deg);
            const b = polar(g.c, g.tickOuter - len, deg);
            return (
              <Line
                key={deg}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={deg === 0 ? colors.danger : major ? colors.text : colors.muted}
                strokeWidth={cardinal ? 2.5 : major ? 2 : 1}
                strokeOpacity={major ? 1 : 0.55}
                strokeLinecap="round"
              />
            );
          })}
          {/* Kıble ibresi: merkezden Kâbe'ye sivrilen altın ok */}
          <Polygon
            points={[tip, side(90), tail, side(-90)].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="url(#needle)"
            stroke={GOLD_DARK}
            strokeOpacity={0.4}
            strokeWidth={0.8}
          />
        </Svg>

        {DEGREE_LABELS.filter((deg) => deg % 90 !== 0 && Math.abs(angleDiffSigned(deg, bearing)) > 16).map((deg) =>
          label(`n${deg}`, deg, String(deg), styles.degreeLabel),
        )}
        {CARDINALS.filter((c) => Math.abs(angleDiffSigned(c.deg, bearing)) > 12).map((c) =>
          label(`c${c.deg}`, c.deg, c.label, [styles.cardinalLabel, c.deg === 0 && { color: colors.danger }]),
        )}

        <Animated.View
          style={[
            styles.badge,
            {
              left: badge.x - BADGE / 2,
              top: badge.y - BADGE / 2,
              transform: [{ rotate: uprightRotate }, { scale: badgeScale }],
            },
          ]}
        >
          <KaabaBadge glow={aligned ? colors.green : '#FFFFFF'} />
        </Animated.View>
      </Animated.View>

      {/* Tepede sabit üçgen: telefonun baktığı yön */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Polygon
          points={`${g.c - 9},4 ${g.c + 9},4 ${g.c},20`}
          fill={aligned ? colors.green : '#FFFFFF'}
          stroke={aligned ? colors.green : colors.text}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        {/* Merkez göbeği */}
        <Circle cx={g.c} cy={g.c} r={9} fill={markColor} />
        <Circle cx={g.c} cy={g.c} r={4} fill="#FFFFFF" />
      </Svg>

    </Animated.View>
  );
});

/** Dönülecek yönü gösteren ok; açı değiştikçe yaylanarak döner (telefonun tepesine göre kıblenin yönü) */
function TurnArrow({ diff, styles }: { diff: number; styles: ReturnType<typeof makeStyles> }) {
  const rot = useRef(new Animated.Value(diff)).current;
  useEffect(() => {
    Animated.spring(rot, { toValue: diff, friction: 8, tension: 70, useNativeDriver: true }).start();
  }, [diff, rot]);
  const rotate = rot.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] });
  return (
    <View style={styles.turnCircle}>
      {/* Yukarı bakan ok (0° = telefonun tepesi); kıblenin bulunduğu yöne döner */}
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={30} height={30}>
          <Polygon points="15,2 27,15 19,15 19,28 11,28 11,15 3,15" fill="#FFFFFF" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

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
  // Sabit kimlikli olmalı; her çizimde yeni interpolate düğümü kadranın (Dial) memo'sunu bozar
  const dialRotate = useMemo(
    () => headingAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '-360deg'] }),
    [headingAnim],
  );
  const uprightRotate = useMemo(
    () => headingAnim.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }),
    [headingAnim],
  );

  const signedDiff = displayHeading === null ? null : angleDiffSigned(displayHeading, bearing);
  const absDiff = signedDiff === null ? null : Math.abs(signedDiff);
  const aligned = absDiff !== null && absDiff < ALIGNED_DEG;
  const qiblaRounded = Math.round(bearing) % 360;

  // Kıbleye dönüldüğü an kısa titreşim (her hizalanmada bir kez)
  useEffect(() => {
    if (aligned) Vibration.vibrate(35);
  }, [aligned]);

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
            <Dial
              size={size}
              colors={colors}
              photo={!!theme.background}
              bearing={bearing}
              aligned={aligned}
              registerArc={registerArc}
              dialRotate={dialRotate}
              uprightRotate={uprightRotate}
              styles={styles}
            />

            <View style={styles.readout}>
              {/* Sabit yükseklik: "Kıbleye dönüksün" tek satır, "146° sağa dön" iki satır; kadran zıplamasın */}
              <View style={styles.statusArea}>
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
                    <TurnArrow diff={signedDiff} styles={styles} />
                    <View>
                      <Text style={styles.bigDegrees}>{Math.round(absDiff ?? 0)}°</Text>
                      <Text style={styles.bigWord}>{signedDiff > 0 ? 'sağa dön' : 'sola dön'}</Text>
                    </View>
                  </View>
                )}
              </View>
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
    degreeLabel: { fontSize: 12, color: colors.muted, fontWeight: '500' },
    cardinalLabel: { fontSize: 22, fontWeight: '700', color: colors.text },
    glow: { borderRadius: 9999, borderWidth: 6 },
    badge: {
      position: 'absolute',
      width: BADGE,
      height: BADGE,
      borderRadius: BADGE / 2,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },

    readout: {
      alignItems: 'center',
      marginTop: 20,
      width: '100%',
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radius,
      backgroundColor: colors.card,
    },
    statusArea: { minHeight: 96, justifyContent: 'center' },
    bigRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
    turnCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    bigDegrees: { color: colors.text, fontSize: 52, fontWeight: '300', lineHeight: 60 },
    bigWord: { color: colors.muted, fontSize: 22, fontWeight: '500' },
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
