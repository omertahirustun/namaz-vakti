import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { needsExactAlarmSetting, openBatterySettings, openExactAlarmSettings } from '../notifications';
import { usePrayer } from '../PrayerContext';
import { colors, radius } from '../theme';
import { CALC_METHODS, PRAYER_KEYS, PRAYER_NAMES_TR } from '../types';

const OFFSETS = [0, 5, 10, 15, 20, 30];

export default function SettingsScreen() {
  const { settings, updateSettings, place, locateMe } = usePrayer();

  const onLocate = async () => {
    try {
      const ok = await locateMe();
      if (!ok) Alert.alert('Konum izni gerekli', 'Telefon ayarlarından konum iznini açıp tekrar dene.');
    } catch {
      Alert.alert('Konum alınamadı', 'Biraz sonra tekrar dene.');
    }
  };

  const openSetting = async (open: () => Promise<void>) => {
    try {
      await open();
    } catch {
      Alert.alert('Ayar açılamadı', 'Telefon ayarlarından uygulamayı bulup elle açabilirsin.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ayarlar</Text>

        <Text style={styles.section}>Konum</Text>
        <TouchableOpacity style={styles.card} onPress={onLocate}>
          <View style={styles.rowInner}>
            <Ionicons name="location-sharp" size={20} color={colors.accent} />
            <Text style={styles.label}>{place.name}</Text>
          </View>
          <Text style={styles.link}>Konumumu kullan</Text>
        </TouchableOpacity>

        <Text style={styles.section}>Bildirimler</Text>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.label}>Vakit bildirimleri</Text>
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={(v) => updateSettings({ notificationsEnabled: v })}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor={colors.card}
            />
          </View>
        </View>

        {settings.notificationsEnabled ? (
          <>
            <View style={styles.card}>
              {PRAYER_KEYS.map((k, i) => (
                <View key={k} style={[styles.rowBetween, i > 0 && styles.sep]}>
                  <Text style={styles.label}>{PRAYER_NAMES_TR[k]}</Text>
                  <Switch
                    value={settings.enabled[k]}
                    onValueChange={(v) => updateSettings((prev) => ({ enabled: { ...prev.enabled, [k]: v } }))}
                    trackColor={{ true: colors.accent, false: colors.border }}
                    thumbColor={colors.card}
                  />
                </View>
              ))}
            </View>

            <Text style={styles.subsection}>Ne zaman haber verilsin?</Text>
            <View style={styles.chips}>
              {OFFSETS.map((m) => {
                const active = settings.offsetMinutes === m;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => updateSettings({ offsetMinutes: m })}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {m === 0 ? 'Vaktinde' : `${m} dk önce`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {needsExactAlarmSetting ? (
              <>
                <Text style={styles.subsection}>Bildirimlerin tam vaktinde gelmesi için</Text>
                <View style={styles.card}>
                  <TouchableOpacity style={styles.rowBetween} onPress={() => openSetting(openExactAlarmSettings)}>
                    <View style={styles.rowText}>
                      <Text style={styles.label}>Alarmlar ve hatırlatıcılar</Text>
                      <Text style={styles.hint}>Kapalıysa bildirimler gecikebilir. Açık olduğundan emin ol.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.rowBetween, styles.sep]} onPress={() => openSetting(openBatterySettings)}>
                    <View style={styles.rowText}>
                      <Text style={styles.label}>Pil optimizasyonu</Text>
                      <Text style={styles.hint}>Bazı telefonlarda uygulamayı "Kısıtlama yok" yapman gerekir.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </>
        ) : null}

        <Text style={styles.section}>Hesaplama yöntemi</Text>
        <View style={styles.card}>
          {CALC_METHODS.map((m, i) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.rowBetween, i > 0 && styles.sep]}
              onPress={() => updateSettings({ method: m.id })}
            >
              <Text style={styles.label}>{m.label}</Text>
              {settings.method === m.id ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.footer}>Vakitler Aladhan API ile hesaplanır. İnternet yokken önbellekteki aylar gösterilir.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 50 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  section: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 24, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  subsection: { color: colors.muted, fontSize: 13, marginTop: 14, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { color: colors.text, fontSize: 16 },
  rowText: { flex: 1, paddingRight: 8 },
  hint: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  link: { color: colors.accent, paddingVertical: 10, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextActive: { color: colors.onAccent, fontWeight: '700' },
  footer: { color: colors.muted, fontSize: 12, marginTop: 24, lineHeight: 18 },
});
