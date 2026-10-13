import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';
import { getTwoMonths } from '../api';
import { loadPlace, loadSettings, loadThemeId } from '../storage';
import { ThemeId } from '../theme';
import { countdownStage, dateKey, dayPartsTr, findNext } from '../time';
import { DayTimes, PRAYER_KEYS, PRAYER_NAMES_TR, PrayerKey, WidgetStyle } from '../types';
import { countdownProps, STAGE_COLORS } from './countdown';

/** app.json'daki react-native-android-widget eklenti ayarındaki widget adları */
export const WIDGET_NAMES = ['PrayerTimes', 'PrayerCountdown', 'PrayerStrip'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** 1x1 widget'taki "Yatsıya 02:36" için vakit adlarının yönelme hâli */
const PRAYER_TO_TR: Record<PrayerKey, string> = {
  Fajr: 'İmsaka',
  Sunrise: 'Güneşe',
  Dhuhr: 'Öğleye',
  Asr: 'İkindiye',
  Maghrib: 'Akşama',
  Isha: 'Yatsıya',
};

/** Widget'ın çizilmesi için gereken her şey; uygulama içinden de arka plandan da aynı şekilde kurulur. */
export interface WidgetData {
  themeId: ThemeId;
  /** Eski kayıtlarda yok; yoksa 'theme' sayılır */
  widgetStyle?: WidgetStyle;
  placeName: string;
  days: DayTimes[];
}

interface WidgetLook {
  /** Fotoğraflı temalarda koyu örtüsü gömülü yatay görsel (assets/widget) */
  image?: ImageWidgetSource;
  /** 6x2 yatay şerit widget için aynı fotoğrafın daha geniş kesiti */
  wideImage?: ImageWidgetSource;
  gradient?: [ColorProp, ColorProp];
  /** Düz renk zemin (gri/siyah/beyaz); hiçbiri yoksa widget şeffaftır */
  background?: ColorProp;
  /** Koyu zeminin duvar kâğıdından ayrılması için ince kenar */
  border?: ColorProp;
  /** Şeffaf zeminde yazılar her duvar kâğıdında okunsun diye gölgeli çizilir */
  shadow?: boolean;
  text: ColorProp;
  muted: ColorProp;
  /** Geçmiş vakitler */
  faded: ColorProp;
  accent: ColorProp;
  /** accent zemin üstündeki yazı (şeritte sıradaki vaktin hapı) */
  onAccent: ColorProp;
  /** Sıradaki vaktin sütun arka planı ve ince ayraçlar */
  chip: ColorProp;
}

// Widget kütüphanesi renkleri yalnız "#RRGGBB" ya da "rgba(r, g, b, a)" (virgülden sonra boşluklu) kabul ediyor;
// bu yüzden theme.ts'teki renklerin widget'a uygun kopyaları burada.
const LOOKS: Record<ThemeId, WidgetLook> = {
  default: {
    gradient: ['#3A55C8', '#1B2D82'],
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.82)',
    faded: 'rgba(255, 255, 255, 0.5)',
    accent: '#FFFFFF',
    onAccent: '#1B2D82',
    chip: 'rgba(255, 255, 255, 0.24)',
  },
  mecca: {
    image: require('../../assets/widget/mecca.jpg'),
    wideImage: require('../../assets/widget/mecca-wide.jpg'),
    text: '#F6EFE2',
    muted: '#C7B89C',
    faded: 'rgba(246, 239, 226, 0.5)',
    accent: '#D8AF68',
    onAccent: '#2A1E0C',
    chip: 'rgba(216, 175, 104, 0.28)',
  },
  medina: {
    image: require('../../assets/widget/medina.jpg'),
    wideImage: require('../../assets/widget/medina-wide.jpg'),
    text: '#F3EFE2',
    muted: '#C9D2C0',
    faded: 'rgba(243, 239, 226, 0.5)',
    accent: '#9CCB9F',
    onAccent: '#13281A',
    chip: 'rgba(127, 184, 133, 0.32)',
  },
  aqsa: {
    image: require('../../assets/widget/aqsa.jpg'),
    wideImage: require('../../assets/widget/aqsa-wide.jpg'),
    text: '#F4F1E6',
    muted: '#C9D2E6',
    faded: 'rgba(244, 241, 230, 0.5)',
    accent: '#E3BC5A',
    onAccent: '#2A2108',
    chip: 'rgba(227, 188, 90, 0.28)',
  },
};

/** Ayarlardan seçilen, temadan bağımsız widget görünümleri */
const STYLE_LOOKS: Record<Exclude<WidgetStyle, 'theme'>, WidgetLook> = {
  transparent: {
    shadow: true,
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.9)',
    faded: 'rgba(255, 255, 255, 0.62)',
    accent: '#FFFFFF',
    onAccent: '#14161A',
    chip: 'rgba(255, 255, 255, 0.28)',
  },
  gray: {
    background: '#3A3D44',
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.7)',
    faded: 'rgba(255, 255, 255, 0.4)',
    accent: '#FFD27A',
    onAccent: '#2B2108',
    chip: 'rgba(255, 255, 255, 0.12)',
  },
  black: {
    background: '#0B0B0D',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.66)',
    faded: 'rgba(255, 255, 255, 0.36)',
    accent: '#F2C46B',
    onAccent: '#1E1606',
    chip: 'rgba(255, 255, 255, 0.1)',
  },
  white: {
    background: '#FFFFFF',
    text: '#16181D',
    muted: 'rgba(22, 24, 29, 0.62)',
    faded: 'rgba(22, 24, 29, 0.36)',
    accent: '#243AA2',
    onAccent: '#FFFFFF',
    chip: 'rgba(36, 58, 162, 0.1)',
  },
};

function lookFor(data: WidgetData | null): WidgetLook {
  const style = data?.widgetStyle ?? 'theme';
  return style === 'theme' ? LOOKS[data?.themeId ?? 'default'] : STYLE_LOOKS[style];
}

const SHADOW = {
  textShadowColor: 'rgba(0, 0, 0, 0.6)',
  textShadowRadius: 4,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/** Yazı rengi; şeffaf görünümde gölgeyle birlikte */
function ink(look: WidgetLook, color: ColorProp) {
  return look.shadow ? { color, ...SHADOW } : { color };
}

const RADIUS = 22;

// Kütüphane fontu fontWeight ile yeniden ağırlıklandırıyor; dosyanın kendi ağırlığını vermezsek
// Android sahte kalınlık/incelik uygulayabilir. Fontlar app.json'daki eklenti ayarından gelir.
const FONTS = {
  regular: { fontFamily: 'Inter_400Regular', fontWeight: '400' },
  medium: { fontFamily: 'Inter_500Medium', fontWeight: '500' },
  semibold: { fontFamily: 'Inter_600SemiBold', fontWeight: '600' },
  bold: { fontFamily: 'Inter_700Bold', fontWeight: '700' },
} as const;

/** Kayıtlı tema, konum ve önbellekteki vakitlerle widget verisini kurar (uygulama kapalıyken de çalışır). */
export async function loadWidgetData(): Promise<WidgetData | null> {
  const [themeId, place, settings] = await Promise.all([loadThemeId(), loadPlace(), loadSettings()]);
  try {
    const days = await getTwoMonths(place, settings.method, new Date());
    return { themeId, widgetStyle: settings.widgetStyle, placeName: place.name, days };
  } catch {
    return null;
  }
}

interface WidgetProps {
  data: WidgetData | null;
  width: number;
  height: number;
  now?: Date;
  /** Uygulama içi önizleme (WidgetPreview): canlı sayaç yerine kalan süre düz metin */
  preview?: boolean;
}

/** Adına göre doğru widget'ı çizer (görev işleyicisi ve uygulama içi güncelleme aynı yolu kullanır). */
export function renderPrayerWidget(name: string, props: WidgetProps) {
  if (name === 'PrayerCountdown') return <CountdownWidget {...props} />;
  if (name === 'PrayerStrip') return <StripWidget {...props} />;
  return <PrayerWidget {...props} />;
}

/** Temanın fotoğrafı, degradesi ya da düz zemin üstünde (şeffafta doğrudan duvar kâğıdında) içerik; dokununca uygulamayı açar. */
function Frame({
  look,
  width,
  height,
  radius,
  wide = false,
  children,
}: {
  look: WidgetLook;
  width: number;
  height: number;
  radius: number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const image = wide ? look.wideImage ?? look.image : look.image;
  return (
    <OverlapWidget
      clickAction="OPEN_APP"
      style={{ width: 'match_parent', height: 'match_parent', borderRadius: radius, overflow: 'hidden' }}
    >
      {image ? (
        <ImageWidget
          image={image}
          imageWidth={width}
          imageHeight={height}
          resizeMode="cover"
          radius={radius}
          style={{ width: 'match_parent', height: 'match_parent' }}
        />
      ) : look.gradient ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 'match_parent',
            borderRadius: radius,
            backgroundGradient: { from: look.gradient[0], to: look.gradient[1], orientation: 'TL_BR' },
          }}
        />
      ) : look.background ? (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 'match_parent',
            borderRadius: radius,
            backgroundColor: look.background,
            ...(look.border ? { borderWidth: 1, borderColor: look.border } : {}),
          }}
        />
      ) : (
        <FlexWidget style={{ width: 'match_parent', height: 'match_parent' }} />
      )}
      {children}
    </OverlapWidget>
  );
}

/** 4x2: konum, tarih, sıradaki vakte canlı geri sayım ve günün vakitleri */
export function PrayerWidget({ data, width, height, now = new Date(), preview = false }: WidgetProps) {
  const look = lookFor(data);
  const next = data ? findNext(data.days, now) : null;
  // Yatsıdan sonra yarının vakitleri gösterilir (sıradaki vakit yarının imsakı)
  const shownDate = next ? dateKey(next.at) : dateKey(now);
  const day = data?.days.find((d) => d.date === shownDate);

  return (
    <Frame look={look} width={width} height={height} radius={RADIUS}>
      {day && next ? (
        <Content
          look={look}
          placeName={data!.placeName}
          day={day}
          nextKey={next.key}
          nextAt={next.at}
          now={now}
          isToday={shownDate === dateKey(now)}
          preview={preview}
        />
      ) : (
        <FlexWidget
          style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
          <TextWidget
            text="Vakitleri görmek için uygulamayı aç"
            style={{ fontSize: 15, ...FONTS.semibold, ...ink(look, look.text), textAlign: 'center' }}
          />
        </FlexWidget>
      )}
    </Frame>
  );
}

/**
 * 1x1: sıradaki vaktin adı ("Yatsıya") ve altında saat:dakika geri sayım ("02:36").
 * Temada ve şeffafta arka plansız (beyaz + gölgeli yazı); gri/siyah/beyaz seçilince yuvarlak düz zemin.
 * Kutu küçük olduğu için yazılar sistem yazı boyutundan etkilenmez (allowFontScaling=false).
 */
export function CountdownWidget({ data, width, now = new Date(), preview = false }: WidgetProps) {
  const style = data?.widgetStyle ?? 'theme';
  const look = STYLE_LOOKS[style === 'theme' ? 'transparent' : style];
  const next = data ? findNext(data.days, now) : null;
  const msLeft = next ? next.at.getTime() - now.getTime() : 0;
  const stage = countdownStage(msLeft);
  // Canlı sayaç sistem fontuyla çizilir; Samsung/Xiaomi vb. fontları daha geniş, dar 1x1 hücrede "09:59"un son hanesi
  // kırpılıyordu. "09:59" kalın yazıda ~2.7 em; 3.3 ile bölmek geniş fontlara ve launcher'ın bildirdiğinden dar
  // hücreye pay bırakır.
  const fitSize = Math.floor((width - 8) / 3.3);
  const countdownSize = Math.max(12, Math.min(stage === 'urgent' ? 26 : 22, fitSize));
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 2,
        ...(look.background
          ? {
              backgroundColor: look.background,
              borderRadius: 18,
              ...(look.border ? { borderWidth: 1, borderColor: look.border } : {}),
            }
          : {}),
      }}
    >
      {/* Fragment (<>) kullanılamaz: kütüphane ağacı kurarken tanımıyor; dizi düzleştiriliyor */}
      {next ? (
        [
          <TextWidget
            key="label"
            text={PRAYER_TO_TR[next.key]}
            maxLines={1}
            allowFontScaling={false}
            style={{ fontSize: 13, ...FONTS.semibold, ...ink(look, look.background ? look.muted : look.text) }}
          />,
          // Yer tutucu; üstüne canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns)
          <TextWidget
            key="countdown"
            {...countdownProps(next.at, msLeft, preview)}
            maxLines={1}
            allowFontScaling={false}
            style={{
              fontSize: countdownSize,
              ...FONTS.bold,
              // Kırmızı aşamalarda gölgesiz düz renk (yama gölgesiz Chronometer'ı seçer)
              ...(stage === 'normal' ? ink(look, look.text) : { color: STAGE_COLORS[stage] }),
              textAlign: 'center',
            }}
          />,
        ]
      ) : (
        <TextWidget
          text="Uygulamayı aç"
          allowFontScaling={false}
          style={{ fontSize: 11, ...FONTS.semibold, ...ink(look, look.text), textAlign: 'center' }}
        />
      )}
    </FlexWidget>
  );
}

/**
 * 6x2 yatay şerit: solda sıradaki vakte canlı geri sayım, ince bir ayraç, sağda yan yana günün altı vakti.
 * Sıradaki vakit dolu bir hapla vurgulanır, geçmiş vakitler soluk kalır. Tek hücre boyuna inince
 * konum/tarih satırı gizlenir ve yazılar yüksekliğe sığacak boya küçülür.
 * Hücreler dar olduğu için yazılar sistem yazı boyutundan etkilenmez.
 */
export function StripWidget({ data, width, height, now = new Date(), preview = false }: WidgetProps) {
  const look = lookFor(data);
  const next = data ? findNext(data.days, now) : null;
  const shownDate = next ? dateKey(next.at) : dateKey(now);
  const day = data?.days.find((d) => d.date === shownDate);

  return (
    <Frame look={look} width={width} height={height} radius={RADIUS} wide>
      {day && next ? (
        <StripContent
          look={look}
          width={width}
          height={height}
          placeName={data!.placeName}
          day={day}
          nextKey={next.key}
          nextAt={next.at}
          now={now}
          isToday={shownDate === dateKey(now)}
          preview={preview}
        />
      ) : (
        <FlexWidget
          style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 12 }}
        >
          <TextWidget
            text="Vakitleri görmek için uygulamayı aç"
            allowFontScaling={false}
            style={{ fontSize: 14, ...FONTS.semibold, ...ink(look, look.text), textAlign: 'center' }}
          />
        </FlexWidget>
      )}
    </Frame>
  );
}

const clamp = (min: number, max: number, v: number) => Math.max(min, Math.min(max, v));

function StripContent({
  look,
  width,
  height,
  placeName,
  day,
  nextKey,
  nextAt,
  now,
  isToday,
  preview,
}: {
  look: WidgetLook;
  width: number;
  height: number;
  placeName: string;
  day: DayTimes;
  nextKey: PrayerKey;
  nextAt: Date;
  now: Date;
  isToday: boolean;
  preview: boolean;
}) {
  const parts = dayPartsTr(day.date);
  const msLeft = nextAt.getTime() - now.getTime();
  const stage = countdownStage(msLeft);
  const activeIndex = PRAYER_KEYS.indexOf(nextKey);

  // Tek hücre boyundaki şeritte konum/tarih satırı sığmaz
  const compact = height < 96;
  const padH = 14;
  const padV = compact ? 8 : 12;
  const inner = height - 2 * padV;

  // Sol blok genişliğin ~%30'u; yükseklik yetiyorsa ve sütunlar yanında daralacaksa (telefon genişliği ve altı)
  // sayaç üst satıra, vakitler tam genişlikte alta alınır. Tek hücre boyunda hep yan yana.
  const DIVIDER = 1 + 2 * 10;
  const sideInfoWidth = Math.round(width * 0.3);
  const stacked = !compact && (width - 2 * padH - sideInfoWidth - DIVIDER) / 6 - 4 < 40;
  const infoWidth = stacked ? 0 : sideInfoWidth;
  // Sütun: 2 dp yan boşluk; "05:52" kalın ~2.7 em, "İkindi" ~3 em; hapın kenarlarında da pay kalsın
  const columnWidth = (width - 2 * padH - (stacked ? 0 : infoWidth + DIVIDER)) / 6 - 4;
  // Alt alta düzende üst satır (~20 dp) sütunlardan yer alır
  const columnsHeight = stacked ? inner - 22 : inner;
  const columnPad = compact || stacked ? 4 : 9;
  const timeSize = clamp(
    9,
    compact ? 14 : 16,
    Math.min(Math.floor(columnWidth / 3.5), Math.floor((columnsHeight - 2 * columnPad) / 2.6)),
  );
  const nameSize = clamp(8, 11, Math.min(Math.floor(columnWidth / 3.6), timeSize - 2));

  // "02:36" kalın ~2.7 em, 3.3 OEM'lerin geniş fontuna pay bırakır (son hane kırpılmasın)
  const countdownSize = stacked
    ? clamp(12, 20, Math.floor((width - 2 * padH) / 3 / 3.3))
    : clamp(
        14,
        stage === 'urgent' ? 34 : 30,
        Math.min(Math.floor((infoWidth - 6) / 3.3), Math.floor((inner - (compact ? 15 : 34)) / 1.25)),
      );

  const caption = (
    <TextWidget
      text={`${PRAYER_TO_TR[nextKey]} kalan`}
      maxLines={1}
      allowFontScaling={false}
      style={{ fontSize: compact || stacked ? 10 : 11, ...FONTS.semibold, ...ink(look, look.accent) }}
    />
  );
  // Yer tutucu; üstüne canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns)
  const countdown = (
    <TextWidget
      {...countdownProps(nextAt, msLeft, preview)}
      maxLines={1}
      allowFontScaling={false}
      style={{
        fontSize: countdownSize,
        ...FONTS.bold,
        ...(stage === 'normal' ? ink(look, look.text) : { color: STAGE_COLORS[stage] }),
        ...(stacked ? { marginLeft: 6 } : {}),
      }}
    />
  );
  const columns = (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
      {PRAYER_KEYS.map((key, i) => {
        const active = i === activeIndex;
        const past = isToday && i < activeIndex;
        return (
          <FlexWidget
            key={key}
            style={{
              flex: 1,
              flexDirection: 'column',
              alignItems: 'center',
              marginHorizontal: 2,
              paddingVertical: columnPad,
              borderRadius: 14,
              backgroundColor: active ? look.accent : 'rgba(0, 0, 0, 0)',
            }}
          >
            <TextWidget
              text={PRAYER_NAMES_TR[key]}
              maxLines={1}
              allowFontScaling={false}
              style={{
                fontSize: nameSize,
                ...(active ? FONTS.semibold : FONTS.medium),
                ...(active ? { color: look.onAccent } : ink(look, past ? look.faded : look.muted)),
              }}
            />
            <TextWidget
              text={day.times[key]}
              maxLines={1}
              allowFontScaling={false}
              style={{
                fontSize: timeSize,
                ...(active ? FONTS.bold : FONTS.semibold),
                ...(active ? { color: look.onAccent } : ink(look, past ? look.faded : look.text)),
                marginTop: compact || stacked ? 1 : 3,
              }}
            />
          </FlexWidget>
        );
      })}
    </FlexWidget>
  );

  if (stacked) {
    return (
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 'match_parent',
          flexDirection: 'column',
          justifyContent: 'space-between',
          paddingHorizontal: padH - 4,
          paddingVertical: padV,
        }}
      >
        <FlexWidget
          style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}
        >
          {caption}
          {countdown}
          <FlexWidget style={{ flex: 1, alignItems: 'flex-end', paddingLeft: 8 }}>
            <TextWidget
              text={`${placeName} · ${isToday ? '' : 'Yarın · '}${parts.dayMonth}`}
              maxLines={1}
              truncate="END"
              allowFontScaling={false}
              style={{ fontSize: 11, ...FONTS.medium, ...ink(look, look.muted) }}
            />
          </FlexWidget>
        </FlexWidget>
        {columns}
      </FlexWidget>
    );
  }

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: padH,
        paddingVertical: padV,
      }}
    >
      <FlexWidget style={{ width: infoWidth, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center' }}>
        {caption}
        {countdown}
        {compact ? (
          <FlexWidget style={{ width: 0, height: 0 }} />
        ) : (
          <TextWidget
            text={`${placeName} · ${isToday ? '' : 'Yarın · '}${parts.dayMonth}`}
            maxLines={1}
            truncate="END"
            allowFontScaling={false}
            style={{ fontSize: 11, ...FONTS.medium, ...ink(look, look.muted), marginTop: 2 }}
          />
        )}
      </FlexWidget>

      <FlexWidget
        style={{
          width: 1,
          height: Math.max(16, inner - (compact ? 8 : 20)),
          marginHorizontal: 10,
          backgroundColor: look.chip,
        }}
      />

      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>{columns}</FlexWidget>
    </FlexWidget>
  );
}

function Content({
  look,
  placeName,
  day,
  nextKey,
  nextAt,
  now,
  isToday,
  preview,
}: {
  look: WidgetLook;
  placeName: string;
  day: DayTimes;
  nextKey: PrayerKey;
  nextAt: Date;
  now: Date;
  isToday: boolean;
  preview: boolean;
}) {
  const parts = dayPartsTr(day.date);
  const msLeft = nextAt.getTime() - now.getTime();
  const stage = countdownStage(msLeft);
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TextWidget
          text={placeName}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, ...FONTS.semibold, ...ink(look, look.text) }}
        />
        <TextWidget
          text={`${isToday ? '' : 'Yarın · '}${parts.dayMonth} · ${day.hijri}`}
          maxLines={1}
          style={{ fontSize: 12, ...FONTS.regular, ...ink(look, look.muted) }}
        />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', alignItems: 'center' }}>
        <TextWidget
          text={`${PRAYER_NAMES_TR[nextKey]} vaktine kalan`}
          style={{ fontSize: 12, ...FONTS.medium, ...ink(look, look.muted) }}
        />
        {/* Yer tutucu; üstüne Android'in kendi işlettiği canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns) */}
        <TextWidget
          {...countdownProps(nextAt, msLeft, preview)}
          maxLines={1}
          style={{
            fontSize: stage === 'urgent' ? 32 : 26,
            ...FONTS.bold,
            ...(stage === 'normal' ? ink(look, look.accent) : { color: STAGE_COLORS[stage] }),
            textAlign: 'center',
          }}
        />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
        {PRAYER_KEYS.map((key) => {
          const active = key === nextKey;
          return (
            <FlexWidget
              key={key}
              style={{
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                paddingVertical: 6,
                borderRadius: 12,
                backgroundColor: active ? look.chip : 'rgba(0, 0, 0, 0)',
              }}
            >
              <TextWidget
                text={PRAYER_NAMES_TR[key]}
                maxLines={1}
                style={{
                  fontSize: 11,
                  ...(active ? FONTS.bold : FONTS.medium),
                  ...ink(look, active ? look.accent : look.muted),
                }}
              />
              <TextWidget
                text={day.times[key]}
                maxLines={1}
                style={{
                  fontSize: 14,
                  ...(active ? FONTS.bold : FONTS.semibold),
                  ...ink(look, active ? look.accent : look.text),
                  marginTop: 2,
                }}
              />
            </FlexWidget>
          );
        })}
      </FlexWidget>
    </FlexWidget>
  );
}
