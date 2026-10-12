"use client";
import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  MARK_PATH, MARK_STROKE, MARK_DOT, WM_LETTERS, WM_W,
  EMBER_LIGHT, EMBER_CORE, EMBER_HOT,
} from "./brand-data";

// Ember gradient stops shared by every brand SVG in the app.
const EMBER_STOPS = [
  { offset: "0", color: EMBER_LIGHT },
  { offset: "0.45", color: EMBER_CORE },
  { offset: "1", color: EMBER_HOT },
] as const;

const INK = "#17161D";
const useSafeId = () => React.useId().replace(/[^a-zA-Z0-9]/g, "");

// ── Route-S mark ─────────────────────────────────────────────────────────────
// size renders the 512 viewBox. `ink` variant for light surfaces.
export function StrideMark({
  size = 48, className, ink = false, dotRing,
}: {
  size?: number; className?: string; ink?: boolean; dotRing?: string;
}) {
  const gid = useSafeId();
  const ring = dotRing ?? (ink ? "#FFFFFF" : "#0B0A0F");
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} className={className} aria-label="STRIDE">
      <defs>
        <linearGradient id={gid} x1="0" y1="94" x2="0" y2="424" gradientUnits="userSpaceOnUse">
          {EMBER_STOPS.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
        </linearGradient>
      </defs>
      <path
        d={MARK_PATH} fill="none" strokeWidth={MARK_STROKE} strokeLinecap="round"
        stroke={ink ? INK : `url(#${gid})`}
      />
      <circle
        cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r}
        fill={ink ? EMBER_CORE : "#FFFFFF"} stroke={ring} strokeWidth={10}
      />
    </svg>
  );
}

// ── STRIDE wordmark (Archivo Black outlines, continuous ember gradient) ──────
// height = cap height in px; width follows the lockup ratio.
export function StrideWordmark({ height = 18, className }: { height?: number; className?: string }) {
  const gid = useSafeId();
  const width = height * (WM_W / 100);
  return (
    <svg viewBox={`0 0 ${WM_W} 100`} width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2={WM_W} y2="0" gradientUnits="userSpaceOnUse">
          {EMBER_STOPS.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
        </linearGradient>
      </defs>
      {WM_LETTERS.map((l, i) => <path key={i} d={l.d} fill={`url(#${gid})`} />)}
    </svg>
  );
}

// ── Animated splash screen ───────────────────────────────────────────────────
// The route draws itself like a live GPS recording; the start dot pops with a
// ping; the wordmark wipes in left-to-right; the tagline settles.
export function SplashScreen() {
  const reduced = useReducedMotion();
  const markSize = 148;
  const wmHeight = (markSize * 1.18) / (WM_W / 100); // wordmark = 1.18x mark width
  const wmWidth = markSize * 1.18;
  const mgid = useSafeId();
  const wgid = useSafeId();
  const cid = useSafeId();

  const draw = { duration: 0.85, ease: [0.65, 0, 0.35, 1] as const };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden bg-[#07060B]">
      {/* ambient glows */}
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(58% 42% at 50% 31%, rgba(252,76,2,0.17), transparent 70%)" }}
        initial={{ opacity: 0 }} animate={{ opacity: reduced ? 1 : [0, 1, 0.85] }}
        transition={{ duration: reduced ? 0 : 1.1, times: [0, 0.7, 1] }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ background: "radial-gradient(52% 36% at 74% 90%, rgba(255,47,94,0.09), transparent 70%)" }}
        initial={{ opacity: 0 }} animate={{ opacity: reduced ? 1 : 1 }}
        transition={{ duration: reduced ? 0 : 1.6, delay: reduced ? 0 : 0.2 }}
      />

      <div className="relative flex flex-col items-center" style={{ transform: "translateY(-6%)" }}>
        {/* mark: dot pops, then the route records itself from the dot */}
        <svg viewBox="0 0 512 512" width={markSize} height={markSize}>
          <defs>
            <linearGradient id={mgid} x1="0" y1="94" x2="0" y2="424" gradientUnits="userSpaceOnUse">
              {EMBER_STOPS.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
            </linearGradient>
          </defs>
          <motion.path
            d={MARK_PATH} fill="none" stroke={`url(#${mgid})`}
            strokeWidth={MARK_STROKE} strokeLinecap="round"
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.32, ...draw }}
          />
          {!reduced && [0, 1].map((i) => (
            <motion.circle
              key={i} cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r}
              fill="none" stroke={EMBER_CORE} strokeWidth={3}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: 2.15, opacity: [0, 0.55, 0] }}
              transition={{ delay: 0.14 + i * 0.5, duration: 1.15, ease: "easeOut", repeat: 3, repeatDelay: 0.12 }}
            />
          ))}
          <motion.circle
            cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r}
            fill="#FFFFFF" stroke="#0B0A0F" strokeWidth={10}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={{ scale: reduced ? 1 : 0 }}
            animate={{ scale: 1 }}
            transition={reduced ? { duration: 0 } : { delay: 0.1, type: "spring", stiffness: 420, damping: 17 }}
          />
        </svg>

        {/* wordmark: gradient wipes across left-to-right */}
        <svg viewBox={`0 0 ${WM_W} 100`} width={wmWidth} height={wmHeight} className="mt-9">
          <defs>
            <linearGradient id={wgid} x1="0" y1="0" x2={WM_W} y2="0" gradientUnits="userSpaceOnUse">
              {EMBER_STOPS.map((s) => <stop key={s.offset} offset={s.offset} stopColor={s.color} />)}
            </linearGradient>
            <clipPath id={cid}>
              <motion.rect
                x={-8} y={-8} width={WM_W + 16} height={116}
                style={{ transformBox: "fill-box", transformOrigin: "left" }}
                initial={{ scaleX: reduced ? 1 : 0 }}
                animate={{ scaleX: 1 }}
                transition={reduced ? { duration: 0 } : { delay: 0.98, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              />
            </clipPath>
          </defs>
          <g clipPath={`url(#${cid})`}>
            {WM_LETTERS.map((l, i) => <path key={i} d={l.d} fill={`url(#${wgid})`} />)}
          </g>
        </svg>

        {/* tagline */}
        <motion.div
          className="mt-[18px] text-[10.5px] font-semibold leading-none select-none"
          style={{ letterSpacing: "0.32em" }}
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 5, letterSpacing: "0.5em" }}
          animate={reduced ? {} : { opacity: 1, y: 0, letterSpacing: "0.32em" }}
          transition={{ delay: 1.3, duration: 0.45, ease: "easeOut" }}
        >
          <span className="text-white/40">BUILT FOR </span>
          <span className="text-white/85">THE LONG RUN</span>
        </motion.div>
      </div>

      {/* recording shimmer */}
      {!reduced && (
        <motion.div
          className="absolute bottom-[76px] h-[2px] w-[110px] rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${EMBER_CORE}, ${EMBER_HOT}, transparent)` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.2, 0.85, 0.2], scaleX: [0.55, 1, 0.55] }}
          transition={{ delay: 0.75, duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </div>
  );
}
