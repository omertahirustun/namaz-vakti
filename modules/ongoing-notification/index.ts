import { requireOptionalNativeModule } from 'expo';

interface OngoingNotificationNative {
  /** daysJson: [{ prayers: [{ at: epoch ms, name, time } × 6] }] artan sırada; enabled=false bildirimi kaldırır */
  sync(enabled: boolean, place: string, daysJson: string): void;
  /** Telefonun varsayılan bildirim sesini çalar (Ayarlar'daki "Dinle"); ses bulunamazsa false */
  playDefaultNotificationSound(): boolean;
  stopPreviewSound(): void;
}

// Yalnız Android derlemesinde var (Expo Go'da ve iOS'ta null; çağıranlar sessizce geçer).
export default requireOptionalNativeModule<OngoingNotificationNative>('OngoingNotification');
