import React from 'react';
import { StyleSheet, Text as RNText, TextProps, TextStyle } from 'react-native';
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

/** App.tsx'te useFonts ile yüklenir. */
export const APP_FONTS = {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
};

const FAMILY_BY_WEIGHT: Record<string, keyof typeof APP_FONTS> = {
  '100': 'Inter_300Light',
  '200': 'Inter_300Light',
  '300': 'Inter_300Light',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
};

/**
 * Tüm yazılar bununla çizilir; react-native'in Text'ini doğrudan kullanma.
 *
 * Android'de Xiaomi/Oppo/OnePlus/Samsung gibi üreticiler sistem fontunu kendi
 * fontlarıyla değiştirir. RN yazı genişliğini farklı metrikle ölçüp üretici
 * fontuyla çizince kutu dar kalır ve son harf/kelime kırpılır (özellikle kalın
 * yazıda). Uygulamaya gömülü font ölçüm ve çizimin aynı fontla yapılmasını
 * sağlar; ağırlık ayrı font dosyasıyla verilir ki Android üstüne sahte kalınlık
 * eklemesin. textBreakStrategy="simple" de highQuality modunun ölçüm hatasını önler.
 */
export default function Text({ style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontOverride: TextStyle = flat.fontFamily
    ? {}
    : { fontFamily: FAMILY_BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? 'Inter_400Regular', fontWeight: 'normal' };
  return <RNText textBreakStrategy="simple" {...rest} style={[style, fontOverride]} />;
}
