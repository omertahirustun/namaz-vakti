import React from 'react';
import { FlexWidget, ImageWidget, OverlapWidget, TextWidget } from 'react-native-android-widget';
import type { ColorProp, ImageWidgetSource } from 'react-native-android-widget';
import { getTwoMonths } from '../api';
import { loadPlace, loadSettings, loadThemeId } from '../storage';
import { ThemeId } from '../theme';
import { countdownStage, dateKey, dayPartsTr, findNext } from '../time';
import { DayTimes, PRAYER_KEYS, PRAYER_NAMES_TR, PrayerKey } from '../types';
import { countdownFormat, STAGE_COLORS } from './countdown';

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
  placeName: string;
  days: DayTimes[];
}

interface WidgetLook {
  /** Fotoğraflı temalarda koyu örtüsü gömülü yatay görsel (assets/widget) */
  image?: ImageWidgetSource;
  /** 6x2 yatay şerit widget için aynı fotoğrafın daha geniş kesiti */
  wideImage?: ImageWidgetSource;
  gradient?: [ColorProp, ColorProp];
  text: ColorProp;
  muted: ColorProp;
  accent: ColorProp;
  /** Sıradaki vaktin sütun arka planı */
  chip: ColorProp;
}

// Widget kütüphanesi renkleri yalnız "#RRGGBB" ya da "rgba(r, g, b, a)" (virgülden sonra boşluklu) kabul ediyor;
// bu yüzden theme.ts'teki renklerin widget'a uygun kopyaları burada.
const LOOKS: Record<ThemeId, WidgetLook> = {
  default: {
    gradient: ['#3A55C8', '#1B2D82'],
    text: '#FFFFFF',
    muted: 'rgba(255, 255, 255, 0.82)',
    accent: '#FFFFFF',
    chip: 'rgba(255, 255, 255, 0.24)',
  },
  mecca: {
    image: require('../../assets/widget/mecca.jpg'),
    wideImage: require('../../assets/widget/mecca-wide.jpg'),
    text: '#F6EFE2',
    muted: '#C7B89C',
    accent: '#D8AF68',
    chip: 'rgba(216, 175, 104, 0.28)',
  },
  medina: {
    image: require('../../assets/widget/medina.jpg'),
    wideImage: require('../../assets/widget/medina-wide.jpg'),
    text: '#F3EFE2',
    muted: '#C9D2C0',
    accent: '#9CCB9F',
    chip: 'rgba(127, 184, 133, 0.32)',
  },
  aqsa: {
    image: require('../../assets/widget/aqsa.jpg'),
    wideImage: require('../../assets/widget/aqsa-wide.jpg'),
    text: '#F4F1E6',
    muted: '#C9D2E6',
    accent: '#E3BC5A',
    chip: 'rgba(227, 188, 90, 0.28)',
  },
};

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
    return { themeId, placeName: place.name, days };
  } catch {
    return null;
  }
}

interface WidgetProps {
  data: WidgetData | null;
  width: number;
  height: number;
  now?: Date;
}

/** Adına göre doğru widget'ı çizer (görev işleyicisi ve uygulama içi güncelleme aynı yolu kullanır). */
export function renderPrayerWidget(name: string, props: WidgetProps) {
  if (name === 'PrayerCountdown') return <CountdownWidget {...props} />;
  if (name === 'PrayerStrip') return <StripWidget {...props} />;
  return <PrayerWidget {...props} />;
}

/** Temanın fotoğrafı ya da degradesi üstünde içerik; dokununca uygulamayı açar. */
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
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 'match_parent',
            borderRadius: radius,
            backgroundGradient: { from: look.gradient![0], to: look.gradient![1], orientation: 'TL_BR' },
          }}
        />
      )}
      {children}
    </OverlapWidget>
  );
}

/** 4x2: konum, tarih, sıradaki vakte canlı geri sayım ve günün vakitleri */
export function PrayerWidget({ data, width, height, now = new Date() }: WidgetProps) {
  const look = LOOKS[data?.themeId ?? 'default'];
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
        />
      ) : (
        <FlexWidget
          style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 16 }}
        >
          <TextWidget
            text="Vakitleri görmek için uygulamayı aç"
            style={{ fontSize: 15, ...FONTS.semibold, color: look.text, textAlign: 'center' }}
          />
        </FlexWidget>
      )}
    </Frame>
  );
}

// 1x1 widget arka plansız; yazılar her duvar kâğıdında okunsun diye beyaz + gölgeli
const ON_WALLPAPER = {
  color: '#FFFFFF',
  textShadowColor: 'rgba(0, 0, 0, 0.6)',
  textShadowRadius: 4,
  textShadowOffset: { width: 0, height: 1 },
} as const;

/**
 * 1x1, şeffaf: sıradaki vaktin adı ("Yatsıya") ve altında saat:dakika geri sayım ("02:36").
 * Kutu küçük olduğu için yazılar sistem yazı boyutundan etkilenmez (allowFontScaling=false).
 */
export function CountdownWidget({ data, width, now = new Date() }: WidgetProps) {
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
            style={{ fontSize: 13, ...FONTS.semibold, ...ON_WALLPAPER }}
          />,
          // Yer tutucu; üstüne canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns)
          <TextWidget
            key="countdown"
            text="00:00"
            countdownTo={next.at.getTime()}
            countdownFormat={countdownFormat(msLeft)}
            maxLines={1}
            allowFontScaling={false}
            style={{
              fontSize: countdownSize,
              ...FONTS.bold,
              // Kırmızı aşamalarda gölgesiz düz renk (yama gölgesiz Chronometer'ı seçer)
              ...(stage === 'normal' ? ON_WALLPAPER : { color: STAGE_COLORS[stage] }),
              textAlign: 'center',
            }}
          />,
        ]
      ) : (
        <TextWidget
          text="Uygulamayı aç"
          allowFontScaling={false}
          style={{ fontSize: 11, ...FONTS.semibold, ...ON_WALLPAPER, textAlign: 'center' }}
        />
      )}
    </FlexWidget>
  );
}

/**
 * 6x2 yatay şerit: solda konum, sıradaki vakte canlı geri sayım ve tarih; sağda yan yana günün altı vakti.
 * Hücreler dar olduğu için yazılar sistem yazı boyutundan etkilenmez.
 */
export function StripWidget({ data, width, height, now = new Date() }: WidgetProps) {
  const look = LOOKS[data?.themeId ?? 'default'];
  const next = data ? findNext(data.days, now) : null;
  const shownDate = next ? dateKey(next.at) : dateKey(now);
  const day = data?.days.find((d) => d.date === shownDate);

  return (
    <Frame look={look} width={width} height={height} radius={RADIUS} wide>
      {day && next ? (
        <StripContent
          look={look}
          width={width}
          placeName={data!.placeName}
          day={day}
          nextKey={next.key}
          nextAt={next.at}
          now={now}
          isToday={shownDate === dateKey(now)}
        />
      ) : (
        <FlexWidget
          style={{ width: 'match_parent', height: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 12 }}
        >
          <TextWidget
            text="Vakitleri görmek için uygulamayı aç"
            allowFontScaling={false}
            style={{ fontSize: 14, ...FONTS.semibold, color: look.text, textAlign: 'center' }}
          />
        </FlexWidget>
      )}
    </Frame>
  );
}

function StripContent({
  look,
  width,
  placeName,
  day,
  nextKey,
  nextAt,
  now,
  isToday,
}: {
  look: WidgetLook;
  width: number;
  placeName: string;
  day: DayTimes;
  nextKey: PrayerKey;
  nextAt: Date;
  now: Date;
  isToday: boolean;
}) {
  const parts = dayPartsTr(day.date);
  const msLeft = nextAt.getTime() - now.getTime();
  const stage = countdownStage(msLeft);
  // Sol blok genişliğin ~%28'i; sayaç ona sığacak boya küçülür (OEM'lerin geniş fontunda son hane kırpılmasın)
  const infoWidth = Math.round(width * 0.28);
  const fitSize = Math.floor((infoWidth - 8) / 3.3);
  const countdownSize = Math.max(16, Math.min(stage === 'urgent' ? 32 : 28, fitSize));
  // 4 sütunlu ekranlarda şerit daralınca vakit sütunu ~35dp'ye iner; "05:52" kalın ~2.7 em, "İkindi" ~3 em
  const columnWidth = (width - 24 - infoWidth) / 6;
  const timeSize = Math.max(10, Math.min(14, Math.floor(columnWidth / 2.9)));
  const nameSize = Math.max(9, Math.min(11, Math.floor(columnWidth / 3.4)));
  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <FlexWidget style={{ width: infoWidth, flexDirection: 'column', alignItems: 'flex-start' }}>
        <TextWidget
          text={placeName}
          maxLines={1}
          truncate="END"
          allowFontScaling={false}
          style={{ fontSize: 13, ...FONTS.semibold, color: look.text }}
        />
        <TextWidget
          text={`${PRAYER_TO_TR[nextKey]} kalan`}
          maxLines={1}
          allowFontScaling={false}
          style={{ fontSize: 11, ...FONTS.medium, color: look.muted, marginTop: 4 }}
        />
        {/* Yer tutucu; üstüne canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns) */}
        <TextWidget
          text="00:00"
          countdownTo={nextAt.getTime()}
          countdownFormat={countdownFormat(msLeft)}
          maxLines={1}
          allowFontScaling={false}
          style={{
            fontSize: countdownSize,
            ...FONTS.bold,
            color: stage === 'normal' ? look.accent : STAGE_COLORS[stage],
          }}
        />
        <TextWidget
          text={`${isToday ? '' : 'Yarın · '}${parts.dayMonth}`}
          maxLines={1}
          allowFontScaling={false}
          style={{ fontSize: 11, ...FONTS.regular, color: look.muted, marginTop: 2 }}
        />
      </FlexWidget>

      <FlexWidget style={{ flex: 1, height: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        {PRAYER_KEYS.map((key) => {
          const active = key === nextKey;
          return (
            <FlexWidget
              key={key}
              style={{
                flex: 1,
                flexDirection: 'column',
                alignItems: 'center',
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: active ? look.chip : 'rgba(0, 0, 0, 0)',
              }}
            >
              <TextWidget
                text={PRAYER_NAMES_TR[key]}
                maxLines={1}
                allowFontScaling={false}
                style={{
                  fontSize: nameSize,
                  ...(active ? FONTS.bold : FONTS.medium),
                  color: active ? look.accent : look.muted,
                }}
              />
              <TextWidget
                text={day.times[key]}
                maxLines={1}
                allowFontScaling={false}
                style={{
                  fontSize: timeSize,
                  ...(active ? FONTS.bold : FONTS.semibold),
                  color: active ? look.accent : look.text,
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

function Content({
  look,
  placeName,
  day,
  nextKey,
  nextAt,
  now,
  isToday,
}: {
  look: WidgetLook;
  placeName: string;
  day: DayTimes;
  nextKey: PrayerKey;
  nextAt: Date;
  now: Date;
  isToday: boolean;
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
          style={{ fontSize: 13, ...FONTS.semibold, color: look.text }}
        />
        <TextWidget
          text={`${isToday ? '' : 'Yarın · '}${parts.dayMonth} · ${day.hijri}`}
          maxLines={1}
          style={{ fontSize: 12, ...FONTS.regular, color: look.muted }}
        />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', alignItems: 'center' }}>
        <TextWidget
          text={`${PRAYER_NAMES_TR[nextKey]} vaktine kalan`}
          style={{ fontSize: 12, ...FONTS.medium, color: look.muted }}
        />
        {/* Yer tutucu; üstüne Android'in kendi işlettiği canlı geri sayım çizilir (kütüphane yaması, RNWidget.addCountdowns) */}
        <TextWidget
          text="00:00:00"
          countdownTo={nextAt.getTime()}
          countdownFormat={countdownFormat(msLeft)}
          maxLines={1}
          style={{
            fontSize: stage === 'urgent' ? 32 : 26,
            ...FONTS.bold,
            color: stage === 'normal' ? look.accent : STAGE_COLORS[stage],
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
                  color: active ? look.accent : look.muted,
                }}
              />
              <TextWidget
                text={day.times[key]}
                maxLines={1}
                style={{
                  fontSize: 14,
                  ...(active ? FONTS.bold : FONTS.semibold),
                  color: active ? look.accent : look.text,
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

