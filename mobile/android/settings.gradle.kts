pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // LiveKit's audio routing dependency (audioswitch) is published on JitPack.
        maven("https://jitpack.io")
    }
}

rootProject.name = "zooka-live"
include(":app")
