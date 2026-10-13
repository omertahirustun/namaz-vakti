import { requireOptionalNativeModule } from 'expo';

interface OngoingNotificationNative {
  /** daysJson: [{ prayers: [{ at: epoch ms, name, time } × 6] }] artan sırada; enabled=false bildirimi kaldırır */
  sync(enabled: boolean, place: string, daysJson: string): void;
}

// Yalnız Android derlemesinde var (Expo Go'da ve iOS'ta null; çağıranlar sessizce geçer).
export default requireOptionalNativeModule<OngoingNotificationNative>('OngoingNotification');
