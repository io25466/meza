package com.mizan.widget

import android.content.Context
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties

class MizanWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MizanWidget")

    AsyncFunction("updateToday") { payload: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      MizanHomeWidgetProvider.storeEncryptedPayload(context, encryptPayload(context, payload))
      true
    }

    AsyncFunction("derivePinHash") { pin: String, saltHex: String, rounds: Int ->
      if (rounds !in 100_000..1_000_000 || pin.length != 6) throw IllegalArgumentException("Invalid PIN derivation request")
      val spec = PBEKeySpec(pin.toCharArray(), decodeHex(saltHex), rounds, 256)
      try {
        val derived = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        derived.joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
      } finally { spec.clearPassword() }
    }
  }

  private fun encryptPayload(context: Context, payload: String): String {
    val key = getOrCreateKey()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key)
    val ciphertext = cipher.doFinal(payload.toByteArray(Charsets.UTF_8))
    return Base64.encodeToString(cipher.iv + ciphertext, Base64.NO_WRAP)
  }

  private fun decodeHex(value: String): ByteArray {
    require(value.length % 2 == 0 && value.matches(Regex("[0-9a-fA-F]+")))
    return ByteArray(value.length / 2) { index -> value.substring(index * 2, index * 2 + 2).toInt(16).toByte() }
  }

  private fun getOrCreateKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(
      KeyGenParameterSpec.Builder(
        KEY_ALIAS,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  companion object {
    private const val KEY_ALIAS = "mizan.home.widget.v1"
  }
}
