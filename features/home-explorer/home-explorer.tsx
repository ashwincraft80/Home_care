"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, RotateCcw, X } from "lucide-react";
import { hotspotByKey, hotspots, bookingHref, type HotspotKey } from "./hotspots";
import { StaticHome } from "./static-home";
import { REVEAL_TOTAL } from "./layout";
import { LogoMark } from "@/components/domain/brand";
import { buttonClass } from "@/components/ui/button";
import { trackClientEvent } from "@/lib/analytics/actions";
import { formatMoney, formatMoneyRange } from "@/lib/money";
import { site } from "@/lib/config/site";
import { cn } from "@/lib/cn";

const HomeScene = dynamic(() => import("./scene"), { ssr: false, loading: () => null });

export interface ExplorerCategory {
  slug: string;
  name: string;
  visitFeePaise: number;
  indicativeMinPaise: number | null;
  indicativeMaxPaise: number | null;
}

export interface ExplorerStrings {
  hint: string;
  reset: string;
  listLabel: string;
  loading: string;
  fallback: string;
  book: string;
  close: string;
}

type Mode = "static" | "loading3d" | "3d";
const REVEAL_KEY = "hc_home_reveal_seen_v1";
const READY_TIMEOUT_MS = 10000;

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

interface DeviceProfile {
  skip3d: boolean;
  lowPower: boolean;
  firstVisit: boolean;
}

let cachedProfile: DeviceProfile | null = null;

/** Read once per page load: WebGL support, data-saver, device class and whether the intro was seen. */
function readDeviceProfile(): DeviceProfile {
  if (cachedProfile) return cachedProfile;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const saveData = Boolean(nav.connection?.saveData) || ["slow-2g", "2g"].includes(nav.connection?.effectiveType ?? "");
  const veryLowMemory = (nav.deviceMemory ?? 8) <= 2;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  let firstVisit = false;
  try {
    firstVisit = !localStorage.getItem(REVEAL_KEY);
  } catch {
    /* storage unavailable: treat as returning visitor (no intro) */
  }
  cachedProfile = {
    skip3d: saveData || veryLowMemory || !webglAvailable(),
    lowPower: coarse || (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4,
    firstVisit,
  };
  return cachedProfile;
}
const noopSubscribe = () => () => {};

/** null during server render and hydration; the real profile afterwards. */
function useDeviceProfile(): DeviceProfile | null {
  return useSyncExternalStore(noopSubscribe, readDeviceProfile, () => null);
}

/** The "HomeCare Home Reveal": logo, assembly, warm lights, tagline. ~2 s, first visit only, never blocks. */
function HomeRevealOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-5 z-10 flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.4 } }}
          transition={{ duration: 0.3 }}
          aria-hidden
        >
          <div className="flex items-center gap-2 rounded-full bg-surface/85 px-3 py-1.5 shadow-[var(--shadow-card)] backdrop-blur">
            <LogoMark className="size-6" />
            <span className="font-display text-base font-semibold">{site.brand.name}</span>
          </div>
          <motion.p
            className="font-display text-lg font-medium text-ink"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.35, duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
          >
            {site.brand.tagline}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SelectionPanel({
  hotspot,
  category,
  strings,
  onClose,
}: {
  hotspot: HotspotKey;
  category: ExplorerCategory | undefined;
  strings: ExplorerStrings;
  onClose: () => void;
}) {
  const h = hotspotByKey[hotspot];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), [hotspot]);
  const range = category ? formatMoneyRange(category.indicativeMinPaise, category.indicativeMaxPaise) : null;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-brand uppercase">{h.room}</p>
          <h3 ref={headingRef} tabIndex={-1} className="mt-0.5 font-display text-xl font-semibold text-ink outline-none">
            {h.label}
          </h3>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-lg p-2 text-ink-subtle hover:bg-surface-muted hover:text-ink" aria-label={strings.close}>
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{h.description}</p>
      <ul className="mt-3 grid gap-1.5" aria-label="Common requests">
        {h.options.map((o) => (
          <li key={o}>
            <Link
              href={bookingHref(h, o)}
              className="flex items-center justify-between rounded-lg border border-white/70 bg-white/60 px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-brand-soft"
            >
              {o}
              <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-3 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
        {category ? (
          <>
            <span className="font-semibold text-ink">{category.name}</span> · Visit fee {formatMoney(category.visitFeePaise)}
            {range && <> · typical jobs {range} (indicative)</>}
          </>
        ) : (
          "This service isn't available yet."
        )}
        <p className="mt-1 text-[13px]">{h.nextStep}</p>
      </div>
      {category && (
        <Link href={bookingHref(h)} className={buttonClass("primary", "md", "mt-4 w-full")}>
          {strings.book}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

export function HomeExplorer({ categories, strings }: { categories: ExplorerCategory[]; strings: ExplorerStrings }) {
  const reducedMotion = useReducedMotion() ?? false;
  const profile = useDeviceProfile();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [overlayDone, setOverlayDone] = useState(false);
  const [selected, setSelected] = useState<HotspotKey | null>(null);
  const [hovered, setHovered] = useState<HotspotKey | null>(null);
  const [inView, setInView] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  // Static drawing on the server and on devices that shouldn't run WebGL; 3D otherwise.
  const want3d = Boolean(profile && !profile.skip3d && !failed);
  const mode: Mode = !want3d || (timedOut && !ready) ? "static" : ready ? "3d" : "loading3d";
  const reveal = Boolean(profile?.firstVisit);
  const lowPower = profile?.lowPower ?? true;
  const fallbackNote = Boolean(profile?.skip3d || failed || (timedOut && !ready));

  // Remember that the intro has been seen; never leave a loader hanging.
  useEffect(() => {
    if (!want3d) return;
    try {
      localStorage.setItem(REVEAL_KEY, "1");
    } catch {
      /* ignore */
    }
    // Count only time the page is actually visible: background tabs pause rendering, and a
    // visitor returning to the tab should still get the 3D home rather than a stale fallback.
    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") timer = window.setTimeout(() => setTimedOut(true), READY_TIMEOUT_MS);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [want3d]);

  // Pause rendering when the explorer is off-screen.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onReady = useCallback(() => setReady(true), []);

  const showOverlay = mode === "3d" && reveal && !reducedMotion && !overlayDone;
  useEffect(() => {
    if (!showOverlay) return;
    const t = window.setTimeout(() => setOverlayDone(true), (REVEAL_TOTAL + 0.4) * 1000);
    return () => window.clearTimeout(t);
  }, [showOverlay]);

  const select = useCallback((key: HotspotKey | null) => {
    setSelected(key);
    if (!key) return;
    if (!opened.current) {
      opened.current = true;
      void trackClientEvent("home_explorer_opened", {});
    }
    void trackClientEvent("service_category_selected", { category: hotspotByKey[key].categorySlug, surface: "explorer" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const panel = selected && (
    <SelectionPanel hotspot={selected} category={bySlug[hotspotByKey[selected].categorySlug]} strings={strings} onClose={() => setSelected(null)} />
  );

  return (
    <div id="explore" className="scroll-mt-24">
      <div
        ref={container}
        className="glass-strong glass-sheen relative aspect-[4/3] w-full overflow-hidden rounded-[32px] bg-[radial-gradient(120%_90%_at_70%_0%,rgb(255_244_222/0.9),rgb(244_239_229/0.65)_45%,rgb(226_236_230/0.55)_100%)] sm:aspect-[16/11]"
      >
        {/* Static drawing: first paint, loading state and fallback. */}
        <div className={cn("absolute inset-0 p-4 transition-opacity duration-500 sm:p-8", mode === "3d" && ready ? "opacity-0" : "opacity-100")} aria-hidden={mode === "3d"}>
          <StaticHome selected={selected} onSelect={mode === "3d" ? undefined : select} />
        </div>

        {mode !== "static" && (
          <SceneBoundary onError={() => setFailed(true)}>
            <div className={cn("absolute inset-0 transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")}>
              <HomeScene
                selected={selected}
                hovered={hovered}
                onSelect={select}
                onHover={setHovered}
                reveal={reveal}
                reducedMotion={reducedMotion}
                lowPower={lowPower}
                active={inView}
                onReady={onReady}
              />
            </div>
          </SceneBoundary>
        )}

        <HomeRevealOverlay show={showOverlay} />

        {mode === "loading3d" && (
          <p role="status" className="glass-strong absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-ink-muted">
            {strings.loading}
          </p>
        )}

        <div aria-live="polite" className="glass-strong absolute left-3 top-3 max-w-[70%] rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-muted sm:text-[13px]">
          {hovered && !selected ? (
            <span className="text-ink">
              {hotspotByKey[hovered].label} <span className="font-normal text-ink-muted">· {hotspotByKey[hovered].room}</span>
            </span>
          ) : (
            strings.hint
          )}
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="glass-strong absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink hover:bg-white/90 sm:text-[13px]"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {strings.reset}
          </button>
        )}

        {/* Desktop/tablet panel */}
        <AnimatePresence>
          {selected && (
            <motion.aside
              key={selected}
              aria-label="Selected service"
              className="absolute bottom-3 right-3 top-14 hidden w-[330px] overflow-y-auto rounded-[26px] glass-strong glass-sheen p-5 md:block"
              initial={reducedMotion ? false : { opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {panel}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {fallbackNote && <p className="mt-2 text-center text-xs text-ink-subtle">{strings.fallback}</p>}

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            key={`sheet-${selected}`}
            aria-label="Selected service"
            className="glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-y-auto rounded-t-[32px] p-5 pb-[max(env(safe-area-inset-bottom),20px)] md:hidden"
            initial={reducedMotion ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: 0.26, ease: [0.22, 0.61, 0.36, 1] }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
            {panel}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* The conventional, faster path: a plain list. */}
      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold text-ink-muted">{strings.listLabel}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={strings.listLabel}>
          {hotspots.map((h) => (
            <button
              key={h.key}
              type="button"
              aria-pressed={selected === h.key}
              onClick={() => select(selected === h.key ? null : h.key)}
              onMouseEnter={() => setHovered(h.key)}
              onMouseLeave={() => setHovered(null)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-semibold backdrop-blur-md transition-colors",
                selected === h.key ? "border-brand bg-brand text-white shadow-[0_8px_20px_-10px_rgb(13_107_98/0.7)]" : "border-white/80 bg-white/55 text-ink hover:bg-white/80 hover:text-brand-ink",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
