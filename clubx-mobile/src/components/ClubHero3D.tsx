import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, InteractionManager, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useIsFocused } from "@react-navigation/native";
import { fetchPublicBinary } from "@/api/client";
import { useTheme } from "@/theme/ThemeContext";
import { arrayBufferToBase64 } from "@/lib/base64";
import { heroPlan, MAX_CUSTOM_MODEL_BYTES, type ClubBrand } from "@/lib/clubBrand";

// The club's 3D hero object, drawn by the same three.js code as the club's
// website (see hero3d-viewer/ and scripts/build-hero3d.mjs) inside a WebView.
//
// Built to cost as little as possible:
//  - the 650 KB viewer page is loaded lazily, after the screen's animations;
//  - the render loop stops when the screen is not focused, the app is in the
//    background, or "reduce motion" is on (one still frame is kept);
//  - the pixel ratio is capped (and lowered by itself on slow phones);
//  - a club's own model is downloaded once per version (content-hashed URL),
//    size-capped, and kept in memory only;
//  - if 3D cannot run (no WebGL, WebView crash) or the club turned it off, the
//    `fallback` stays — the screen never shows an empty hole or an error.
// The view is decorative: it never takes touches and is hidden from screen readers.

const modelCache = new Map<string, string>();
const MODEL_CACHE_MAX = 2;

async function loadCustomModelB64(url: string): Promise<string> {
  const hit = modelCache.get(url);
  if (hit) return hit;
  const b64 = arrayBufferToBase64(await fetchPublicBinary(url, MAX_CUSTOM_MODEL_BYTES));
  if (modelCache.size >= MODEL_CACHE_MAX) modelCache.delete(modelCache.keys().next().value as string);
  modelCache.set(url, b64);
  return b64;
}

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
}

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => !cancelled && setReduce(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduce;
}

interface Props {
  brand: ClubBrand;
  size?: number;
  /** Shown until the 3D object is on screen, and instead of it if 3D is unavailable. */
  fallback?: ReactNode;
}

export default function ClubHero3D({ brand, size = 140, fallback }: Props) {
  const { colors, isDark } = useTheme();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const reduceMotion = useReduceMotion();
  const plan = useMemo(() => heroPlan(brand), [brand]);

  const webRef = useRef<WebView>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const [shown, setShown] = useState(false);
  const [dead, setDead] = useState(false);
  const enabled = plan.kind !== "none" && !dead;

  // 1. The viewer page, only once this screen has finished animating in.
  useEffect(() => {
    if (!enabled || html) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void import("@/hero3d/viewerHtml.generated")
        .then((m) => !cancelled && setHtml(m.VIEWER_HTML))
        .catch(() => !cancelled && setDead(true));
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [enabled, html]);

  // 2. The club's own model file (if it uploaded one). undefined = still downloading, null = failed.
  const customUrl = plan.kind === "custom" ? plan.url : null;
  const [loaded, setLoaded] = useState<{ url: string; b64: string | null } | null>(null);
  useEffect(() => {
    if (!enabled || !customUrl) return;
    let cancelled = false;
    loadCustomModelB64(customUrl)
      .then((b64) => !cancelled && setLoaded({ url: customUrl, b64 }))
      .catch(() => !cancelled && setLoaded({ url: customUrl, b64: null }));
    return () => {
      cancelled = true;
    };
  }, [enabled, customUrl]);
  const customB64 = customUrl && loaded?.url === customUrl ? loaded.b64 : undefined;

  // 3. What the viewer should draw. null = not ready to draw yet.
  const config = useMemo(() => {
    if (plan.kind === "none") return null;
    if (plan.kind === "custom" && customB64 === undefined) return null;
    return {
      model: plan.model,
      primary: brand.primaryColor ?? colors.primary,
      secondary: brand.secondaryColor ?? colors.secondary,
      isDark,
      energy: 1,
      reduceMotion,
      // customB64 === null (download failed) → built-in object of the same club.
      custom: plan.kind === "custom" && customB64 ? { b64: customB64, transform: plan.transform } : null,
    };
  }, [plan, customB64, brand.primaryColor, brand.secondaryColor, colors.primary, colors.secondary, isDark, reduceMotion]);

  const run = useCallback((js: string) => webRef.current?.injectJavaScript(`${js};true;`), []);

  useEffect(() => {
    if (viewerReady && config) run(`window.__clubx&&window.__clubx.config(${JSON.stringify(config)})`);
  }, [viewerReady, config, run]);

  const active = focused && appActive;
  useEffect(() => {
    if (viewerReady) run(`window.__clubx&&window.__clubx.${active ? "resume" : "pause"}()`);
  }, [viewerReady, active, config, run]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: { type?: string; status?: string };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "ready") setViewerReady(true);
    else if (msg.type === "status") {
      if (msg.status === "ready" || msg.status === "error") setShown(true); // "error" = viewer already drew the built-in object
      else if (msg.status === "unsupported") setDead(true);
    }
  }, []);

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: size, height: size }}
    >
      {!shown || dead ? <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>{fallback}</View> : null}
      {enabled && html ? (
        <WebView
          ref={webRef}
          source={{ html }}
          originWhitelist={["*"]}
          onMessage={onMessage}
          // The page needs no network: refuse any navigation away from the inline document.
          onShouldStartLoadWithRequest={(req) => req.url === "about:blank" || req.url.startsWith("data:")}
          javaScriptEnabled
          domStorageEnabled={false}
          allowFileAccess={false}
          allowsLinkPreview={false}
          mixedContentMode="never"
          setSupportMultipleWindows={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          androidLayerType="hardware"
          onError={() => setDead(true)}
          onRenderProcessGone={() => setDead(true)}
          onContentProcessDidTerminate={() => setDead(true)}
          style={{ flex: 1, backgroundColor: "transparent", opacity: shown ? 1 : 0 }}
        />
      ) : null}
    </View>
  );
}
