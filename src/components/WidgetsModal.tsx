import React, { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { requestPinWidget, WidgetPreview } from 'react-native-android-widget';
import Text from './AppText';
import { usePrayer } from '../PrayerContext';
import { useTheme } from '../ThemeContext';
import { radius, ThemeColors } from '../theme';
import { WIDGET_STYLES, WidgetStyle } from '../types';
import { renderPrayerWidget, WidgetName } from '../widget/PrayerWidget';

/** Önizlenen widget türleri; boyutlar ana ekrandaki tipik dp ölçüleri */
const KINDS: { name: WidgetName; label: string; size: (w: number) => { width: number; height: number } }[] = [
  { name: 'PrayerStrip', label: 'Vakit Şeridi', size: (w) => ({ width: w, height: 112 }) },
  { name: 'PrayerTimes', label: 'Namaz Vakitleri', size: (w) => ({ width: w, height: 190 }) },
  { name: 'PrayerCountdown', label: 'Vakte Kalan', size: () => ({ width: 84, height: 84 }) },
];

const STYLE_HINTS: Record<WidgetStyle, string> = {
  theme: 'Uygulamanın seçili teması',
  transparent: 'Duvar kâğıdının üstünde, zeminsiz',
  gray: 'Koyu gri zemin',
  black: 'Siyah zemin',
  white: 'Beyaz zemin',
};

/** Seçicideki renk örnekleri (PrayerWidget.tsx STYLE_LOOKS zeminleri) */
const SWATCHES: Record<Exclude<WidgetStyle, 'theme'>, string> = {
  transparent: 'transparent',
  gray: '#3A3D44',
  black: '#0B0B0D',
  white: '#FFFFFF',
};

/** Önizlemenin arkasındaki örnek duvar kâğıdı: şeffaf görünüm de seçilebilsin diye renkli */
const WALLPAPER = ['#4B5D8F', '#2A2F52', '#1A1C2C'] as const;

/**
 * Widget ayarları: üstte seçili görünümle canlı önizleme, altta görünüm seçimi.
 * Seçim hemen kaydedilir; ana ekrandaki widget'lar da WidgetSync ile aynı anda yeniden çizilir. Yalnız Android.
 */
export default function WidgetsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, themeId } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { settings, updateSettings, place, days } = usePrayer();
  const { width: screenWidth } = useWindowDimensions();
  const [kindIndex, setKindIndex] = useState(0);
  const kind = KINDS[kindIndex];

  const previewWidth = screenWidth - 40 - 2 * 16;
  const { width, height } = kind.size(previewWidth);
  const data = days.length ? { themeId, widgetStyle: settings.widgetStyle, placeName: place.name, days } : null;

  const pin = async () => {
    try {
      const ok = await requestPinWidget({ widgetName: kind.name });
      if (!ok) throw new Error();
    } catch {
      Alert.alert(
        'Eklenemedi',
        "Ana ekranda boş bir yere basılı tut, Widget'lar'dan Haydi Namaza'yı seçip istediğini sürükle.",
      );
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Geri">
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Widget'lar</Text>
          </View>

          <LinearGradient colors={WALLPAPER} style={styles.wallpaper}>
            {data ? (
              <WidgetPreview
                // Görünüm ya da tür değişince önizleme yeniden oluşturulsun
                key={`${kind.name}-${settings.widgetStyle}-${themeId}`}
                renderWidget={() => renderPrayerWidget(kind.name, { data, width, height, preview: true })}
                width={width}
                height={height}
              />
            ) : (
              <Text style={styles.wallpaperText}>Vakitler yükleniyor…</Text>
            )}
          </LinearGradient>

          <View style={styles.kinds}>
            {KINDS.map((k, i) => {
              const active = i === kindIndex;
              return (
                <TouchableOpacity
                  key={k.name}
                  onPress={() => setKindIndex(i)}
                  style={[styles.kind, active && styles.kindActive]}
                >
                  <Text style={[styles.kindText, active && styles.kindTextActive]} numberOfLines={1}>
                    {k.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.section}>Görünüm</Text>
            <View style={styles.card}>
              {WIDGET_STYLES.map((w, i) => {
                const active = settings.widgetStyle === w.id;
                return (
                  <TouchableOpacity
                    key={w.id}
                    style={[styles.row, i > 0 && styles.sep]}
                    onPress={() => updateSettings({ widgetStyle: w.id })}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: w.id === 'theme' ? colors.accent : SWATCHES[w.id] },
                        w.id === 'transparent' && styles.swatchEmpty,
                      ]}
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.label}>{w.label}</Text>
                      <Text style={styles.hint}>{STYLE_HINTS[w.id]}</Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.pinButton} onPress={pin} activeOpacity={0.85}>
              <Ionicons name="add-circle-outline" size={20} color={colors.onAccent} />
              <Text style={styles.pinText}>{kind.label} ana ekrana ekle</Text>
            </TouchableOpacity>
            <Text style={styles.footer}>
              Görünüm tüm widget'lara birlikte uygulanır. "Tema"da widget uygulamanın seçili temasını kullanır.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.solidAlt },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    title: { color: colors.text, fontSize: 22, fontWeight: '700' },
    wallpaper: {
      marginHorizontal: 20,
      borderRadius: radius + 8,
      padding: 16,
      minHeight: 222,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wallpaperText: { color: '#FFFFFF', fontSize: 14 },
    kinds: { flexDirection: 'row', gap: 8, marginHorizontal: 20, marginTop: 12 },
    kind: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.solid,
      alignItems: 'center',
    },
    kindActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    kindText: { color: colors.text, fontSize: 13 },
    kindTextActive: { color: colors.onAccent, fontWeight: '700' },
    content: { padding: 20, paddingBottom: 40 },
    section: { color: colors.accent, fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    card: { backgroundColor: colors.solid, borderRadius: radius, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
    sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowText: { flex: 1 },
    label: { color: colors.text, fontSize: 16 },
    hint: { color: colors.muted, fontSize: 12, marginTop: 2 },
    // Açık zeminli örnekler de seçilsin diye kenarlı; şeffaf örnek kesik kenarlı boş daire
    swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
    swatchEmpty: { borderStyle: 'dashed', borderColor: colors.muted },
    pinButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 16,
      paddingVertical: 14,
      borderRadius: radius,
      backgroundColor: colors.accent,
    },
    pinText: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
    footer: { color: colors.muted, fontSize: 12, marginTop: 14, lineHeight: 18 },
  });
}
