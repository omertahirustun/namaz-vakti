import CoreLocation
import ExpoModulesCore

/**
 * Kıble pusulası, Android'deki CompassModule.kt ile aynı arayüz (isAvailable / start / stop / onHeading).
 * iOS'un yön verisi zaten jiroskopla birleştirilmiş ve gerçek kuzeye göredir (trueHeading); burada
 * Android'deki gibi sin/cos üzerinden yumuşatılıp ~60 Hz'de JS'e gönderilir. Telefon dik tutulunca da
 * iOS yönü kendisi düzeltir.
 */
public class CompassModule: Module {
  private var manager: CLLocationManager?
  private var delegate: HeadingDelegate?

  public func definition() -> ModuleDefinition {
    Name("Compass")
    Events("onHeading")

    Function("isAvailable") { () -> Bool in
      CLLocationManager.headingAvailable()
    }

    Function("start") { (_: Double, _: Double) in
      // Sapma açısını iOS kendisi uygular (trueHeading); konum yalnız bunun için gerekir
      DispatchQueue.main.async { self.startUpdates() }
    }

    Function("stop") {
      DispatchQueue.main.async { self.stopUpdates() }
    }

    OnStopObserving { DispatchQueue.main.async { self.stopUpdates() } }
    OnDestroy { DispatchQueue.main.async { self.stopUpdates() } }
  }

  private func startUpdates() {
    guard manager == nil, CLLocationManager.headingAvailable() else { return }
    let m = CLLocationManager()
    let d = HeadingDelegate { [weak self] heading, accuracy, accuracyDeg in
      self?.sendEvent("onHeading", ["heading": heading, "accuracy": accuracy, "accuracyDeg": accuracyDeg])
    }
    m.delegate = d
    m.headingFilter = kCLHeadingFilterNone
    m.headingOrientation = .portrait
    m.desiredAccuracy = kCLLocationAccuracyKilometer
    // trueHeading yalnız konum güncellemeleri de açıkken geçerli
    m.startUpdatingLocation()
    m.startUpdatingHeading()
    manager = m
    delegate = d
  }

  private func stopUpdates() {
    manager?.stopUpdatingHeading()
    manager?.stopUpdatingLocation()
    manager?.delegate = nil
    manager = nil
    delegate = nil
  }
}

private class HeadingDelegate: NSObject, CLLocationManagerDelegate {
  private let onHeading: (Double, Int, Double) -> Void
  private var fSin = 0.0
  private var fCos = 0.0
  private var hasValue = false
  private var lastEmit: TimeInterval = 0

  init(onHeading: @escaping (Double, Int, Double) -> Void) {
    self.onHeading = onHeading
  }

  func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
    let raw = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
    let rad = raw * .pi / 180
    // iOS yönü zaten süzülmüş geliyor; Android'deki füzyon kipiyle aynı hafif süzgeç
    let alpha = 0.3
    if !hasValue {
      fSin = sin(rad)
      fCos = cos(rad)
      hasValue = true
    } else {
      fSin += alpha * (sin(rad) - fSin)
      fCos += alpha * (cos(rad) - fCos)
    }
    let now = ProcessInfo.processInfo.systemUptime
    if now - lastEmit < 0.016 { return }
    lastEmit = now
    var heading = atan2(fSin, fCos) * 180 / .pi
    if heading < 0 { heading += 360 }
    onHeading(heading, Self.accuracyLevel(newHeading.headingAccuracy), newHeading.headingAccuracy)
  }

  /// Sapma derecesini Android'in kalibrasyon düzeyine çevirir: 0 güvenilmez … 3 yüksek.
  /// Kıble için 15° bile fazla (eskiden 30°'ye kadar "orta" sayılıyor, uyarı hiç çıkmıyordu).
  static func accuracyLevel(_ degrees: CLLocationDirection) -> Int {
    if degrees < 0 { return 0 }
    if degrees <= 10 { return 3 }
    if degrees <= 20 { return 2 }
    if degrees <= 35 { return 1 }
    return 0
  }

  func locationManagerShouldDisplayHeadingCalibration(_ manager: CLLocationManager) -> Bool {
    // Kalibrasyon uyarısını Kıble ekranı kendisi gösterir
    false
  }
}
