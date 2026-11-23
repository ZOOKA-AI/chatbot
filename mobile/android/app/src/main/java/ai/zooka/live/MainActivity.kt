package ai.zooka.live

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * ZOOKA-AI for Android: the real site in a WebView, plus the one thing Android browsers cannot do —
 * share the phone's screen into the live session.
 *
 * Security rules that matter:
 * - Only https://zooka-ai.com (and its subdomains) loads inside the app; every other link opens in
 *   the system browser, so no third-party page ever runs next to the bridge.
 * - The bridge is a WebMessageListener scoped to that origin by the WebView itself, not a
 *   JavaScript interface visible to any frame.
 * - The app holds no credential. The page mints a single-room LiveKit token with the member's own
 *   session and passes it in; the app only adds the screen track.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var screenSession: ScreenShareSession

    private var replyProxy: JavaScriptReplyProxy? = null
    private var pendingScreen: Pair<String, String>? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null

    private val origin: Uri = Uri.parse(BuildConfig.ZOOKA_ORIGIN)

    private val projectionLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val target = pendingScreen
            pendingScreen = null
            val data = result.data
            if (result.resultCode != Activity.RESULT_OK || data == null || target == null) {
                send("screen", "state" to "stopped", "reason" to "denied")
                return@registerForActivityResult
            }
            lifecycleScope.launch {
                try {
                    screenSession.start(target.first, target.second, data)
                    send("screen", "state" to "started")
                } catch (error: Throwable) {
                    send("screen", "state" to "error", "message" to (error.message ?: "screen_share_failed"))
                }
            }
        }

    private val notificationLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { launchProjection() }

    private val mediaPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            val request = pendingWebPermission ?: return@registerForActivityResult
            pendingWebPermission = null
            val allowed = request.resources.filter { resource ->
                when (resource) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> granted[Manifest.permission.CAMERA] == true || hasPermission(Manifest.permission.CAMERA)
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> granted[Manifest.permission.RECORD_AUDIO] == true || hasPermission(Manifest.permission.RECORD_AUDIO)
                    else -> false
                }
            }
            if (allowed.isEmpty()) request.deny() else request.grant(allowed.toTypedArray())
        }

    private val fileLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = pendingFileCallback ?: return@registerForActivityResult
            pendingFileCallback = null
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        screenSession = ScreenShareSession(applicationContext) {
            runOnUiThread { send("screen", "state" to "stopped", "reason" to "ended") }
        }

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }

        installBridge()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isZookaUrl(request.url)) return false
                openExternally(request.url)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread { handleWebPermission(request) }
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = callback
                return try {
                    fileLauncher.launch(params.createIntent())
                    true
                } catch (_: ActivityNotFoundException) {
                    pendingFileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        val start = intent?.data?.takeIf { isZookaUrl(it) } ?: origin
        if (savedInstanceState == null) webView.loadUrl(start.toString()) else webView.restoreState(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf { isZookaUrl(it) }?.let { webView.loadUrl(it.toString()) }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        screenSession.stop()
        webView.destroy()
        super.onDestroy()
    }

    private fun installBridge() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return
        val allowed = setOf(BuildConfig.ZOOKA_ORIGIN, "https://*.zooka-ai.com")
        WebViewCompat.addWebMessageListener(webView, "ZookaNative", allowed) { _, message, sourceOrigin, isMainFrame, proxy ->
            if (!isMainFrame || !isZookaUrl(sourceOrigin)) return@addWebMessageListener
            replyProxy = proxy
            val payload = try {
                JSONObject(message.data ?: return@addWebMessageListener)
            } catch (_: Exception) {
                return@addWebMessageListener
            }
            when (payload.optString("type")) {
                "hello" -> send("hello", "screen" to true, "version" to BuildConfig.VERSION_NAME)
                "screen:start" -> startScreen(payload.optString("url"), payload.optString("token"))
                "screen:stop" -> {
                    screenSession.stop()
                    send("screen", "state" to "stopped", "reason" to "requested")
                }
            }
        }
    }

    private fun startScreen(url: String, token: String) {
        if (!url.startsWith("wss://") || token.isBlank() || token.length > 4096) {
            send("screen", "state" to "error", "message" to "invalid_token")
            return
        }
        pendingScreen = url to token
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
            // The capture notification is how the user stops sharing; ask, but proceed either way.
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            launchProjection()
        }
    }

    private fun launchProjection() {
        if (pendingScreen == null) return
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projectionLauncher.launch(manager.createScreenCaptureIntent())
    }

    private fun handleWebPermission(request: PermissionRequest) {
        if (!isZookaUrl(request.origin)) {
            request.deny()
            return
        }
        val needed = buildList {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources) add(Manifest.permission.CAMERA)
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) add(Manifest.permission.RECORD_AUDIO)
        }
        if (needed.isEmpty()) {
            request.deny()
            return
        }
        pendingWebPermission?.deny()
        pendingWebPermission = request
        mediaPermissionLauncher.launch(needed.toTypedArray())
    }

    private fun send(type: String, vararg fields: Pair<String, Any>) {
        val proxy = replyProxy ?: return
        val json = JSONObject().put("type", type)
        for ((key, value) in fields) json.put(key, value)
        runOnUiThread { proxy.postMessage(json.toString()) }
    }

    private fun isZookaUrl(uri: Uri?): Boolean {
        if (uri == null || uri.scheme != "https") return false
        val host = uri.host ?: return false
        return host == "zooka-ai.com" || host.endsWith(".zooka-ai.com")
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // Nothing can open it; stay on the current page.
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}
