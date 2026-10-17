package expo.modules.ongoingnotification

import android.media.Ringtone
import android.media.RingtoneManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OngoingNotificationModule : Module() {
  /** Ayarlar'daki "Dinle" ile çalınan telefonun varsayılan bildirim sesi */
  private var preview: Ringtone? = null

  override fun definition() = ModuleDefinition {
    Name("OngoingNotification")

    /** Vakitleri kaydedip bildirimi hemen günceller; enabled=false bildirimi ve alarmı kaldırır. */
    Function("sync") { enabled: Boolean, place: String, daysJson: String ->
      val context = appContext.reactContext ?: return@Function
      OngoingNotifier.save(context, enabled, place, daysJson)
      OngoingNotifier.update(context)
    }

    /**
     * Telefonun seçili bildirim sesini bildirim göndermeden çalar. Android 14+ bu sese dosya olarak erişimi
     * kapattı (expo-audio "Direct file access no longer supported" hatası veriyor); yalnız Ringtone ile çalınabiliyor.
     */
    Function("playDefaultNotificationSound") {
      val context = appContext.reactContext ?: return@Function false
      preview?.stop()
      val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) ?: return@Function false
      val ringtone = RingtoneManager.getRingtone(context, uri) ?: return@Function false
      preview = ringtone
      ringtone.play()
      true
    }

    Function("stopPreviewSound") {
      preview?.stop()
      preview = null
    }

    OnDestroy {
      preview?.stop()
      preview = null
    }
  }
}
