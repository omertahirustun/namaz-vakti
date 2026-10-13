import { registerRootComponent } from 'expo';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import App from './App';
import { registerBackgroundRefresh } from './src/backgroundRefresh';

registerRootComponent(App);

// iOS: bildirim planı ve widget verisi uygulama açılmasa da tazelensin (src/backgroundRefresh.ts)
registerBackgroundRefresh();

// Ana ekran widget'ı (yalnız Android derlemesi; Expo Go'da widget native modülü yok)
if (Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/taskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
