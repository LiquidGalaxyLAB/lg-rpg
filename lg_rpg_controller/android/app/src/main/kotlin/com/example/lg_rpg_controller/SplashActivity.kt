package com.example.lg_rpg_controller

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.ImageView

class SplashActivity : Activity() {
    private val initialLogoDelayMs = 1500L
    private val sponsorLogoDelayMs = 5000L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.WHITE
        window.navigationBarColor = Color.WHITE
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR

        val splashImage = ImageView(this).apply {
            setBackgroundColor(Color.WHITE)
            setImageResource(R.drawable.flutter_lleida_splash_large)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }

        setContentView(splashImage)

        val handler = Handler(Looper.getMainLooper())
        handler.postDelayed({
            splashImage.setImageResource(R.drawable.splash_logos)
        }, initialLogoDelayMs)

        handler.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            overridePendingTransition(0, 0)
        }, initialLogoDelayMs + sponsorLogoDelayMs)
    }
}
