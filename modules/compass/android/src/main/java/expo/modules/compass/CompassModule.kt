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
import kotlin.math.sin

/**
 * Kıble pusulası. expo-location'ın yön verisi yalnız manyetometre + ivmeölçerden gelir, seyrek ve
 * gürültülüdür. Burada Android'in jiroskopla birleştirilmiş ROTATION_VECTOR sensörü kullanılır (yoksa
 * GEOMAGNETIC_ROTATION_VECTOR, o da yoksa ivmeölçer + manyetometre): hızlı, akıcı ve titremesiz.
 * Manyetik kuzey, konumun sapma açısıyla (GeomagneticField) gerçek kuzeye çevrilir.
 */
class CompassModule : Module(), SensorEventListener {
  private val sensorManager: SensorManager?
    get() = appContext.reactContext?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

  private var registered = false
  private var mode = Mode.NONE
  private var declination = 0f
  /** Manyetometre kalibrasyon durumu (SensorManager.SENSOR_STATUS_*) */
  private var accuracy = SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM
  /**
   * Füzyon sensörünün kendi tahmini yön hatası (derece, values[4]); bildirmeyen (ya da 0 gönderen) cihazlarda -1.
   * Manyetometrenin durum düzeyi kaba kalıyor (15–20° saparken "yüksek" diyen cihazlar var), bu daha dürüst.
   */
  private var accuracyDeg = -1.0

  private val rotation = FloatArray(9)
  private val remapped = FloatArray(9)
  private val orientation = FloatArray(3)
  private var gravity: FloatArray? = null
  private var geomagnetic: FloatArray? = null
  /** Telefon dik tutulunca (ekran kullanıcıya dönük) yön, arka kameranın baktığı yöne göre hesaplanır */
  private var upright = false

  // Açının sin/cos'u üstel olarak süzülür (0/360 sarmasında sıçramasın)
  private var fSin = 0.0
  private var fCos = 0.0
  private var hasValue = false
  private var lastEmit = 0L

  private enum class Mode { NONE, FUSED, GEOMAGNETIC, RAW }

  override fun definition() = ModuleDefinition {
    Name("Compass")
    Events("onHeading")

    Function("isAvailable") {
      val sm = sensorManager ?: return@Function false
      sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null ||
        sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR) != null ||
        (sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null && sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null)
    }

    Function("start") { latitude: Double, longitude: Double ->
      declination = GeomagneticField(latitude.toFloat(), longitude.toFloat(), 0f, System.currentTimeMillis()).declination
      register()
    }

    Function("stop") { unregister() }

    OnStopObserving { unregister() }
    OnDestroy { unregister() }
  }

  private fun register() {
    if (registered) return
    val sm = sensorManager ?: return
    val fused = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    val geo = sm.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
    val accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    val mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    mode = when {
      fused != null -> Mode.FUSED
      geo != null -> Mode.GEOMAGNETIC
      accel != null && mag != null -> Mode.RAW
      else -> return
    }
    when (mode) {
      Mode.FUSED -> sm.registerListener(this, fused, SensorManager.SENSOR_DELAY_GAME)
      Mode.GEOMAGNETIC -> sm.registerListener(this, geo, SensorManager.SENSOR_DELAY_GAME)
      else -> {
        sm.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME)
      }
    }
    // Kalibrasyon durumunu manyetometre bildirir; RAW kipte veri de buradan gelir
    if (mag != null) sm.registerListener(this, mag, SensorManager.SENSOR_DELAY_GAME)
    hasValue = false
    accuracyDeg = -1.0
    gravity = null
    geomagnetic = null
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
      Sensor.TYPE_ROTATION_VECTOR, Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR -> {
        SensorManager.getRotationMatrixFromVector(rotation, event.values)
        accuracyDeg = if (event.values.size > 4 && event.values[4] > 0f) Math.toDegrees(event.values[4].toDouble()) else -1.0
      }
      Sensor.TYPE_ACCELEROMETER -> {
        gravity = lowPass(event.values, gravity)
        return
      }
      Sensor.TYPE_MAGNETIC_FIELD -> {
        if (mode != Mode.RAW) return
        geomagnetic = lowPass(event.values, geomagnetic)
        val g = gravity ?: return
        if (!SensorManager.getRotationMatrix(rotation, null, g, geomagnetic)) return
      }
      else -> return
    }

    // rotation[8]: ekran normalinin dikey bileşeni. Histerezisle dik/yatık kip seçilir.
    val z = abs(rotation[8])
    if (upright && z > 0.6f) upright = false else if (!upright && z < 0.4f) upright = true
    val matrix = if (upright) {
      SensorManager.remapCoordinateSystem(rotation, SensorManager.AXIS_X, SensorManager.AXIS_Z, remapped)
      remapped
    } else {
      rotation
    }
    SensorManager.getOrientation(matrix, orientation)
    val heading = Math.toDegrees(orientation[0].toDouble()) + declination
    val rad = Math.toRadians(heading)

    // Jiroskoplu füzyon zaten pürüzsüz; yalnız manyetometreye dayananlar daha güçlü süzülür
    val alpha = if (mode == Mode.FUSED) 0.3 else 0.1
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
    sendEvent("onHeading", mapOf("heading" to out, "accuracy" to accuracy, "accuracyDeg" to accuracyDeg))
  }

  private fun lowPass(input: FloatArray, prev: FloatArray?): FloatArray {
    if (prev == null) return input.copyOf(3)
    for (i in 0 until 3) prev[i] += 0.15f * (input[i] - prev[i])
    return prev
  }
}
