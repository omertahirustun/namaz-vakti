import React, { useEffect, useMemo } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { APP_FONTS } from './src/components/AppText';
import { PrayerProvider } from './src/PrayerContext';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import HomeScreen from './src/screens/HomeScreen';
import MosquesScreen from './src/screens/MosquesScreen';
import QiblaScreen from './src/screens/QiblaScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

SplashScreen.preventAutoHideAsync().catch(() => {});

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, IconName> = {
  Vakitler: 'time-outline',
  Kıble: 'compass-outline',
  Ayarlar: 'settings-outline',
};

export default function App() {
  // Font yüklenemese de uygulama sistem fontuyla açılsın
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  const fontsReady = fontsLoaded || !!fontError;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <PrayerProvider>
          <AppShell fontsReady={fontsReady} />
        </PrayerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppShell({ fontsReady }: { fontsReady: boolean }) {
  const { theme, ready: themeReady } = useTheme();
  // Hem font hem kayıtlı tema okunana kadar splash ekranı açık kalsın; aksi
  // halde önce varsayılan renklerle çizip sonra temaya göre "flaş" yapardık.
  const ready = fontsReady && themeReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      fonts: {
        regular: { fontFamily: 'Inter_400Regular', fontWeight: 'normal' as const },
        medium: { fontFamily: 'Inter_500Medium', fontWeight: 'normal' as const },
        bold: { fontFamily: 'Inter_700Bold', fontWeight: 'normal' as const },
        heavy: { fontFamily: 'Inter_800ExtraBold', fontWeight: 'normal' as const },
      },
      colors: {
        ...DefaultTheme.colors,
        // Fotoğraflı temalarda arka plan görünsün diye şeffaf; varsayılanda düz renk.
        background: theme.background ? 'transparent' : theme.colors.bg,
        card: theme.colors.card,
        border: theme.colors.border,
        primary: theme.colors.accent,
      },
    }),
    [theme],
  );

  if (!ready) return null;

  const content = (
    <>
      <StatusBar style={theme.statusBar} />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.muted,
          tabBarStyle: { backgroundColor: theme.colors.card, borderTopColor: theme.colors.border },
          tabBarIcon: ({ color, size }) =>
            // Ionicons'ta cami ikonu yok
            route.name === 'Camiler' ? (
              <MaterialCommunityIcons name="mosque-outline" size={size} color={color} />
            ) : (
              <Ionicons name={ICONS[route.name]} size={size} color={color} />
            ),
        })}
      >
        <Tab.Screen name="Vakitler" component={HomeScreen} />
        <Tab.Screen name="Kıble" component={QiblaScreen} />
        <Tab.Screen name="Camiler" component={MosquesScreen} />
        <Tab.Screen name="Ayarlar" component={SettingsScreen} />
      </Tab.Navigator>
    </>
  );

  // NavigationContainer her temada ağaçta aynı yerde kalmalı. Eskiden fotoğraflı temada
  // ImageBackground'un içine sarılıp varsayılan temada doğrudan dönülüyordu; tema değişince React onu yeni
  // bileşen sayıp yeniden kuruyor, navigasyon sıfırlanıp Vakitler sekmesine atıyordu.
  return (
    <View style={styles.root}>
      {theme.background ? (
        <>
          <ImageBackground source={theme.background} style={styles.overlay} resizeMode="cover" />
          <View style={[styles.overlay, { backgroundColor: theme.overlay ?? 'rgba(0,0,0,0.45)' }]} />
        </>
      ) : null}
      <NavigationContainer theme={navTheme}>{content}</NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: StyleSheet.absoluteFillObject,
});
