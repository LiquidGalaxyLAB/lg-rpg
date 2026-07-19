import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}


fun readMapsApiKey(): String {
    val env = rootProject.file("../.env")
    if (env.exists()) {
        val line = env.readLines().firstOrNull {
            val trimmed = it.trim()
            !trimmed.startsWith("#") && trimmed.startsWith("GOOGLE_MAPS_API_KEY")
        }
        val value = line?.substringAfter("=", "")?.trim()?.trim('"', '\'').orEmpty()
        if (value.isNotEmpty()) return value
    }
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        val localProperties = Properties()
        FileInputStream(localPropertiesFile).use { localProperties.load(it) }
        return localProperties.getProperty("MAPS_API_KEY").orEmpty()
    }
    return ""
}

val mapsApiKey: String = readMapsApiKey()

android {
    namespace = "com.example.lg_rpg_controller"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.example.lg_rpg_controller"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
