import { requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

export interface CompassHeading {
  /** Gerçek kuzeye göre yön (0–360°), yerelde süzülmüş */
  heading: number;
  /** 0 güvenilmez, 1 düşük, 2 orta, 3 yüksek (manyetometre kalibrasyonu) */
  accuracy: number;
  /** Tahmini yön hatası (±derece); bilinmiyorsa -1 ya da 0 (Android'de bazı cihazlar bildirmez) */
  accuracyDeg: number;
}

interface CompassNative {
  isAvailable(): boolean;
  start(latitude: number, longitude: number): void;
  stop(): void;
  addListener(event: 'onHeading', listener: (e: CompassHeading) => void): EventSubscription;
}

// Expo Go'da yok; Kıble ekranı o zaman expo-location'ın yön verisine düşer (iOS: ios/CompassModule.swift).
export default requireOptionalNativeModule<CompassNative>('Compass');
