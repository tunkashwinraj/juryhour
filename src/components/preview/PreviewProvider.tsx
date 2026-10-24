"use client";
// Preview context for every marketing page (rendered by src/app/(site)/layout.tsx).
// Holds the last preview of this tab (sessionStorage handoff, try/catch), the selected tier,
// chosen add-ons, the promo/partner code, the sales-paused flag and the "refused" flag that
// hides pricing everywhere. Also captures first-party attribution once per page load.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PublicCoupon } from "@/lib/coupons";
import { captureAttribution, getAttribution, track, type TrackEvent, type TrackEvents } from "@/lib/attribution";
import {
  clampExtraJurors,
  couponFor,
  isCtaTier,
  isUuid,
  previewHref,
  readStoredPreview,
  writeStoredPreview,
  type CheckoutInput,
  type CtaTier,
  type StoredPreview,
} from "./logic";

// ---------------------------------------------------------------- session store

const DRAFT_URL_KEY = "jh_preview_draft_url";

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

let memory: StoredPreview | null | undefined; // undefined = not read yet
const listeners = new Set<() => void>();

function getSnapshot(): StoredPreview | null {
  if (memory === undefined) memory = readStoredPreview(session());
  return memory;
}
const getServerSnapshot = () => null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function setStored(p: StoredPreview | null) {
  memory = p;
  writeStoredPreview(session(), p);
  for (const l of listeners) l();
}

/** The stored preview, read directly (hydration renders null first; use this in mount effects). */
export function peekStoredPreview(): StoredPreview | null {
  return getSnapshot();
}

/** A URL typed into a quick input on a page without the full form, handed to /#preview. */
export function takeDraftUrl(): string | null {
  try {
    const s = session();
    const v = s?.getItem(DRAFT_URL_KEY) ?? null;
    s?.removeItem(DRAFT_URL_KEY);
    return v;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- context

export type OpenFormOptions = { tier?: CtaTier; mode?: "url" | "pitch"; url?: string };
type FormEntry = { variant: "hero" | "band"; open: (o: OpenFormOptions) => void };

export type PreviewContextValue = {
  /** Last preview of this tab (null before hydration or when none). */
  preview: StoredPreview | null;
  setPreview(p: StoredPreview | null): void;
  /** Inputs a checkout can use: the preview's, or the form's when the preview was skipped (rate limit). */
  checkoutInput: (Omit<CheckoutInput, "email"> & { email: string | null }) | null;
  setDraftInput(i: CheckoutInput | null): void;
  /** True while the last preview was refused: render no pricing anywhere. */
  refused: boolean;
  salesPaused: boolean;
  setSalesPaused(v: boolean): void;
  selectedTier: CtaTier | null;
  selectTier(t: CtaTier | null): void;
  /** Extra jurors (0–20, $16 each) for Quick Read / Verdict / Retest checkouts. */
  extraJurors: number;
  setExtraJurors(n: number): void;
  /** Code typed into "Have a code?" (null = use the attributed ?code=). */
  code: string | null;
  setCode(c: string | null): void;
  /** The code in effect: the typed one, else the attributed ?code= (read after mount). */
  effectiveCode: string | null;
  /** The running coupon (server-validated config, hidden once its end time passes), else null. */
  coupon: PublicCoupon | null;
  /** The coupon when the visitor's code matches it and it applies to `tier`, else null. */
  appliedCoupon(tier: CtaTier): PublicCoupon | null;
  /** ?parent=<order id> from report-page upgrade/retest links. */
  parentOrderId: string | null;
  clearParent(): void;
  /** ?preview=<id> from follow-up emails. */
  linkedPreviewId: string | null;
  /** Scroll to and focus the preview form on this page, or go to /?tier=…#preview. */
  openForm(opts?: OpenFormOptions): void;
  registerForm(entry: FormEntry): () => void;
};

const PreviewContext = createContext<PreviewContextValue | null>(null);

export function PreviewProvider({ children, coupon = null }: { children: ReactNode; coupon?: PublicCoupon | null }) {
  const preview = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [draftInput, setDraftInput] = useState<CheckoutInput | null>(null);
  const [salesPaused, setSalesPaused] = useState(false);
  const [selectedTier, selectTier] = useState<CtaTier | null>(null);
  const [extraJurors, setExtraJurorsRaw] = useState(0);
  const setExtraJurors = useCallback((n: number) => setExtraJurorsRaw(clampExtraJurors(n)), []);
  const [code, setCode] = useState<string | null>(null);
  const [attrCode, setAttrCode] = useState<string | null>(null);
  const [couponLive, setCouponLive] = useState(true);
  const [urlState, setUrlState] = useState<{ parent: string | null; linked: string | null }>({ parent: null, linked: null });
  const forms = useRef<FormEntry[]>([]);

  // Hide the coupon the moment it ends (the static shell can be minutes stale).
  useEffect(() => {
    if (!coupon) return;
    const ms = Date.parse(coupon.endsAt) - Date.now();
    const t = setTimeout(() => setCouponLive(false), Math.max(0, Math.min(ms, 2_147_000_000)));
    return () => clearTimeout(t);
  }, [coupon]);

  useEffect(() => {
    captureAttribution();
    try {
      // Browser-only state (stored attribution, URL params) is read after mount on purpose.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttrCode(getAttribution().code ?? null);
    } catch {
      // no stored attribution
    }
    try {
      const q = new URLSearchParams(window.location.search);
      const parent = q.get("parent");
      const linked = q.get("preview");
      const tier = q.get("tier");
      if (isUuid(parent) || isUuid(linked)) {
        setUrlState({ parent: isUuid(parent) ? parent : null, linked: isUuid(linked) ? linked : null });
      }
      if (isCtaTier(tier)) selectTier(tier);
    } catch {
      // no URL state: fine
    }
  }, []);

  const registerForm = useCallback((entry: FormEntry) => {
    forms.current.push(entry);
    return () => {
      forms.current = forms.current.filter((f) => f !== entry);
    };
  }, []);

  const openForm = useCallback((opts: OpenFormOptions = {}) => {
    if (opts.tier) selectTier(opts.tier);
    const target = forms.current.find((f) => f.variant === "hero") ?? forms.current[0];
    if (target) {
      target.open(opts);
      return;
    }
    if (opts.url) {
      try {
        session()?.setItem(DRAFT_URL_KEY, opts.url.slice(0, 2_000));
      } catch {
        // the visitor retypes it
      }
    }
    window.location.assign(previewHref(opts.tier ?? null));
  }, []);

  const effectiveCode = code ?? attrCode;
  const liveCoupon = coupon && couponLive ? coupon : null;
  const value = useMemo<PreviewContextValue>(() => {
    const checkoutInput = preview && preview.status === "done" ? preview.input : draftInput ? { ...draftInput } : null;
    return {
      preview,
      setPreview: (p) => {
        setStored(p);
        if (p) setDraftInput(null);
      },
      checkoutInput,
      setDraftInput,
      refused: preview?.status === "refused",
      salesPaused,
      setSalesPaused,
      selectedTier,
      selectTier,
      extraJurors,
      setExtraJurors,
      code,
      setCode,
      effectiveCode,
      coupon: liveCoupon,
      appliedCoupon: (tier) => couponFor(tier, liveCoupon, effectiveCode),
      parentOrderId: urlState.parent,
      clearParent: () => setUrlState((s) => ({ ...s, parent: null })),
      linkedPreviewId: urlState.linked,
      openForm,
      registerForm,
    };
  }, [preview, draftInput, salesPaused, selectedTier, extraJurors, setExtraJurors, code, effectiveCode, liveCoupon, urlState, openForm, registerForm]);

  return <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>;
}

const noop = () => {};
/** Outside a provider (e.g. tests, /o pages) everything degrades to "no preview yet". */
const FALLBACK: PreviewContextValue = {
  preview: null,
  setPreview: noop,
  checkoutInput: null,
  setDraftInput: noop,
  refused: false,
  salesPaused: false,
  setSalesPaused: noop,
  selectedTier: null,
  selectTier: noop,
  extraJurors: 0,
  setExtraJurors: noop,
  code: null,
  setCode: noop,
  effectiveCode: null,
  coupon: null,
  appliedCoupon: () => null,
  parentOrderId: null,
  clearParent: noop,
  linkedPreviewId: null,
  openForm: (o) => {
    if (typeof window !== "undefined") window.location.assign(previewHref(o?.tier ?? null));
  },
  registerForm: () => noop,
};

export function usePreview(): PreviewContextValue {
  return useContext(PreviewContext) ?? FALLBACK;
}

// ---------------------------------------------------------------- small helpers for other pages

/**
 * Server pages that know `company_state.sales_paused` render this (inside <Suspense>) so every
 * TierCta flips to "Join the waitlist" before anyone clicks. A 503 from checkout sets it too.
 */
export function SalesStatus({ paused }: { paused: boolean }) {
  const { setSalesPaused } = usePreview();
  useEffect(() => {
    if (paused) setSalesPaused(true);
  }, [paused, setSalesPaused]);
  return null;
}

/** Wrap any pricing block (incl. server-rendered ones) so it disappears while the preview is refused. */
export function HideWhenRefused({ children }: { children: ReactNode }) {
  const { refused } = usePreview();
  return refused ? null : <>{children}</>;
}

/** Fires an analytics event once when its sentinel scrolls into view (e.g. pricing_viewed). */
export function TrackOnView<E extends TrackEvent>({ event, props }: { event: E; props?: TrackEvents[E] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      if (!fired && entries.some((e) => e.isIntersecting)) {
        fired = true;
        track(event, propsRef.current);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [event]);
  return <span ref={ref} aria-hidden="true" style={{ display: "block", height: 1, width: 1 }} />;
}
