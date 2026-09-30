import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { APP_FONTS } from './src/components/AppText';
import { PrayerProvider } from './src/PrayerContext';
import HomeScreen from './src/screens/HomeScreen';
import QiblaScreen from './src/screens/QiblaScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

SplashScreen.preventAutoHideAsync().catch(() => {});

const navTheme = {
  ...DefaultTheme,
  fonts: {
    regular: { fontFamily: 'Inter_400Regular', fontWeight: 'normal' as const },
    medium: { fontFamily: 'Inter_500Medium', fontWeight: 'normal' as const },
    bold: { fontFamily: 'Inter_700Bold', fontWeight: 'normal' as const },
    heavy: { fontFamily: 'Inter_800ExtraBold', fontWeight: 'normal' as const },
  },
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.card, border: colors.border, primary: colors.accent },
};

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const ICONS: Record<string, IconName> = {
  Vakitler: 'time-outline',
  Kıble: 'compass-outline',
  Ayarlar: 'settings-outline',
};

export default function App() {
  // Font yüklenemese de uygulama sistem fontuyla açılsın
  const [fontsLoaded, fontError] = useFonts(APP_FONTS);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PrayerProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="dark" />
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: colors.accent,
              tabBarInactiveTintColor: colors.muted,
              tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
              tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} />,
            })}
          >
            <Tab.Screen name="Vakitler" component={HomeScreen} />
            <Tab.Screen name="Kıble" component={QiblaScreen} />
            <Tab.Screen name="Ayarlar" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      </PrayerProvider>
    </SafeAreaProvider>
  );
}
