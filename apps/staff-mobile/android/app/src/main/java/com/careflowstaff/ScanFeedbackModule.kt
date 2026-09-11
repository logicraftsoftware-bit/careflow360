package com.careflowstaff

import android.media.AudioManager
import android.media.ToneGenerator
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Handler
import android.os.Looper
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
    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("LOCATION_PERMISSION", "Location permission is required")
      return
    }
    val manager = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provider = when {
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      else -> null
    }
    if (provider == null) {
      promise.reject("LOCATION_DISABLED", "Turn on device location and try again")
      return
    }
    manager.getCurrentLocation(provider, null, ContextCompat.getMainExecutor(reactApplicationContext)) { location ->
      if (location == null) promise.reject("LOCATION_UNAVAILABLE", "Current location is unavailable")
      else promise.resolve(Arguments.createMap().apply {
        putDouble("latitude", location.latitude)
        putDouble("longitude", location.longitude)
        putDouble("accuracy", location.accuracy.toDouble())
        putDouble("capturedAt", location.time.toDouble())
      })
    }
  }
}
