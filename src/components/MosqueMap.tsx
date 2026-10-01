import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Camera, GeoJSONSource, Images, Layer, Map, NativeUserLocation } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './AppText';
import { directionName, formatDistance, Mosque } from '../mosques';
import { radius, ThemeColors } from '../theme';

// OpenFreeMap: OpenStreetMap tabanlı, ücretsiz, anahtarsız vektör harita. Atıf haritanın
// köşesindeki (i) düğmesinde (OpenFreeMap, OpenMapTiles, OpenStreetMap). Temadan bağımsız
// hep klasik aydınlık stil.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
// Cami simgeli iğneler (assets/map, MaterialCommunityIcons "mosque" glyph'inden üretildi)
const PIN_IMAGES = {
  'mosque-pin': require('../../assets/map/mosque-pin.png'),
  'mosque-pin-selected': require('../../assets/map/mosque-pin-selected.png'),
};
/** ~2 km çevreyi gösterir; arama yarıçapıyla aynı. */
const INITIAL_ZOOM = 14;

interface Props {
  mosques: Mosque[];
  origin: { latitude: number; longitude: number };
  colors: ThemeColors;
  onDirections: (m: Mosque) => void;
}

export default function MosqueMap({ mosques, origin, colors, onDirections }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = mosques.find((m) => m.id === selectedId) ?? null;

  // İşaretçiler haritanın kendi katmanı olarak çizilir. ViewAnnotation (React görünümünü resme
  // çevirip koyan yol) Android'de boş beyaz daire olarak çıktı; katman hem sağlam hem hızlı.
  const geojson = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point, { id: string }>>(
    () => ({
      type: 'FeatureCollection',
      features: mosques.map((m) => ({
        type: 'Feature',
        id: m.id,
        properties: { id: m.id },
        geometry: { type: 'Point', coordinates: [m.longitude, m.latitude] },
      })),
    }),
    [mosques],
  );

  return (
    <View style={styles.root}>
      <Map
        style={styles.map}
        // Varsayılan SurfaceView, yuvarlak köşeli/kırpılmış kabın içinde ve üstüne yarı saydam
        // görünüm binince bazı cihazlarda titriyor; TextureView normal görünüm gibi çizilir.
        androidView="texture"
        mapStyle={MAP_STYLE}
        logo={false}
        attributionPosition={{ top: 8, right: 8 }}
        compass
        compassPosition={{ top: 48, right: 8 }}
        touchPitch={false}
        onPress={() => setSelectedId(null)}
      >
        <Camera initialViewState={{ center: [origin.longitude, origin.latitude], zoom: INITIAL_ZOOM }} />
        <NativeUserLocation />
        <Images images={PIN_IMAGES} />
        <GeoJSONSource
          id="mosques"
          data={geojson}
          onPress={(e) => {
            // Haritanın kendi onPress'i (seçimi kaldırır) tetiklenmesin
            e.stopPropagation();
            const id = e.nativeEvent.features[0]?.properties?.id;
            if (typeof id === 'string') setSelectedId(id);
          }}
        >
          <Layer
            id="mosque-pins"
            type="symbol"
            layout={{
              'icon-image': 'mosque-pin',
              'icon-anchor': 'bottom',
              // Yakın camiler üst üste binse de hepsi görünsün
              'icon-allow-overlap': true,
            }}
          />
          <Layer
            id="mosque-pin-selected"
            type="symbol"
            filter={['==', ['get', 'id'], selectedId ?? '']}
            layout={{
              'icon-image': 'mosque-pin-selected',
              'icon-anchor': 'bottom',
              'icon-size': 1.3,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </GeoJSONSource>
      </Map>

      {selected ? (
        <View style={styles.sheet}>
          <View style={styles.sheetInfo}>
            <Text style={styles.name} numberOfLines={2}>
              {selected.name ?? 'İsimsiz cami'}
            </Text>
            <Text style={styles.meta}>
              {formatDistance(selected.distance)} · {directionName(selected.bearing)}
            </Text>
          </View>
          <TouchableOpacity style={styles.button} onPress={() => onDirections(selected)} activeOpacity={0.8}>
            <Ionicons name="navigate" size={16} color={colors.onAccent} />
            <Text style={styles.buttonText}>Yol tarifi</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hint}>Ayrıntı için bir camiye dokun</Text>
        </View>
      )}
    </View>
  );
}

/** Fotoğraflı temalarda kart rengi yarı saydam (rgba); haritanın üstünde okunur olsun diye opak yapar. */
function opaque(color: string): string {
  const m = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/);
  return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : color;
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, marginHorizontal: 20, marginBottom: 12, borderRadius: radius, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    map: { flex: 1 },
    sheet: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: opaque(colors.card),
      borderRadius: radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    sheetInfo: { flex: 1 },
    name: { color: colors.text, fontSize: 16, fontWeight: '600' },
    meta: { color: colors.muted, fontSize: 13, marginTop: 3 },
    button: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
    buttonText: { color: colors.onAccent, fontWeight: '700', fontSize: 14 },
    hintWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
    hint: {
      color: '#FFFFFF',
      fontSize: 12,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      overflow: 'hidden',
    },
  });
}
