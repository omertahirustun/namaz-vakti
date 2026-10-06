package expo.modules.widgetrefresh

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Widget'ı belirli bir anda (sıradaki vakit girince) yeniletmek için tek seferlik alarm kurar.
 * Alarm, react-native-android-widget'ın ürettiği alıcıya APPWIDGET_UPDATE yollar; o da JS'teki
 * widget görev işleyicisini çalıştırır, işleyici de bir sonraki alarmı kurar.
 */
class WidgetRefreshModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context yok")

  override fun definition() = ModuleDefinition {
    Name("WidgetRefresh")

    // Android 12+ "Alarmlar ve hatırlatıcılar" izni; kapalıysa alarmlar dakikalarca gecikebilir
    Function("canScheduleExactAlarms") {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
    }

    Function("scheduleRefresh") { widgetName: String, atMillis: Double ->
      val ctx = context
      val receiver = ComponentName(ctx.packageName, "${ctx.packageName}.widget.$widgetName")
      val ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(receiver)
      val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        .setComponent(receiver)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
      val pending = PendingIntent.getBroadcast(
        ctx,
        widgetName.hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      // Ekranda widget yoksa alarm boşa çalışmasın
      if (ids.isEmpty()) {
        alarmManager.cancel(pending)
        return@Function false
      }
      val at = atMillis.toLong()
      val exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
      if (exact) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      } else {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      }
      true
    }
  }
}
