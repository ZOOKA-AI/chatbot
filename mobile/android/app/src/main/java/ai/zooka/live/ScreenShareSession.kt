package ai.zooka.live

import android.content.Context
import android.content.Intent
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams

/**
 * One native participant that publishes only the phone's screen into the web session's room.
 *
 * The web page mints the room token with the signed-in member's cookie and hands it over, so this
 * class never sees a credential other than that short-lived, single-room token. Camera and
 * microphone stay with the web page; this participant publishes nothing but the screen.
 */
class ScreenShareSession(
    private val appContext: Context,
    private val onStopped: () -> Unit,
) {
    private var room: Room? = null

    val isActive: Boolean
        get() = room != null

    suspend fun start(url: String, token: String, projectionData: Intent) {
        stop()
        val next = LiveKit.create(appContext)
        room = next
        try {
            next.connect(url, token)
            val params = ScreenCaptureParams(
                mediaProjectionPermissionResultData = projectionData,
                onStop = {
                    // The user ended capture from the system notification or the status bar chip.
                    stop()
                    onStopped()
                },
            )
            val enabled = next.localParticipant.setScreenShareEnabled(true, params)
            if (!enabled) {
                throw IllegalStateException("screen_share_not_enabled")
            }
        } catch (error: Throwable) {
            stop()
            throw error
        }
    }

    fun stop() {
        val current = room ?: return
        room = null
        try {
            current.disconnect()
        } finally {
            current.release()
        }
    }
}
