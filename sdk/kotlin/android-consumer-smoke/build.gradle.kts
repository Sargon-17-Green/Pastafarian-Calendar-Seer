plugins {
    id("com.android.application") version "9.3.1"
}

android {
    namespace = "org.pastafarian.seer.kotlin.smoke"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.pastafarian.seer.kotlin.smoke"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.0.0-diagnostic"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}

dependencies {
    // Exactly the AAR emitted by the separate packaging step. The Kotlin
    // runtime is an explicit consumer dependency, not smuggled into classes.jar.
    implementation(files("../build/android/seer-kotlin-android-abi1-UNRELEASED.aar"))
    implementation("org.jetbrains.kotlin:kotlin-stdlib:2.4.20")
}
