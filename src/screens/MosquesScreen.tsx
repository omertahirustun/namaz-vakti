import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, TouchableOpacity, View } from 'react-native';
import Text from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getCurrentCoords } from '../location';
import { directionName, findNearbyMosques, formatDistance, loadCachedMosques, Mosque, openInMaps } from '../mosques';
import { useTheme } from '../ThemeContext';
import { radius, ThemeColors } from '../theme';

type Status = 'loading' | 'ready' | 'denied' | 'noLocation' | 'error';
type Mode = 'list' | 'map';
type Coords = { latitude: number; longitude: number };

// MapLibre native modül; Expo Go'da yok ve içe aktarılınca uygulama çöker. Yalnız gerçek
// derlemede yüklenir ki diğer ekranlar Expo Go'da denenebilsin.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const MosqueMap: typeof import('../components/MosqueMap').default | null = isExpoGo
  ? null
  : require('../components/MosqueMap').default;

export default function MosquesScreen() {
  const { theme } = useTheme();
  const { colors } = theme;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [mosques, setMosques] = useState<Mosque[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [mode, setMode] = useState<Mode>('list');
  const loadId = useRef(0);

  // Vakitler için kayıtlı şehir yeterli ama cami için birkaç yüz metre bile önemli:
  // her aramada taze konum alınır. Önce son aramanın sonucu anında gösterilir,
  // sonra internetten güncellenir; güncelleme başarısızsa eldeki liste korunur.
  // Dönüş değeri: internetten güncelleme başarılı mı.
  const load = useCallback(async (): Promise<boolean> => {
    const id = ++loadId.current;
    try {
      let coords: Awaited<ReturnType<typeof getCurrentCoords>>;
      try {
        coords = await getCurrentCoords();
      } catch {
        // İzin var ama GPS/ağ konumu gelmedi (kapalı alan, konum servisi kapalı)
        if (id === loadId.current) setStatus((s) => (s === 'ready' ? s : 'noLocation'));
        return false;
      }
      if (id !== loadId.current) return true;
      if (!coords) {
        setStatus('denied');
        return true;
      }
      setOrigin(coords);
      const cached = await loadCachedMosques(coords.latitude, coords.longitude);
      if (id !== loadId.current) return true;
      if (cached) {
        setMosques(cached);
        setStatus('ready');
      }
      const list = await findNearbyMosques(coords.latitude, coords.longitude);
      if (id !== loadId.current) return true;
      setMosques(list);
      setStatus('ready');
      return true;
    } catch {
      if (id === loadId.current) setStatus((s) => (s === 'ready' ? s : 'error'));
      return false;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    const ok = await load();
    setRefreshing(false);
    if (!ok) Alert.alert('Güncellenemedi', 'Konumunu ve internet bağlantını kontrol edip tekrar dene.');
  };

  const retry = () => {
    setStatus('loading');
    load();
  };

  const renderItem = ({ item }: { item: Mosque }) => (
    <TouchableOpacity style={styles.card} onPress={() => openInMaps(item).catch(() => {})} activeOpacity={0.75}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="mosque" size={22} color={colors.accent} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name ?? 'İsimsiz cami'}
        </Text>
        <Text style={styles.meta}>
          {formatDistance(item.distance)} · {directionName(item.bearing)}
        </Text>
      </View>
      <Ionicons name="navigate-outline" size={20} color={colors.muted} />
    </TouchableOpacity>
  );

  // Fotoğraflı temalarda yazı doğrudan fotoğrafın üstünde okunmuyor; kart içinde göster.
  const statusBox = (icon: React.ReactNode, message: string, withRetry: boolean) => (
    <View style={styles.center}>
      <View style={styles.statusCard}>
        {icon}
        <Text style={styles.centerText}>{message}</Text>
        {withRetry ? (
          <TouchableOpacity onPress={retry}>
            <Text style={styles.link}>Tekrar dene</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (status === 'loading') {
    body = statusBox(<ActivityIndicator color={colors.accent} />, 'Yakındaki camiler aranıyor…', false);
  } else if (status === 'denied') {
    body = statusBox(
      <Ionicons name="location-outline" size={36} color={colors.muted} />,
      'Yakındaki camileri bulmak için konum izni gerekli.',
      true,
    );
  } else if (status === 'noLocation') {
    body = statusBox(
      <Ionicons name="location-outline" size={36} color={colors.muted} />,
      'Konumun alınamadı. Konum servisinin açık olduğundan emin ol.',
      true,
    );
  } else if (status === 'error') {
    body = statusBox(
      <Ionicons name="cloud-offline-outline" size={36} color={colors.muted} />,
      'Camiler alınamadı. İnternet bağlantını kontrol et.',
      true,
    );
  } else if (mode === 'map') {
    body =
      MosqueMap && origin ? (
        <MosqueMap
          mosques={mosques}
          origin={origin}
          colors={colors}
          onDirections={(m) => openInMaps(m).catch(() => {})}
        />
      ) : (
        statusBox(
          <Ionicons name="map-outline" size={36} color={colors.muted} />,
          'Harita Expo Go\'da çalışmaz; uygulamanın APK sürümünde görünür.',
          false,
        )
      );
  } else {
    body = (
      <FlatList
        data={mosques}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.statusCard}>
            <Text style={styles.centerText}>10 km içinde kayıtlı cami bulunamadı.</Text>
          </View>
        }
        ListFooterComponent={
          <Text style={styles.footer}>
            Cami bilgileri © OpenStreetMap katkıcıları. Haritada açmak için camiye dokun.
          </Text>
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>Yakındaki Camiler</Text>
      {status === 'ready' ? (
        <View style={styles.segment}>
          {(
            [
              ['list', 'Liste', 'list-outline'],
              ['map', 'Harita', 'map-outline'],
            ] as const
          ).map(([value, label, icon]) => {
            const active = mode === value;
            return (
              <TouchableOpacity
                key={value}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setMode(value)}
                activeOpacity={0.8}
              >
                <Ionicons name={icon} size={16} color={active ? colors.onAccent : colors.muted} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {body}
    </SafeAreaView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    title: { color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 12, marginBottom: 8, paddingHorizontal: 20 },
    segment: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 10,
      padding: 3,
      borderRadius: 22,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 19 },
    segmentItemActive: { backgroundColor: colors.accent },
    segmentText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
    segmentTextActive: { color: colors.onAccent, fontWeight: '700' },
    list: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40, gap: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cardAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: '600' },
    meta: { color: colors.muted, fontSize: 13, marginTop: 3 },
    center: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    statusCard: {
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    centerText: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
    link: { color: colors.accent, fontWeight: '600', paddingVertical: 8 },
    footer: { color: colors.muted, fontSize: 11, marginTop: 16, lineHeight: 16, textAlign: 'center' },
  });
}
