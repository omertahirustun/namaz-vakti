import React from 'react';
import { Image, StyleSheet } from 'react-native';

// Yazı logosunun en/boy oranı (assets/sponsor/adezyon-medya-white*.png, "Adezyon_Logo r.pdf"den beyaz/şeffaf üretildi)
const ASPECT = 8.14;
const HEIGHT = 12;

/**
 * Sponsor (Adezyon Medya) logosu: Vakitler'deki geri sayım kartının altında, kartın dışında; dokunulmaz.
 * Logo beyaz/şeffaf olduğu için temanın yazı rengine boyanır (açık zeminde de okunsun).
 */
export default function SponsorBadge({ color }: { color: string }) {
  return (
    <Image
      source={require('../../assets/sponsor/adezyon-medya-white.png')}
      style={[styles.logo, { tintColor: color }]}
      resizeMode="contain"
      accessibilityLabel="Sponsor: Adezyon Medya"
    />
  );
}

const styles = StyleSheet.create({
  logo: { width: Math.round(HEIGHT * ASPECT), height: HEIGHT, alignSelf: 'center', marginTop: 10, opacity: 0.8 },
});
