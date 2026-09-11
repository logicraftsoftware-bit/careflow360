package com.careflowstaff

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScanFeedbackModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "ScanFeedback"

  @ReactMethod
  fun success() {
    val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 90)
    tone.startTone(ToneGenerator.TONE_PROP_ACK, 160)
    Handler(Looper.getMainLooper()).postDelayed({ tone.release() }, 250)
  }
}
