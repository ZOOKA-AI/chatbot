plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.zooka.live"
    compileSdk = 35

    defaultConfig {
        applicationId = "ai.zooka.live"
        // 26 keeps the adaptive icon as the only icon; Android 8+ covers nearly all active phones.
        minSdk = 26
        targetSdk = 35
        // CI passes the run number so every published APK installs over the previous one.
        versionCode = (System.getenv("ZOOKA_VERSION_CODE") ?: "1").toInt()
        versionName = "1.0.${System.getenv("ZOOKA_VERSION_CODE") ?: "0"}"
        // The only origin the app loads and the only origin allowed to drive the native bridge.
        buildConfigField("String", "ZOOKA_ORIGIN", "\"https://zooka-ai.com\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("io.livekit:livekit-android:2.21.1")
}
