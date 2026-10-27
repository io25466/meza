package com.mizan.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.widget.RemoteViews
import org.json.JSONObject
import java.security.KeyStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class MizanHomeWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> updateOne(context, manager, id) }
  }

  companion object {
    private const val PREFS = "mizan_widget_private_v1"
    private const val PAYLOAD_KEY = "encrypted_schedule"
    private const val KEY_ALIAS = "mizan.home.widget.v1"
    private const val EMPTY_MESSAGE = "لا توجد جلسات اليوم، يومك سعيد سيادة المستشار"

    fun storeEncryptedPayload(context: Context, encryptedPayload: String) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString(PAYLOAD_KEY, encryptedPayload)
        .apply()
      val manager = AppWidgetManager.getInstance(context)
      val component = ComponentName(context, MizanHomeWidgetProvider::class.java)
      manager.getAppWidgetIds(component).forEach { updateOne(context, manager, it) }
    }

    private fun updateOne(context: Context, manager: AppWidgetManager, id: Int) {
      val views = RemoteViews(context.packageName, R.layout.mizan_home_widget)
      val payload = readPayload(context)
      val items = payload?.optJSONArray("appointments")
      val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
      val lines = if (items == null) emptyList() else (0 until items.length()).mapNotNull { index ->
        val item = items.optJSONObject(index) ?: return@mapNotNull null
        if (item.optString("date") != today) return@mapNotNull null
        val kind = if (item.optString("kind") == "hearing") "جلسة" else "اجتماع"
        "$kind · ${item.optString("time")}"
      }.take(4)
      views.setTextViewText(R.id.mizan_widget_items, lines.takeIf { it.isNotEmpty() }?.joinToString("\n") ?: EMPTY_MESSAGE)
      val deepLink = payload?.optString("createCaseUrl").orEmpty()
      if (deepLink.isNotBlank() && deepLink.contains("/clients")) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink)).apply {
          setPackage(context.packageName)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pending = PendingIntent.getActivity(
          context,
          id,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        views.setOnClickPendingIntent(R.id.mizan_widget_add_case, pending)
      }
      manager.updateAppWidget(id, views)
    }

    private fun readPayload(context: Context): JSONObject? {
      return try {
        val encrypted = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .getString(PAYLOAD_KEY, null) ?: return null
        val bytes = Base64.decode(encrypted, Base64.NO_WRAP)
        if (bytes.size <= 12) return null
        val iv = bytes.copyOfRange(0, 12)
        val ciphertext = bytes.copyOfRange(12, bytes.size)
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val key = store.getKey(KEY_ALIAS, null) as? SecretKey ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
        JSONObject(String(cipher.doFinal(ciphertext), Charsets.UTF_8))
      } catch (_: Exception) {
        null
      }
    }
  }
}
