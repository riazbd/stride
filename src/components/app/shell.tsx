"use client";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Home, Map as MapIcon, Users, PersonStanding, Search, Bell } from "lucide-react";
import { Screen, TabId, screenKey, useNav, useUI, bindHistoryBack } from "@/lib/nav";
import { api, MeResponse } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { useRecorder, recoverRecording } from "@/lib/recorder";
import { toast } from "@/hooks/use-toast";
import { ScreenErrorBoundary } from "./ErrorBoundary";
import { SplashScreen } from "./brand";

// ── Screen header (used by every screen) ────────────────────────────────────
export function ScreenHeader({
  title, back = true, right, subtitle, onBack, className, transparent,
}: {
  title: React.ReactNode;
  back?: boolean;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  className?: string;
  transparent?: boolean;
}) {
  const nav = useNav();
  return (
    <header
      className={cn(
        "sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border",
        transparent && "border-b-0 bg-background",
        className
      )}
    >
      <div className="h-[52px] flex items-center px-2 gap-1">
        {back && (
          <button
            onClick={onBack ?? nav.pop}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-muted transition-colors"
            aria-label="Back"
          >
            <svg width="11" height="19" viewBox="0 0 11 19">
              <path d="M9.5 1.5L2 9.5L9.5 17.5" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1 px-1.5">
          <div className="text-[16px] font-bold leading-tight truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
        {right && <div className="flex items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}

// ── Screen scroll container ─────────────────────────────────────────────────
export function ScreenBody({ children, className, pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={cn("flex-1 min-h-0", pad && "pb-24", className)}>
      {children}
    </div>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
// "Notch dock": a frosted bar with a circular cutout so the record button sits
// IN the dock instead of pasted on top of it. Geometry (relative to the nav
// box): row 62px, button 60px peeking 24px above the top edge → its center is
// 6px below the top, cutout circle at (50%, 6px) r=34px (button r=30 + 4 gap).
// The record button is a sibling of the masked <nav> so the mask never clips it.
function TabBar() {
  const nav = useNav();
  const me = useUI((s) => s.me);
  const unread = useUI((s) => s.unread);
  const recording = useRecorder((s) => s.state !== "idle");
  const { tab } = nav;

  const goRecord = () => {
    if (recording) {
      nav.push({ k: "recording" }, "record");
      return;
    }
    nav.setTab("record");
  };

  const item = (id: TabId, label: string, icon: React.ReactNode) => (
    <button
      key={id}
      onClick={id === "record" ? goRecord : () => nav.setTab(id)}
      className="relative flex-1 h-full flex flex-col items-center justify-center gap-1"
      aria-label={label}
      aria-current={tab === id}
    >
      <span
        className={cn(
          "relative transition-all duration-200 active:scale-90",
          tab === id ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {icon}
        {id === "home" && unread > 0 && (
          <span className="absolute -top-1 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>
      <span
        className={cn(
          "text-[10px] font-semibold tracking-[0.01em]",
          tab === id ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );

  return (
    <div role="tablist" className="absolute bottom-0 inset-x-0 z-40">
      <nav
        className={cn(
          "bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/78 border-t border-border",
          "pb-[max(12px,env(safe-area-inset-bottom,0px))]",
          "[mask-image:radial-gradient(circle_at_50%_6px,transparent_31.5px,black_32.5px)]",
          "[-webkit-mask-image:radial-gradient(circle_at_50%_6px,transparent_31.5px,black_32.5px)]"
        )}
      >
        <div className="h-[62px] max-w-[430px] mx-auto flex items-stretch">
          {item("home", "Home", <Home size={22} strokeWidth={tab === "home" ? 2.4 : 2} />)}
          {item("maps", "Maps", <MapIcon size={22} strokeWidth={tab === "maps" ? 2.4 : 2} />)}
          <div className="w-[76px] shrink-0" aria-hidden />
          {item("groups", "Groups", <Users size={22} strokeWidth={tab === "groups" ? 2.4 : 2} />)}
          {item("profile", "You", me ? <Avatar athlete={me} size={27} ring={tab === "profile"} /> : <PersonStanding size={22} />)}
        </div>
      </nav>
      {/* Record — the hero action, seated in the notch cut out of the dock */}
      <button
        onClick={goRecord}
        className="absolute left-1/2 -translate-x-1/2 -top-6 w-[60px] h-[60px] rounded-full flex items-center justify-center active:scale-90 transition-transform duration-150"
        aria-label="Record activity"
      >
        {recording && (
          <span className="absolute inset-0 rounded-full border-2 border-primary animate-record-halo" aria-hidden />
        )}
        <span
          className="w-full h-full rounded-full bg-primary flex items-center justify-center"
          style={{ boxShadow: "0 8px 20px -6px rgba(252,76,2,0.45), 0 2px 6px rgba(0,0,0,0.12)" }}
        >
          {recording ? (
            <span className="w-3 h-3 rounded-full bg-primary-foreground" />
          ) : (
            <span className="w-[17px] h-[17px] rounded-full border-[3.5px] border-primary-foreground" />
          )}
        </span>
      </button>
    </div>
  );
}

// ── Screen registry ─────────────────────────────────────────────────────────
import { FeedScreen } from "@/screens/feed";
import { ActivityScreen } from "@/screens/activity";
import { RecordSetupScreen } from "@/screens/record-setup";
import { RecordingScreen } from "@/screens/recording";
import { SaveActivityScreen } from "@/screens/save-activity";
import { ManualActivityScreen } from "@/screens/manual";
import { ImportGpxScreen } from "@/screens/import-gpx";
import { DevicesScreen } from "@/screens/devices";
import { SegmentsScreen } from "@/screens/segments";
import { SegmentScreen } from "@/screens/segment";
import { MapsScreen } from "@/screens/maps";
import { RoutesScreen, RouteScreen } from "@/screens/route";
import { RouteBuilderScreen } from "@/screens/route-builder";
import { ClubsScreen } from "@/screens/clubs";
import { ClubScreen, EventScreen } from "@/screens/club";
import { ChallengesScreen } from "@/screens/challenges";
import { ChallengeScreen } from "@/screens/challenge";
import { ProfileScreen } from "@/screens/profile";
import { FollowsScreen } from "@/screens/follows";
import { EditProfileScreen } from "@/screens/edit-profile";
import { GearScreen } from "@/screens/gear";
import { TrophiesScreen } from "@/screens/trophies";
import { StatsScreen } from "@/screens/stats";
import { TrainingLogScreen } from "@/screens/training-log";
import { FitnessScreen } from "@/screens/fitness";
import { NotificationsScreen } from "@/screens/notifications";
import { SearchScreen } from "@/screens/search";
import { SettingsScreen } from "@/screens/settings";
import { PostComposerScreen } from "@/screens/post-composer";
import { AboutScreen } from "@/screens/about";
import { PaywallScreen } from "@/screens/paywall";
import { PrivacyScreen } from "@/screens/privacy";

function renderScreen(s: Screen): React.ReactNode {
  switch (s.k) {
    case "feed": return <FeedScreen />;
    case "activity": return <ActivityScreen id={s.id} />;
    case "recordSetup": return <RecordSetupScreen />;
    case "recording": return <RecordingScreen />;
    case "saveActivity": return <SaveActivityScreen />;
    case "manual": return <ManualActivityScreen />;
    case "importGpx": return <ImportGpxScreen />;
    case "segments": return <SegmentsScreen />;
    case "segment": return <SegmentScreen slug={s.slug} />;
    case "maps": return <MapsScreen />;
    case "routes": return <RoutesScreen />;
    case "route": return <RouteScreen id={s.id} />;
    case "routeBuilder": return <RouteBuilderScreen />;
    case "clubs": return <ClubsScreen />;
    case "club": return <ClubScreen slug={s.slug} />;
    case "event": return <EventScreen clubSlug={s.clubSlug} eventId={s.eventId} />;
    case "challenges": return <ChallengesScreen />;
    case "challenge": return <ChallengeScreen slug={s.slug} />;
    case "profile": return <ProfileScreen id={s.id === "me" ? "" : s.id} />;
    case "follows": return <FollowsScreen id={s.id} which={s.which} />;
    case "editProfile": return <EditProfileScreen />;
    case "gear": return <GearScreen />;
    case "trophies": return <TrophiesScreen id={s.id} />;
    case "stats": return <StatsScreen id={s.id} />;
    case "trainingLog": return <TrainingLogScreen id={s.id} />;
    case "fitness": return <FitnessScreen id={s.id} />;
    case "notifications": return <NotificationsScreen />;
    case "search": return <SearchScreen />;
    case "settings": return <SettingsScreen />;
    case "devices": return <DevicesScreen />;
    case "postComposer": return <PostComposerScreen />;
    case "premium": return <PaywallScreen feature={s.feature} />;
    case "privacy": return <PrivacyScreen />;
    case "about": return <AboutScreen />;
    default: return <div className="p-6 text-muted-foreground">Coming soon</div>;
  }
}

// ── The animated screen host ────────────────────────────────────────────────
function ScreenHost() {
  const tab = useNav((s) => s.tab);
  const stack = useNav((s) => s.stacks[s.tab]);
  const direction = useNav((s) => s.lastDirection);
  const pop = useNav((s) => s.pop);
  const top = stack[stack.length - 1];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // reset scroll on screen change
    scrollRef.current?.scrollTo({ top: 0 });
  }, [top]);

  const isRoot = stack.length === 1;
  const variants = {
    enter: (dir: number) => (dir > 0 ? { x: "100%" } : dir < 0 ? { x: "-14%", opacity: 0.6 } : { opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => (dir > 0 ? { x: "-14%", opacity: 0.6 } : dir < 0 ? { x: "100%" } : { opacity: 0 }),
  };

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar relative">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={tab + "-" + screenKey(top)}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.9 }}
          className={cn(
            "absolute inset-0 flex flex-col bg-background",
            top.k !== "recording" && top.k !== "saveActivity" && !isRoot && "shadow-[8px_0_24px_-12px_rgba(0,0,0,0.15)]"
          )}
        >
          <ScreenErrorBoundary screenKey={screenKey(top)} onBack={stack.length > 1 ? pop : undefined}>
            {renderScreen(top)}
          </ScreenErrorBoundary>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Root app (after auth) ───────────────────────────────────────────────────
export function AppShell() {
  const stackTop = useNav((s) => s.stacks[s.tab].slice(-1)[0]);
  // recording/save: focused flows. routeBuilder: immersive fullscreen tool (like Strava).
  const hideTabs = stackTop.k === "recording" || stackTop.k === "saveActivity" || stackTop.k === "routeBuilder";

  // phone back gesture / browser back pops screens & sheets instead of leaving
  useEffect(() => {
    bindHistoryBack();
    // register the service worker for offline support / PWA installability
    if ("serviceWorker" in navigator && (window as any).__strideSw !== true) {
      (window as any).__strideSw = true;
      navigator.serviceWorker.register("/sw.js").catch(() => { /* offline support unavailable */ });
    }
    // an activity left behind by a closed or crashed tab comes back first
    recoverRecording().then((where) => {
      if (!where) return;
      useNav.getState().push({ k: where }, "record");
      toast({
        description: where === "recording"
          ? "We recovered your unfinished activity. It is paused — resume or finish it."
          : "Your last activity hasn't been uploaded yet. Save it now.",
      });
    });
  }, []);

  return (
    <div className="relative flex flex-col h-[100dvh] max-w-[430px] mx-auto bg-background overflow-hidden md:border-x md:border-border">
      <ScreenHost />
      <AnimatePresence>
        {!hideTabs && (
          <motion.div
            key="tabbar"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ type: "spring", stiffness: 420, damping: 42 }}
            className="absolute bottom-0 inset-x-0 z-40"
          >
            <TabBar />
          </motion.div>
        )}
      </AnimatePresence>
      <Sheets />
    </div>
  );
}

// ── Sheets (bottom drawers) ─────────────────────────────────────────────────
import { KudosListSheet, CommentBoxSheet, ActivityOptionsSheet, GoalEditorSheet } from "@/screens/sheets";

function Sheets() {
  const sheet = useNav((s) => s.sheet);
  return (
    <AnimatePresence>
      {sheet && (
        sheet.k === "kudosList" ? <KudosListSheet key="k" activityId={sheet.activityId} />
        : sheet.k === "commentBox" ? <CommentBoxSheet key="c" target={sheet.target} />
        : sheet.k === "activityOptions" ? <ActivityOptionsSheet key="o" activityId={sheet.activityId} />
        : sheet.k === "goalEditor" ? <GoalEditorSheet key="g" />
        : null
      )}
    </AnimatePresence>
  );
}

// ── Auth bootstrap + splash ─────────────────────────────────────────────────
const SPLASH_MIN_MS = 1850; // let the brand animation complete before entering

export function StrideApp() {
  const [phase, setPhase] = useState<"loading" | "auth" | "app">("loading");
  const { setMe, setUnread, refreshMe } = useUI();
  const qc = useQueryClient();
  const { setTheme } = useTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const hold = new URLSearchParams(window.location.search).has("holdSplash");
      // the brand animation should always finish, even on a fast session restore
      const minDelay = new Promise((r) => setTimeout(r, hold ? 30000 : reduced ? 300 : SPLASH_MIN_MS));
      let next: "auth" | "app" = "auth";
      try {
        const res = await api.get<MeResponse>("auth/me");
        setMe(res.athlete, res.unreadCount);
        // appearance syncs from the account (cross-device, like Strava)
        if (res.athlete.theme === "light" || res.athlete.theme === "dark") setTheme(res.athlete.theme);
        next = "app";
      } catch {
        setMe(null);
        next = "auth";
      }
      await minDelay;
      if (alive) setPhase(next);
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-elevation">
      <div className="relative w-full h-full md:h-[min(100dvh,900px)] md:max-w-[430px] md:rounded-3xl md:overflow-hidden md:shadow-2xl bg-background">
        <AnimatePresence mode="wait">
          {phase === "loading" && (
            <motion.div
              key="splash"
              className="absolute inset-0"
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 0.32, ease: "easeInOut" }}
            >
              <SplashScreen />
            </motion.div>
          )}
          {phase === "auth" && (
            <motion.div key="auth" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <LoginGate
                onAuthed={async () => {
                  await refreshMe();
                  await qc.invalidateQueries();
                  // never enter the app half-authenticated (cookie rejected etc.)
                  // — that state renders as permanent skeletons, so surface it here
                  if (!useUI.getState().me) {
                    throw new Error("Signed in, but the session couldn't be saved. If your browser blocks cookies, allow them for this site and try again.");
                  }
                  setPhase("app");
                }}
              />
            </motion.div>
          )}
          {phase === "app" && (
            <motion.div key="app" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <AppShell />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Login / signup gate — imported lazily to keep splash light
import { LoginGate } from "@/screens/login";
