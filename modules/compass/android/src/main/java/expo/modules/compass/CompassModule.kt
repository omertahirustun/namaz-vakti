package expo.modules.compass

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Kıble pusulası.
 *
 * Telefonun duruşu (eğim + dönüş) jiroskoplu GAME_ROTATION_VECTOR'dan gelir: gecikmesiz, el titremesinden
 * etkilenmez, ama kuzeyi bilmez (kendi keyfi sıfırı vardır). Manyetometre ölçümü bu duruşla yatay düzleme
 * çevrilip "jiroskop dünyasında manyetik kuzey nerede" (northAz) bulunur. northAz telefon dönse de sabit
 * kalması gereken tek bir açıdır, bu yüzden güçlü süzülür; yön = jiroskop yönü − northAz.
 *
 * Camide hoparlör, avize, betondaki demir manyetik alanı bozar. Her ölçümün şiddeti ve eğim (dip) açısı
 * konumda beklenen değerle (GeomagneticField) karşılaştırılır; bozuk ölçümler northAz'a katılmaz, yönü
 * son temiz northAz ile jiroskop taşır (jiroskop kayması için doğruluk zamanla düşürülür).
 *
 * Eskiden üreticinin füzyon sensörü (ROTATION_VECTOR) ya da ivmeölçer + manyetometre doğrudan kullanılıyordu;
 * ilki bazı telefonlarda 15–20° kayıyor, ikincisi elde tutarken ivmeölçerin gecikmesiyle sapıyordu.
 * Jiroskopsuz telefonlarda ivmeölçer + manyetometreye düşülür.
 */
class CompassModule : Module(), SensorEventListener {
  private val sensorManager: SensorManager?
    get() = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private var registered = false
  private var declination = 0f
  /** Konumda beklenen manyetik alan şiddeti (µT) ve eğim açısı (derece, aşağı doğru pozitif) */
  private var expectedField = 0f
  private var expectedDip = 0f
  /** Manyetometre kalibrasyon durumu (SensorManager.SENSOR_STATUS_*) */
  private var accuracy = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM
  private var fieldStrength = 0f

  private val gameRot = FloatArray(9)
  private var hasGameRot = false
  private val rotation = FloatArray(9)
  private var gravity: FloatArray? = null
  private var geomagnetic: FloatArray? = null
  /** Telefon dik tutulunca (ekran kullanıcıya dönük) yön, arka kameranın baktığı yöne göre hesaplanır */
  private var upright = false

  private var hasGyro = false
  /** Son jiroskop yönü (derece, jiroskobun sıfırına göre) ve önceki manyetometre ölçümündeki değeri */
  private var gyroAz = 0.0
  private var gyroAzAtLastMag: Double? = null

  // Jiroskop dünyasında manyetik kuzeyin süzülmüş sin/cos'u
  private var nSin = 0.0
  private var nCos = 0.0
  private var hasNorth = false
  /** Şimdiye kadar en az bir temiz (bozulmamış alan) ölçüm alındı mı */
  private var hasCleanNorth = false
  private var lastCleanAt = 0L
  private var disturbed = false

  // Çıktı açısının sin/cos'u üstel olarak süzülür (0/360 sarmasında sıçramasın)
  private var fSin = 0.0
  private var fCos = 0.0
  private var hasValue = false
  private var lastEmit = 0L

  override fun definition() = ModuleDefinition {
    Name("Compass")
    Events("onHeading")

    Function("isAvailable") {
      val sm = sensorManager ?: return@Function false
      sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null && sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null
    }

    Function("start") { latitude: Double, longitude: Double ->
      val field = GeomagneticField(latitude.toFloat(), longitude.toFloat(), 0f, System.currentTimeMillis())
      declination = field.declination
      expectedField = field.fieldStrength / 1000f // nT → µT
      expectedDip = field.inclination
      register()
    }

    Function("stop") { unregister() }

    OnStopObserving { unregister() }
    OnDestroy { unregister() }
  }

  private fun register() {
    if (registered) return
    val sm = sensorManager ?: return
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
    val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) ?: return
    val game = sm.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
    hasGyro = game != null
    if (game != null) {
      sm.registerListener(this, game, SensorManager.SENSOR_DELAY_GAME)
    } else {
      sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME)
    }
    sm.registerListener(this, mag, SensorManager.SENSOR_DELAY_GAME)
    hasValue = false
    hasNorth = false
    hasCleanNorth = false
    disturbed = false
    hasGameRot = false
    gyroAzAtLastMag = null
    gravity = null
    geomagnetic = null
    fieldStrength = 0f
    registered = true
  }

  private fun unregister() {
    if (!registered) return
    sensorManager?.unregisterListener(this)
    registered = false
  }

  override fun onAccuracyChanged(sensor: Sensor, newAccuracy: Int) {
    if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) accuracy = newAccuracy
  }

  override fun onSensorChanged(event: SensorEvent) {
    when (event.sensor.type) {
      Sensor.TYPE_GAME_ROTATION_VECTOR -> {
        SensorManager.getRotationMatrixFromVector(gameRot, event.values)
        hasGameRot = true
        gyroAz = azimuth(gameRot)
        if (hasNorth) emit(gyroAz - Math.toDegrees(atan2(nSin, nCos)), 0.35)
      }
      Sensor.TYPE_MAGNETIC_FIELD -> {
        val v = event.values
        val strength = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        fieldStrength = if (fieldStrength == 0f) strength else fieldStrength + 0.1f * (strength - fieldStrength)
        if (hasGyro) onMagneticWithGyro(v, strength) else onMagneticRaw(v)
      }
      Sensor.TYPE_ACCELEROMETER -> gravity = lowPass(event.values, gravity)
    }
  }

  /** Manyetometre ölçümünü jiroskobun duruşuyla dünya eksenlerine çevirip manyetik kuzeyin yerini günceller. */
  private fun onMagneticWithGyro(v: FloatArray, strength: Float) {
    if (!hasGameRot) return
    val r = gameRot
    val wx = r[0] * v[0] + r[1] * v[1] + r[2] * v[2]
    val wy = r[3] * v[0] + r[4] * v[1] + r[5] * v[2]
    val wz = r[6] * v[0] + r[7] * v[1] + r[8] * v[2]
    val horizontal = sqrt(wx * wx + wy * wy)
    if (horizontal < 1f) return
    val north = atan2(wx.toDouble(), wy.toDouble())
    val dip = Math.toDegrees(atan2(-wz.toDouble(), horizontal.toDouble()))

    // Hızlı dönüşte manyetometre ile jiroskop örneği aynı anı göstermez; o ölçümleri atla
    val prevGyro = gyroAzAtLastMag
    gyroAzAtLastMag = gyroAz
    val turning = prevGyro != null && abs(angleDiff(gyroAz, prevGyro)) > 2.0

    val clean = expectedField <= 0f ||
      (strength / expectedField in 0.85f..1.15f && abs(dip - expectedDip) <= 8.0)
    disturbed = !clean

    if (!hasNorth) {
      nSin = sin(north)
      nCos = cos(north)
      hasNorth = true
      if (clean) markClean()
      return
    }
    if (turning) return
    if (clean) {
      // İlk temiz ölçüm bozuk başlangıcı hemen düzeltir; sonrası ~1,5 sn'lik süzgeç
      val alpha = if (!hasCleanNorth) 1.0 else 0.02
      nSin += alpha * (sin(north) - nSin)
      nCos += alpha * (cos(north) - nCos)
      markClean()
    } else if (!hasCleanNorth) {
      // Hiç temiz ölçüm yoksa elde olanla devam (doğruluk düşük bildirilir)
      nSin += 0.02 * (sin(north) - nSin)
      nCos += 0.02 * (cos(north) - nCos)
    }
    // Temiz referans varken bozuk ölçüm: northAz dondurulur, yönü jiroskop taşır
  }

  private fun markClean() {
    hasCleanNorth = true
    lastCleanAt = SystemClock.uptimeMillis()
  }

  /** Jiroskopsuz telefonlar: ivmeölçer + manyetometre. */
  private fun onMagneticRaw(v: FloatArray) {
    geomagnetic = lowPass(v, geomagnetic)
    val g = gravity ?: return
    if (!SensorManager.getRotationMatrix(rotation, null, g, geomagnetic)) return
    emit(azimuth(rotation), 0.1)
  }

  /**
   * Dönüş matrisinden (cihaz → dünya) yön, derece. Telefon yatıkken üst kenarın, dikken arka kameranın
   * (cihazın −Z ekseni) yatay düzlemdeki yönü; r[8] ekran normalinin dikey bileşeni, kip histerezisle seçilir.
   */
  private fun azimuth(r: FloatArray): Double {
    val z = abs(r[8])
    if (upright && z > 0.6f) upright = false else if (!upright && z < 0.4f) upright = true
    return if (upright) {
      Math.toDegrees(atan2(-r[2].toDouble(), -r[5].toDouble()))
    } else {
      Math.toDegrees(atan2(r[1].toDouble(), r[4].toDouble()))
    }
  }

  private fun emit(magneticDeg: Double, alpha: Double) {
    val rad = Math.toRadians(magneticDeg + declination)
    if (!hasValue) {
      fSin = sin(rad)
      fCos = cos(rad)
      hasValue = true
    } else {
      fSin += alpha * (sin(rad) - fSin)
      fCos += alpha * (cos(rad) - fCos)
    }

    // ~60 Hz'den sık JS'e göndermeye gerek yok
    val now = SystemClock.uptimeMillis()
    if (now - lastEmit < 16) return
    lastEmit = now
    val out = (Math.toDegrees(atan2(fSin, fCos)) + 360.0) % 360.0
    val deg = accuracyDegrees(now)
    sendEvent(
      "onHeading",
      mapOf(
        "heading" to out,
        "accuracy" to accuracyLevel(deg),
        "accuracyDeg" to deg,
      ),
    )
  }

  /**
   * Tahmini yön hatası (±derece). Manyetik kuzey ölçümlerinin dağınıklığından (süzülmüş birim vektörün
   * boyu kısaldıkça dağınık), son temiz ölçümden beri geçen süreden (jiroskop kayması ~12°/dk) ve
   * manyetometrenin kendi kalibrasyon durumundan çıkarılır.
   */
  private fun accuracyDegrees(now: Long): Double {
    if (!hasGyro) {
      return when {
        accuracy >= SensorManager.SENSOR_STATUS_ACCURACY_HIGH && !fieldOff() -> 10.0
        accuracy >= SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM && !fieldOff() -> 18.0
        else -> 30.0
      }
    }
    if (!hasCleanNorth) return 30.0
    val len = sqrt(nSin * nSin + nCos * nCos).coerceIn(1e-6, 1.0)
    val spread = Math.toDegrees(sqrt(-2.0 * ln(len)))
    var deg = maxOf(3.0, spread * 2)
    if (disturbed) deg += (now - lastCleanAt) / 1000.0 * 0.2
    if (accuracy <= SensorManager.SENSOR_STATUS_ACCURACY_LOW) deg = maxOf(deg, 25.0)
    return deg
  }

  private fun fieldOff(): Boolean {
    if (expectedField <= 0f || fieldStrength <= 0f) return false
    val ratio = fieldStrength / expectedField
    return ratio < 0.85f || ratio > 1.15f
  }

  /** ±derece → JS'in beklediği 0–3 düzeyi */
  private fun accuracyLevel(deg: Double): Int = when {
    deg <= 10 -> 3
    deg <= 20 -> 2
    deg <= 35 -> 1
    else -> 0
  }

  private fun angleDiff(a: Double, b: Double): Double = ((a - b + 540.0) % 360.0) - 180.0

  private fun lowPass(input: FloatArray, prev: FloatArray?): FloatArray {
    if (prev == null) return input.copyOf(3)
    for (i in 0 until 3) prev[i] += 0.15f * (input[i] - prev[i])
    return prev
  }
}
