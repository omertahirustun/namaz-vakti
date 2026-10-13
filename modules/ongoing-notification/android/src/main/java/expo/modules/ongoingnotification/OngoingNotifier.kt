package expo.modules.ongoingnotification

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray

/**
 * "Vakte kalan" kalıcı bildirimi. Sıradaki vakte geri sayımı bildirimin içindeki Chronometer'ı sistem
 * işletir (uygulama kapalıyken de saniye saniye akar); vakit girince bir alarm bildirimi bir sonraki vakte
 * çevirir. Vakitler uygulamadan SharedPreferences'a yazılır, böylece alarm ve telefon açılışı (OngoingReceiver)
 * uygulamayı başlatmadan bildirimi kurabilir.
 */
object OngoingNotifier {
  private const val PREFS = "ongoing_notification"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_PLACE = "place"
  private const val KEY_DAYS = "days"
  private const val CHANNEL_ID = "ongoing-countdown"
  private const val NOTIFICATION_ID = 7301
  const val ACTION_REFRESH = "expo.modules.ongoingnotification.REFRESH"

  private val CELL_IDS = intArrayOf(R.id.ongoing_cell0, R.id.ongoing_cell1, R.id.ongoing_cell2, R.id.ongoing_cell3, R.id.ongoing_cell4, R.id.ongoing_cell5)
  private val NAME_IDS = intArrayOf(R.id.ongoing_name0, R.id.ongoing_name1, R.id.ongoing_name2, R.id.ongoing_name3, R.id.ongoing_name4, R.id.ongoing_name5)
  private val TIME_IDS = intArrayOf(R.id.ongoing_time0, R.id.ongoing_time1, R.id.ongoing_time2, R.id.ongoing_time3, R.id.ongoing_time4, R.id.ongoing_time5)

  /** daysJson: [{ prayers: [{ at: epoch ms, name: "İkindi", time: "16:03" } × 6] }, …] (günler ve vakitler artan sırada) */
  fun save(context: Context, enabled: Boolean, place: String, daysJson: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean(KEY_ENABLED, enabled)
      .putString(KEY_PLACE, place)
      .putString(KEY_DAYS, daysJson)
      .apply()
  }

  /** Kayıtlı vakitlere göre bildirimi kurar/kaldırır ve bir sonraki vakit için alarmı ayarlar. */
  fun update(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val manager = NotificationManagerCompat.from(context)
    if (!prefs.getBoolean(KEY_ENABLED, false)) {
      manager.cancel(NOTIFICATION_ID)
      cancelAlarm(context)
      return
    }

    // Vakit girdiği saniyede eski vakti bulmasın diye 1 sn pay
    val now = System.currentTimeMillis() + 1_000
    // Sıradaki vakit ve onun günü: yatsıdan sonra yarının vakitleri gösterilir (widget'taki gibi)
    val days = runCatching { JSONArray(prefs.getString(KEY_DAYS, "[]")) }.getOrNull() ?: JSONArray()
    var dayPrayers: JSONArray? = null
    var nextIndex = -1
    search@ for (d in 0 until days.length()) {
      val prayers = days.getJSONObject(d).getJSONArray("prayers")
      for (i in 0 until prayers.length()) {
        if (prayers.getJSONObject(i).getLong("at") > now) {
          dayPrayers = prayers
          nextIndex = i
          break@search
        }
      }
    }
    // Vakitler biterse (uygulama aylarca açılmadıysa) yanlış bir sayaç göstermektense kaldır
    if (dayPrayers == null || !manager.areNotificationsEnabled()) {
      manager.cancel(NOTIFICATION_ID)
      cancelAlarm(context)
      return
    }

    val next = dayPrayers.getJSONObject(nextIndex)
    val at = next.getLong("at")
    val name = next.getString("name")
    val label = "$name vaktine kalan"
    val target = "$name ${next.getString("time")}"
    val place = prefs.getString(KEY_PLACE, "") ?: ""
    val chronoBase = SystemClock.elapsedRealtime() + (at - System.currentTimeMillis())

    // Kapalı hâl: geri sayım satırı; açık hâl: altında günün vakitleri
    fun header(layout: Int) = RemoteViews(context.packageName, layout).apply {
      setTextViewText(R.id.ongoing_label, label)
      setTextViewText(R.id.ongoing_target, target)
      setTextViewText(R.id.ongoing_place, place)
      setChronometer(R.id.ongoing_countdown, chronoBase, null, true)
      setChronometerCountDown(R.id.ongoing_countdown, true)
    }
    val views = header(R.layout.ongoing_notification)
    val bigViews = header(R.layout.ongoing_notification_big).apply {
      for (i in 0 until minOf(CELL_IDS.size, dayPrayers.length())) {
        val p = dayPrayers.getJSONObject(i)
        setTextViewText(NAME_IDS[i], p.getString("name"))
        setTextViewText(TIME_IDS[i], p.getString("time"))
        // Sıradaki vakit çerçeveli kutuda, geçmişler soluk (yarının günü gösteriliyorsa nextIndex 0, geçmiş yok)
        setInt(CELL_IDS[i], "setBackgroundResource", if (i == nextIndex) R.drawable.ongoing_active else 0)
        setFloat(CELL_IDS[i], "setAlpha", if (i < nextIndex) 0.45f else 1f)
      }
    }

    ensureChannel(context)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(smallIcon(context))
      .setContentTitle(label)
      .setContentText(if (place.isEmpty()) target else "$target · $place")
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(views)
      .setCustomBigContentView(bigViews)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(false)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
    accentColor(context)?.let { builder.setColor(it) }
    launchIntent(context)?.let { builder.setContentIntent(it) }

    try {
      manager.notify(NOTIFICATION_ID, builder.build())
    } catch (_: SecurityException) {
      // Android 13+ bildirim izni geri alınmış
      return
    }
    scheduleAlarm(context, at + 1_000)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Vakte kalan süre", NotificationManager.IMPORTANCE_LOW).apply {
      description = "Bildirim çekmecesinde sıradaki vakte geri sayım"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    nm.createNotificationChannel(channel)
  }

  // expo-notifications eklentisinin ürettiği tek renkli simge ve rengi; yoksa uygulama simgesi
  private fun smallIcon(context: Context): Int {
    val id = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  private fun accentColor(context: Context): Int? {
    val id = context.resources.getIdentifier("notification_icon_color", "color", context.packageName)
    return if (id != 0) context.getColor(id) else null
  }

  private fun launchIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, NOTIFICATION_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun alarmIntent(context: Context): PendingIntent {
    val intent = Intent(context, OngoingReceiver::class.java).setAction(ACTION_REFRESH)
    return PendingIntent.getBroadcast(context, NOTIFICATION_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun scheduleAlarm(context: Context, atMillis: Long) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = alarmIntent(context)
    // "Alarmlar ve hatırlatıcılar" izni yoksa alarm birkaç dakika gecikebilir; sayaç o arada sıfırın altına iner
    val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
    if (exact) {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
    } else {
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pending)
    }
  }

  private fun cancelAlarm(context: Context) {
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarmIntent(context))
  }
}
