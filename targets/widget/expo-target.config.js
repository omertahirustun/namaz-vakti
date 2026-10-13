/** iOS ana ekran / kilit ekranı widget'ları (WidgetKit). Android karşılığı: src/widget/PrayerWidget.tsx */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'PrayerWidgets',
  displayName: 'Haydi Namaza',
  deploymentTarget: '17.0',
  colors: {
    $accent: '#243AA2',
    $widgetBackground: '#1B2D82',
  },
  // Temaların fotoğrafları (koyu örtüsü gömülü, Android widget'ıyla aynı dosyalar)
  images: {
    mecca: '../../assets/widget/mecca.jpg',
    medina: '../../assets/widget/medina.jpg',
    aqsa: '../../assets/widget/aqsa.jpg',
    meccaWide: '../../assets/widget/mecca-wide.jpg',
    medinaWide: '../../assets/widget/medina-wide.jpg',
    aqsaWide: '../../assets/widget/aqsa-wide.jpg',
  },
  // Uygulama vakitleri, temayı ve konumu bu ortak alana yazar (src/widget/iosWidget.ts)
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
