"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin, Radio, MousePointer2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HUDProps {
  lat: number;
  lon: number;
  time: Date;
  onTimeChange?: (date: Date) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUTCOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign      = offsetMin >= 0 ? "+" : "−";
  const h         = Math.floor(Math.abs(offsetMin) / 60);
  const m         = Math.abs(offsetMin) % 60;
  return `UTC${sign}${h}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function formatCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(4)}°\u202f${value >= 0 ? pos : neg}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`
        rounded-xl border border-white/[0.07] bg-black/55
        backdrop-blur-xl
        shadow-[0_4px_24px_rgba(0,0,0,0.4)]
        ${className}
      `}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-blue-400/65">
      {children}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MapHUD({ lat, lon, time }: HUDProps) {
  // Cegah hydration error dengan mengecek apakah komponen sudah di mount di sisi client
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Format default untuk Server-Side Rendering (menghindari mismatch)
  let timeStr = "--:--:--";
  let dateStr = "--- --, ----";
  let offsetStr = "UTC±--";

  // Hanya jalankan format lokal jika sudah berjalan di browser (Client-Side)
  if (mounted) {
    timeStr = time.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    dateStr = time.toLocaleDateString("en-US", {
      day:   "2-digit",
      month: "short",
      year:  "numeric",
    });

    offsetStr = formatUTCOffset(time);
  }

  return (
    <div className="flex h-full w-full flex-col justify-between p-4 sm:p-5 font-mono text-white select-none">

      {/* ── Top row ──────────────────────────────────────────────────────── */}
      <div className="pointer-events-auto flex items-start justify-between gap-3">

        {/* Observer coords */}
        <Panel className="px-4 py-3">
          <Label>Observer Position</Label>
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2.5 text-[11px]">
              <MapPin size={9} className="shrink-0 text-blue-400/50" />
              <span className="text-slate-500 w-5 text-[9px]">LAT</span>
              <span className="text-slate-200 tabular-nums">{formatCoord(lat, "N", "S")}</span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px]">
              <span className="ml-5.25 text-slate-500 w-5 text-[9px]">LON</span>
              <span className="text-slate-200 tabular-nums">{formatCoord(lon, "E", "W")}</span>
            </div>
          </div>
        </Panel>

        {/* Live indicator */}
        <Panel className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Radio size={11} className="text-emerald-400/80" />
            <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-400/80">Live</span>
          </div>
        </Panel>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────────── */}
      <div className="pointer-events-auto flex items-end justify-between gap-3">

        {/* Clock */}
        <Panel className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock size={9} className="text-blue-400/60" />
            <Label>Local Time</Label>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums tracking-tight text-white min-w-30 inline-block">
              {timeStr}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-[9px] text-slate-600">
            <span>{dateStr}</span>
            <span>·</span>
            <span>{offsetStr}</span>
          </div>
        </Panel>

        {/* Controls legend */}
        <div className="flex flex-col items-end gap-2">
          <Panel className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[8.5px] uppercase tracking-widest text-slate-500">
                Real-time
              </span>
            </div>
          </Panel>

          <Panel className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <MousePointer2 size={9} className="text-slate-600" />
              <span className="text-[8.5px] text-slate-600">Drag to pan</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}