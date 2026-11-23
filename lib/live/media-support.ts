/**
 * What this browser can capture, and how to ask for it on every browser that can.
 *
 * Screen capture (`getDisplayMedia`) does not exist in Chrome for Android, Samsung Internet, Firefox
 * for Android or Opera Mobile; Safari on iOS has it only from 27. No page can add it there. So the
 * honest behaviour is: detect it before the user taps, say so calmly, and keep microphone and camera
 * working everywhere they can — including older engines that only expose the legacy prefixed
 * `getUserMedia`, and devices that reject the preferred resolution.
 */

export type Platform = "android" | "ios" | "desktop";

export type MediaSupport = {
  platform: Platform;
  secureContext: boolean;
  /** An in-app browser (Instagram, Facebook, TikTok, Snapchat, LINE, generic WebView). */
  inAppBrowser: boolean;
  microphone: boolean;
  camera: boolean;
  screen: boolean;
};

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  onSuccess: (stream: MediaStream) => void,
  onError: (error: unknown) => void
) => void;

type NavigatorLike = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  mediaDevices?: {
    getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
    getDisplayMedia?: (options?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  };
  getDisplayMedia?: (options?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  getUserMedia?: LegacyGetUserMedia;
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
};

export function detectPlatform(nav: NavigatorLike): Platform {
  const ua = nav.userAgent ?? "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS reports itself as a Mac; touch points give it away.
  if (/Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1) return "ios";
  return "desktop";
}

export function isInAppBrowser(nav: NavigatorLike): boolean {
  const ua = nav.userAgent ?? "";
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|Snapchat|Line\/|; wv\)|GSA\//i.test(ua);
}

function legacyGetUserMedia(nav: NavigatorLike): LegacyGetUserMedia | null {
  return nav.getUserMedia ?? nav.webkitGetUserMedia ?? nav.mozGetUserMedia ?? null;
}

export function detectMediaSupport(nav: NavigatorLike, secureContext: boolean): MediaSupport {
  const userMedia = Boolean(nav.mediaDevices?.getUserMedia) || legacyGetUserMedia(nav) !== null;
  const screen = Boolean(nav.mediaDevices?.getDisplayMedia) || typeof nav.getDisplayMedia === "function";
  return {
    platform: detectPlatform(nav),
    secureContext,
    inAppBrowser: isInAppBrowser(nav),
    // Capture is only exposed in a secure context; outside one, every browser refuses.
    microphone: secureContext && userMedia,
    camera: secureContext && userMedia,
    screen: secureContext && screen,
  };
}

function isConstraintError(error: unknown): boolean {
  const name = error instanceof Error || (error && typeof error === "object") ? (error as { name?: string }).name : "";
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" || name === "NotReadableError" || name === "TypeError";
}

/**
 * getUserMedia on every engine: the standard promise API, else the legacy prefixed callback API.
 * If the device rejects the preferred video constraints, it retries once with plain `video: true`,
 * which is what older Android cameras and some Safari builds need.
 */
export async function getUserMediaCompat(nav: NavigatorLike, constraints: MediaStreamConstraints): Promise<MediaStream> {
  const request = (value: MediaStreamConstraints): Promise<MediaStream> => {
    if (nav.mediaDevices?.getUserMedia) return nav.mediaDevices.getUserMedia(value);
    const legacy = legacyGetUserMedia(nav);
    if (!legacy) return Promise.reject(Object.assign(new Error("getUserMedia is not available"), { name: "NotSupportedError" }));
    return new Promise((resolve, reject) => legacy.call(nav, value, resolve, reject));
  };
  try {
    return await request(constraints);
  } catch (error) {
    if (constraints.video && typeof constraints.video === "object" && isConstraintError(error)) {
      return request({ ...constraints, video: true });
    }
    throw error;
  }
}

/** getDisplayMedia, including the pre-standard `navigator.getDisplayMedia` of Edge 17–18. */
export async function getDisplayMediaCompat(nav: NavigatorLike, options: DisplayMediaStreamOptions): Promise<MediaStream> {
  if (nav.mediaDevices?.getDisplayMedia) {
    try {
      return await nav.mediaDevices.getDisplayMedia(options);
    } catch (error) {
      // Safari rejects frame-rate and size hints it does not understand; retry without them.
      if (options.video && typeof options.video === "object" && isConstraintError(error)) {
        return nav.mediaDevices.getDisplayMedia({ ...options, video: true });
      }
      throw error;
    }
  }
  if (typeof nav.getDisplayMedia === "function") return nav.getDisplayMedia.call(nav, options);
  throw Object.assign(new Error("getDisplayMedia is not available"), { name: "NotSupportedError" });
}

/** The sentence shown under the controls when something cannot work here, or null when all can. */
export function supportNotice(support: MediaSupport, lang: "ar" | "en"): string | null {
  const ar = lang === "ar";
  if (!support.secureContext) {
    return ar
      ? "الصوت والكاميرا والشاشة تحتاج اتصالًا آمنًا (https). افتح الجلسة من zooka-ai.com."
      : "Microphone, camera and screen need a secure (https) connection. Open the session from zooka-ai.com.";
  }
  if (support.inAppBrowser && (!support.camera || !support.microphone)) {
    return ar
      ? "متصفح التطبيق هذا لا يسمح بالصوت والكاميرا. افتح الرابط في Chrome أو Safari."
      : "This in-app browser blocks microphone and camera. Open the link in Chrome or Safari.";
  }
  if (!support.camera || !support.microphone) {
    return ar
      ? "هذا المتصفح لا يتيح الصوت والكاميرا. حدّثه أو استخدم Chrome أو Safari أو Edge أو Firefox."
      : "This browser does not offer microphone and camera. Update it or use Chrome, Safari, Edge or Firefox.";
  }
  if (!support.screen) {
    if (support.platform === "android") {
      return ar
        ? "مشاركة الشاشة غير متاحة في متصفحات أندرويد (Chrome وSamsung وFirefox). الصوت والكاميرا يعملان. لمشاركة الشاشة افتح الجلسة من الكمبيوتر."
        : "Screen sharing is not available in Android browsers (Chrome, Samsung, Firefox). Microphone and camera work. To share your screen, open the session on a computer.";
    }
    if (support.platform === "ios") {
      return ar
        ? "مشاركة الشاشة على iPhone وiPad تحتاج iOS 27 أو أحدث في Safari. الصوت والكاميرا يعملان."
        : "Screen sharing on iPhone and iPad needs iOS 27 or later in Safari. Microphone and camera work.";
    }
    return ar
      ? "هذا المتصفح لا يدعم مشاركة الشاشة. حدّثه أو استخدم Chrome أو Edge أو Firefox أو Safari."
      : "This browser does not support screen sharing. Update it or use Chrome, Edge, Firefox or Safari.";
  }
  return null;
}
