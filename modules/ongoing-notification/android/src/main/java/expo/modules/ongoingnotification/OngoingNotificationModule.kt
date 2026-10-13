package expo.modules.ongoingnotification

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OngoingNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OngoingNotification")

    /** Vakitleri kaydedip bildirimi hemen günceller; enabled=false bildirimi ve alarmı kaldırır. */
    Function("sync") { enabled: Boolean, place: String, daysJson: String ->
      val context = appContext.reactContext ?: return@Function
      OngoingNotifier.save(context, enabled, place, daysJson)
      OngoingNotifier.update(context)
    }
  }
}
