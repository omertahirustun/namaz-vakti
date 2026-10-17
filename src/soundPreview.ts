import { AudioPlayer, AudioSource, createAudioPlayer } from 'expo-audio';
import { Platform } from 'react-native';
import OngoingNotification from '../modules/ongoing-notification';
import { NotificationSound } from './types';

/**
 * Ayarlar'daki "Dinle": seçilen bildirim sesini bildirim göndermeden doğrudan çalar. Dosyalar bildirim kanallarının
 * kullandığı dosyalarla aynı (app.json expo-notifications "sounds"). Telefonun varsayılan bildirim sesi dosya olarak
 * okunamıyor (Android 14+); yerel modülde Ringtone ile çalınır. iOS'ta o sese erişim yok.
 */
const SOURCES: Record<Exclude<NotificationSound, 'system'>, AudioSource> = {
  ezan: require('../assets/sounds/ezan.wav'),
  zil: require('../assets/sounds/vakit.wav'),
};

let player: AudioPlayer | null = null;

function release() {
  player?.remove();
  player = null;
  OngoingNotification?.stopPreviewSound();
}

/** Çalıyorsa önceki sesi keser; ses yoksa (iOS'ta telefonun sesi) false döner. */
export function playSoundPreview(sound: NotificationSound): boolean {
  release();
  if (sound === 'system') {
    return Platform.OS === 'android' && !!OngoingNotification?.playDefaultNotificationSound();
  }
  const p = createAudioPlayer(SOURCES[sound]);
  player = p;
  p.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish && player === p) release();
  });
  p.play();
  return true;
}

export function stopSoundPreview(): void {
  release();
}
