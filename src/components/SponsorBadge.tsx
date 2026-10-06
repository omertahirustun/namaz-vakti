import React from 'react';
import { Image, StyleSheet } from 'react-native';

// Yazı logosunun en/boy oranı (assets/sponsor/adezyon-medya-white*.png, "Adezyon_Logo r.pdf"den beyaz/şeffaf üretildi)
const ASPECT = 8.14;

/** Sponsor (Adezyon Medya) logosu: Vakitler'deki geri sayım kartının altında, çerçevesiz beyaz; dokunulmaz. */
export default function SponsorBadge() {
  return (
    <Image
      source={require('../../assets/sponsor/adezyon-medya-white.png')}
      style={styles.logo}
      resizeMode="contain"
      accessibilityLabel="Sponsor: Adezyon Medya"
    />
  );
}

const styles = StyleSheet.create({
  logo: { width: Math.round(18 * ASPECT), height: 18, marginTop: 16, opacity: 0.95 },
});
