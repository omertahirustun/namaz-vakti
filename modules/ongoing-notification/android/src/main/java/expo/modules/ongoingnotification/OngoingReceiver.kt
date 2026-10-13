package expo.modules.ongoingnotification

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Vakit girince (kendi alarmımız), telefon açılınca, uygulama güncellenince ya da saat değişince bildirimi yeniler. */
class OngoingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    OngoingNotifier.update(context)
  }
}
