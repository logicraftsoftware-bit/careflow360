package com.careflowpatient

import android.media.AudioManager
import android.media.ToneGenerator
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.Arguments
import androidx.core.content.ContextCompat

class ScanFeedbackModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ScanFeedback"

  @ReactMethod
  fun success() {
    val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
    tone.startTone(ToneGenerator.TONE_PROP_ACK, 160)
    Handler(Looper.getMainLooper()).postDelayed({ tone.release() }, 250)
  }

  @ReactMethod
  fun currentLocation(promise: Promise) {
    val context = reactApplicationContext
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) {
      promise.reject("LOCATION_PERMISSION", "Location permission is required")
      return
    }
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
      .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }
    if (providers.isEmpty()) {
      promise.reject("LOCATION_DISABLED", "Turn on device location and try again")
      return
    }
    val cached = providers.mapNotNull { runCatching { manager.getLastKnownLocation(it) }.getOrNull() }
      .maxByOrNull { it.time }
    if (cached != null && System.currentTimeMillis() - cached.time < 120_000) {
      promise.resolve(locationMap(cached))
      return
    }
    val handler = Handler(Looper.getMainLooper())
    var finished = false
    lateinit var listener: LocationListener
    fun finish(location: Location?, errorCode: String? = null, errorMessage: String? = null) {
      if (finished) return
      finished = true
      runCatching { manager.removeUpdates(listener) }
      handler.removeCallbacksAndMessages(listener)
      if (location != null) promise.resolve(locationMap(location))
      else promise.reject(errorCode ?: "LOCATION_TIMEOUT", errorMessage ?: "Location is taking too long. Move near a window and try again")
    }
    listener = object : LocationListener {
      override fun onLocationChanged(location: Location) = finish(location)
      override fun onProviderDisabled(provider: String) = Unit
      override fun onProviderEnabled(provider: String) = Unit
      @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }
    providers.forEach { provider ->
      runCatching { manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper()) }
    }
    handler.postAtTime({ finish(cached) }, listener, SystemClock.uptimeMillis() + 15_000)
  }

  private fun locationMap(location: Location) = Arguments.createMap().apply {
    putDouble("latitude", location.latitude)
    putDouble("longitude", location.longitude)
    putDouble("accuracy", location.accuracy.toDouble())
    putDouble("capturedAt", location.time.toDouble())
  }
}
