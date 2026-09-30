# Namaz Vakti

React Native + Expo (TypeScript) namaz vakti uygulaması.

## Özellikler
- Açılışta otomatik konum (ilçe, il); konum alınamazsa son bilinen/kayıtlı yer
- Konuma göre günlük 6 vakit + bir sonraki vakte canlı geri sayım
- Haftalık vakitler (bugün kutular, sonraki 6 gün tablo)
- Günün ayeti (Diyanet meali), günün hadisi (Nevevi 40 Hadis), tarihte bugün (Vikipedi)
- Kıble pusulası (cihaz yön sensörü)
- Vakit bildirimleri (vaktinde veya 5–30 dk önce, vakit bazında aç/kapat); Android'de 30 gün, iOS'ta ~12 gün önceden planlanır
- Hesaplama yöntemi seçimi (varsayılan: Diyanet)
- Aylar önbelleğe alınır; internet yokken de çalışır

## Çalıştırma
```bash
npm install
npx expo install --fix   # paket sürümlerini kurulu Expo SDK'ya uydurur
npx expo start
```
Telefonda Expo Go ile QR'ı okut.

Not: Bildirimler ve kıble için gerçek cihaz önerilir. Android'de Expo Go bildirim kısıtları
varsa `npx expo run:android` ile development build al.

## APK / Play Store (EAS)
```bash
npx eas-cli login
npx eas-cli build -p android --profile preview      # telefona kurulacak APK
npx eas-cli build -p android --profile production   # Play Store için AAB
```
Bildirimlerin tam vaktinde gelmesi için Android 14+'da "Alarmlar ve hatırlatıcılar" izni
gerekir (varsayılan kapalı); Ayarlar ekranındaki kısayol bu sayfayı açar. İzin yoksa
Android bildirimi 1 saate kadar geciktirebilir.

## Yapı
- `App.tsx` — sekmeli navigasyon
- `src/PrayerContext.tsx` — yer, ayarlar, vakit verisi
- `src/api.ts` — Aladhan API + önbellek
- `src/daily.ts`, `src/components/DailySection.tsx` — günlük içerik
- `src/notifications.ts` — yerel bildirim planlama (en fazla 60 adet)
- `src/location.ts` — konum ve kıble açısı
- `src/screens/` — Vakitler (haftalık), Kıble, Ayarlar

## Widget
Ana ekran widget'ı dahil değil; native kod gerektirir (iOS WidgetKit / Android App Widget)
ve Expo Go'da çalışmaz. Development build ile ayrı bir adım olarak eklenebilir.
