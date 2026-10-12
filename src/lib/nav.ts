"use client";
import { create } from "zustand";

export type Screen =
  | { k: "feed" }
  | { k: "activity"; id: string }
  | { k: "recordSetup" }
  | { k: "recording" }
  | { k: "saveActivity" }
  | { k: "manual" }
  | { k: "postComposer" }
  | { k: "segments" }
  | { k: "segment"; slug: string }
  | { k: "maps" }
  | { k: "routes" }
  | { k: "route"; id: string }
  | { k: "routeBuilder" }
  | { k: "clubs" }
  | { k: "club"; slug: string }
  | { k: "event"; clubSlug: string; eventId: string }
  | { k: "challenges" }
  | { k: "challenge"; slug: string }
  | { k: "profile"; id: string }
  | { k: "follows"; id: string; which: "following" | "followers" }
  | { k: "editProfile" }
  | { k: "gear" }
  | { k: "trophies"; id: string }
  | { k: "stats"; id: string }
  | { k: "trainingLog"; id: string }
  | { k: "fitness"; id: string }
  | { k: "notifications" }
  | { k: "search" }
  | { k: "settings" }
  | { k: "premium"; feature?: string }
  | { k: "privacy" }
  | { k: "about" };

export type TabId = "home" | "maps" | "record" | "groups" | "profile";

interface NavState {
  tab: TabId;
  stacks: Record<TabId, Screen[]>;
  sheet: null | { k: "kudosList"; activityId: string } | { k: "commentBox"; target: { activityId: string } | { postId: string }; existing?: string } | { k: "activityOptions"; activityId: string } | { k: "goalEditor" } | { k: "shareActivity"; id: string };
  lastNavAt: number;
  lastDirection: 1 | -1 | 0; // 1 push, -1 pop, 0 tab switch
  setTab: (t: TabId) => void;
  push: (s: Screen, tab?: TabId) => void;
  pop: () => void;
  popToTop: (tab?: TabId) => void;
  reset: (tab: TabId, s: Screen) => void;
  replace: (s: Screen) => void;
  openSheet: (s: NavState["sheet"]) => void;
  closeSheet: () => void;
}

export const screenKey = (s: Screen): string => {
  const keys = Object.keys(s).filter((k) => k !== "k");
  return s.k + (keys.length ? ":" + keys.map((k) => (s as any)[k]).join("-") : "");
};

const initial: Record<TabId, Screen[]> = {
  home: [{ k: "feed" }],
  maps: [{ k: "maps" }],
  record: [{ k: "recordSetup" }],
  groups: [{ k: "clubs" }],
  profile: [{ k: "profile", id: "me" }],
};

export const useNav = create<NavState>((set, get) => ({
  tab: "home",
  stacks: { ...initial },
  sheet: null,
  lastNavAt: 0,
  lastDirection: 0,
  setTab: (t) => {
    const state = get();
    if (state.tab === t) {
      // tapping active tab = pop to top
      const depth = tabDepth[t] ?? 0;
      if (depth > 0) consumeHistory(depth);
      set({ tab: t, stacks: { ...state.stacks, [t]: [state.stacks[t][0]] }, lastNavAt: Date.now(), lastDirection: 0 });
    } else {
      // leaving a tab with pushed screens: keep its stack, but release its history entries
      const outDepth = tabDepth[state.tab] ?? 0;
      if (outDepth > 0) consumeHistory(outDepth);
      set({ tab: t, lastNavAt: Date.now(), lastDirection: 0 });
    }
  },
  push: (s, tab) => {
    const state = get();
    const t = tab ?? state.tab;
    tabDepth[t] = (tabDepth[t] ?? 0) + 1;
    historyPush();
    set({ tab: t, stacks: { ...state.stacks, [t]: [...state.stacks[t], s] }, lastNavAt: Date.now(), lastDirection: 1 });
  },
  pop: () => {
    const state = get();
    const t = state.tab;
    if (state.stacks[t].length > 1) {
      if ((tabDepth[t] ?? 0) > 0) {
        tabDepth[t] = (tabDepth[t] ?? 0) - 1;
        silentBack(); // consume the history entry; store pops immediately below
      }
      set({ stacks: { ...state.stacks, [t]: state.stacks[t].slice(0, -1) }, lastNavAt: Date.now(), lastDirection: -1 });
    }
  },
  popToTop: (tab) => {
    const state = get();
    const t = tab ?? state.tab;
    const depth = tabDepth[t] ?? 0;
    if (depth > 0) consumeHistory(depth);
    set({ stacks: { ...state.stacks, [t]: [state.stacks[t][0]] }, lastNavAt: Date.now(), lastDirection: -1 });
  },
  reset: (tab, s) => {
    const state = get();
    const depth = tabDepth[tab] ?? 0;
    if (depth > 0) consumeHistory(depth);
    set({ tab, stacks: { ...state.stacks, [tab]: [s] }, lastNavAt: Date.now(), lastDirection: 0 });
  },
  replace: (s) => {
    const state = get();
    const t = state.tab;
    const stack = [...state.stacks[t]];
    stack[stack.length - 1] = s;
    set({ stacks: { ...state.stacks, [t]: stack }, lastNavAt: Date.now() });
  },
  openSheet: (s) => {
    if (!get().sheet) {
      sheetDepth = 1;
      historyPush();
    }
    set({ sheet: s });
  },
  closeSheet: () => {
    if (get().sheet) {
      if (sheetDepth > 0) {
        sheetDepth = 0;
        silentBack();
      }
      set({ sheet: null });
    }
  },
}));

// ── Browser history integration ──────────────────────────────────────────────
// Every pushed screen / opened sheet creates a history entry, so the phone's
// back gesture and the browser back button always dismiss the top UI instead
// of leaving the app. Programmatic pops consume their entry silently.
const tabDepth: Record<string, number> = { home: 0, maps: 0, record: 0, groups: 0, profile: 0 };
let sheetDepth = 0;
let silentPops = 0;

function historyPush() {
  if (typeof window === "undefined") return;
  try {
    window.history.pushState({ strideNav: true }, "");
  } catch { /* ignore */ }
}

// remove n entries without firing our own handler logic
function consumeHistory(n: number) {
  if (typeof window === "undefined" || n <= 0) return;
  silentPops++;
  try {
    window.history.go(-n);
  } catch { /* ignore */ }
}

function silentBack() {
  if (typeof window === "undefined") return;
  silentPops++;
  try {
    window.history.back();
  } catch { /* ignore */ }
}

// bind once from the app shell
export function bindHistoryBack() {
  if (typeof window === "undefined" || (window as any).__strideHistoryBound) return;
  (window as any).__strideHistoryBound = true;
  window.addEventListener("popstate", () => {
    if (silentPops > 0) {
      silentPops--;
      return;
    }
    const st = useNav.getState();
    if (st.sheet) {
      sheetDepth = 0;
      st.closeSheet();
      return;
    }
    const t = st.tab;
    if ((tabDepth[t] ?? 0) > 0) {
      tabDepth[t] = (tabDepth[t] ?? 0) - 1;
      // same as pop() but without touching history (the browser already did)
      const stacks = { ...st.stacks, [t]: st.stacks[t].slice(0, -1) };
      useNav.setState({ stacks, lastNavAt: Date.now(), lastDirection: -1 });
    }
    // else: root of tab — default browser behavior applies
  });
}

// ── Global UI state ──────────────────────────────────────────────────────────
interface UIState {
  me: import("./api").Athlete | null;
  unread: number;
  authLoaded: boolean;
  setMe: (me: import("./api").Athlete | null, unread?: number) => void;
  setUnread: (n: number) => void;
  refreshMe: () => Promise<void>;
}

export const useUI = create<UIState>((set) => ({
  me: null,
  unread: 0,
  authLoaded: false,
  setMe: (me, unread) => set({ me, unread: unread ?? 0, authLoaded: true }),
  setUnread: (n) => set({ unread: n }),
  refreshMe: async () => {
    try {
      const { api } = await import("./api");
      const res = await api.get<import("./api").MeResponse>("auth/me");
      set({ me: res.athlete, unread: res.unreadCount, authLoaded: true });
    } catch {
      set({ me: null, authLoaded: true });
    }
  },
}));
