import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';
import { getTwoMonths } from '../api';
import { loadPlace, loadSettings, loadThemeId } from '../storage';
import { ThemeId } from '../theme';
import { countdownStage, dateKey, dayPartsTr, findCurrent, findNext } from '../time';
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

/** Ayarlardan seçilen, temadan bağımsız widget görünümleri; düz renkler yarı şeffaf (duvar kâğıdı hafif görünür) */
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
    background: 'rgba(58, 61, 68, 0.6)',
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.7)',
    faded: 'rgba(255, 255, 255, 0.4)',
    accent: '#FFD27A',
    onAccent: '#2B2108',
    chip: 'rgba(255, 255, 255, 0.12)',
  },
  black: {
    background: 'rgba(11, 11, 13, 0.5)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.66)',
    faded: 'rgba(255, 255, 255, 0.36)',
    accent: '#F2C46B',
    onAccent: '#1E1606',
    chip: 'rgba(255, 255, 255, 0.1)',
  },
  white: {
    // Beyazda koyu yazı açık duvar kâğıdında da okunsun diye biraz daha opak
    background: 'rgba(255, 255, 255, 0.7)',
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
 * 6x2 yatay şerit: solda sıradaki vakte kalan süre ("Akşama kalan" + canlı sayaç), ince dikey çizgi, sağda günün
 * altı vakti. Geçmiş vakitler soluk, gelecekler açık renk, içinde bulunulan vakit dolu bir yuvarlağın içinde.
 * Yatsıdan sonra gece yarısına kadar bugünün vakitleri kalır (Yatsı yuvarlakta).
 * Hücreler dar olduğu için yazılar sistem yazı boyutundan etkilenmez.
 */
export function StripWidget({ data, width, height, now = new Date(), preview = false }: WidgetProps) {
  const look = lookFor(data);
  const next = data ? findNext(data.days, now) : null;
  const current = data ? findCurrent(data.days, now) : null;
  const day = data?.days.find((d) => d.date === dateKey(now));
  // İçinde bulunulan vakit bugüne aitse yuvarlak içinde (gece yarısından sonra imsaka kadar dünün yatsısıdır)
  const currentKey = current && dateKey(current.at) === dateKey(now) ? current.key : null;

  return (
    <Frame look={look} width={width} height={height} radius={RADIUS} wide>
      {day && next ? (
        <StripContent
          look={look}
          width={width}
          height={height}
          day={day}
          nextKey={next.key}
          nextAt={next.at}
          currentKey={currentKey}
          now={now}
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
  day,
  nextKey,
  nextAt,
  currentKey,
  now,
  preview,
}: {
  look: WidgetLook;
  width: number;
  height: number;
  day: DayTimes;
  nextKey: PrayerKey;
  nextAt: Date;
  currentKey: PrayerKey | null;
  now: Date;
  preview: boolean;
}) {
  const msLeft = nextAt.getTime() - now.getTime();
  const stage = countdownStage(msLeft);
  const currentIndex = currentKey ? PRAYER_KEYS.indexOf(currentKey) : -1;

  const padH = 12;
  const padV = height < 96 ? 6 : 10;
  const inner = height - 2 * padV;
  // Sol blok genişliğin ~%27'si, sonra ince çizgi (iki yanında 10 dp boşluk)
  const infoWidth = Math.round(width * 0.27);
  const DIVIDER = 1 + 2 * 10;
  const columnWidth = (width - 2 * padH - infoWidth - DIVIDER) / 6;
  // Yuvarlak: sütuna ve yüksekliğe sığan en büyük daire; vakit adı ve saati içine sığacak boyda
  // ("05:52" kalın ~2.7 em, "İkindi" ~3 em; dairenin iç genişliği çapın ~%80'i)
  const circle = Math.floor(Math.min(columnWidth - 2, inner));
  const timeSize = clamp(9, 15, Math.min(Math.floor((circle * 0.8) / 2.9), Math.floor(circle / 2.7)));
  const nameSize = clamp(8, 11, timeSize - 3);

  // "02:36" kalın ~2.7 em, 3.3 OEM'lerin geniş fontuna pay bırakır (son hane kırpılmasın)
  const countdownSize = clamp(
    14,
    stage === 'urgent' ? 34 : 30,
    Math.min(Math.floor((infoWidth - 6) / 3.3), Math.floor((inner - 16) / 1.25)),
  );

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
        <TextWidget
          text={`${PRAYER_TO_TR[nextKey]} kalan`}
          maxLines={1}
          allowFontScaling={false}
          style={{ fontSize: 11, ...FONTS.semibold, ...ink(look, look.muted) }}
        />
        {/* Yer tutucu; üstüne canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns) */}
        <TextWidget
          {...countdownProps(nextAt, msLeft, preview)}
          maxLines={1}
          allowFontScaling={false}
          style={{
            fontSize: countdownSize,
            ...FONTS.bold,
            ...(stage === 'normal' ? ink(look, look.text) : { color: STAGE_COLORS[stage] }),
          }}
        />
      </FlexWidget>

      <FlexWidget style={{ width: 1, height: Math.round(inner * 0.7), marginHorizontal: 10, backgroundColor: look.faded }} />

      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        {PRAYER_KEYS.map((key, i) => {
          const active = i === currentIndex;
          const past = i < currentIndex;
          const color = active ? look.onAccent : past ? look.faded : look.text;
          return (
            <FlexWidget key={key} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <FlexWidget
                style={{
                  width: circle,
                  height: circle,
                  borderRadius: circle / 2,
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
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
                    ...(active ? { color } : ink(look, color)),
                  }}
                />
                <TextWidget
                  text={day.times[key]}
                  maxLines={1}
                  allowFontScaling={false}
                  style={{
                    fontSize: timeSize,
                    ...FONTS.bold,
                    ...(active ? { color } : ink(look, color)),
                  }}
                />
              </FlexWidget>
            </FlexWidget>
          );
        })}
      </FlexWidget>
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
