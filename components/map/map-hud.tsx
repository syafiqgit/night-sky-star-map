"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  MapPin,
  Radio,
  MousePointer2,
} from "lucide-react";

interface HUDProps {
  lat: number;
  lon: number;
  time: Date;
  onTimeChange?: (date: Date) => void;
}

function formatUTCOffset(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();

  const sign = offsetMin >= 0 ? "+" : "−";

  const h = Math.floor(
    Math.abs(offsetMin) / 60
  );

  const m = Math.abs(offsetMin) % 60;

  return `UTC${sign}${h}${
    m > 0
      ? `:${String(m).padStart(2, "0")}`
      : ""
  }`;
}

function formatCoord(
  value: number,
  pos: string,
  neg: string
): string {
  return `${Math.abs(value).toFixed(4)}° ${
    value >= 0 ? pos : neg
  }`;
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`
        rounded-xl border border-white/[0.07]
        bg-black/55 backdrop-blur-xl
        shadow-[0_4px_24px_rgba(0,0,0,0.4)]
        ${className}
      `}
    >
      {children}
    </div>
  );
}

function Label({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-blue-400/65 sm:text-[8.5px]">
      {children}
    </span>
  );
}

export default function MapHUD({
  lat,
  lon,
  time,
}: HUDProps) {
  const [mounted, setMounted] =
    useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  let timeStr = "--:--:--";
  let dateStr = "--- --, ----";
  let offsetStr = "UTC±--";

  if (mounted) {
    timeStr = time.toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }
    );

    dateStr = time.toLocaleDateString(
      "en-US",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );

    offsetStr = formatUTCOffset(time);
  }

  return (
    <div className="flex h-full w-full flex-col justify-between p-3 font-mono text-white select-none sm:p-5">
      {/* TOP */}
      <div
        className="
          pointer-events-auto
          flex flex-col gap-2
          sm:flex-row sm:items-start sm:justify-between
        "
      >
        {/* Observer */}
        <Panel className="w-full px-3 py-2.5 sm:w-auto sm:px-4 sm:py-3">
          <Label>Observer Position</Label>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px]">
              <MapPin
                size={9}
                className="shrink-0 text-blue-400/50"
              />

              <span className="w-5 text-[8px] text-slate-500 sm:text-[9px]">
                LAT
              </span>

              <span className="tabular-nums text-slate-200 break-all">
                {formatCoord(lat, "N", "S")}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10px] sm:text-[11px]">
              <span className="ml-4.25 w-5 text-[8px] text-slate-500 sm:text-[9px]">
                LON
              </span>

              <span className="tabular-nums text-slate-200 break-all">
                {formatCoord(lon, "E", "W")}
              </span>
            </div>
          </div>
        </Panel>

        {/* Live */}
        <Panel className="self-end px-3 py-2 sm:self-auto sm:px-3 sm:py-2.5">
          <div className="flex items-center gap-2">
            <Radio
              size={10}
              className="text-emerald-400/80"
            />

            <span className="text-[8px] uppercase tracking-[0.2em] text-emerald-400/80 sm:text-[9px]">
              Live
            </span>
          </div>
        </Panel>
      </div>

      {/* BOTTOM */}
      <div
        className="
          pointer-events-auto
          flex flex-col gap-3
          sm:flex-row sm:items-end sm:justify-between
        "
      >
        {/* Clock */}
        <Panel className="w-full px-3 py-3 sm:w-auto sm:px-4 sm:py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Clock
              size={9}
              className="text-blue-400/60"
            />

            <Label>Local Time</Label>
          </div>

          <div className="flex items-baseline gap-2">
            <span
              className="
                inline-block
                min-w-0
                text-xl font-bold tracking-tight
                text-white tabular-nums
                sm:min-w-30 sm:text-2xl
              "
            >
              {timeStr}
            </span>
          </div>

          <div
            className="
              mt-1 flex flex-wrap items-center gap-1
              text-[8px] text-slate-600
              sm:text-[9px]
            "
          >
            <span>{dateStr}</span>

            <span>·</span>

            <span>{offsetStr}</span>
          </div>
        </Panel>

        {/* Controls */}
        <div
          className="
            flex flex-row items-center justify-end gap-2
            sm:flex-col sm:items-end
          "
        >
          <Panel className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />

              <span className="text-[8px] uppercase tracking-widest text-slate-500 sm:text-[8.5px]">
                Real-time
              </span>
            </div>
          </Panel>

          <Panel className="px-3 py-2">
            <div className="flex items-center gap-1.5">
              <MousePointer2
                size={9}
                className="text-slate-600"
              />

              <span className="text-[8px] text-slate-600 sm:text-[8.5px]">
                Drag to pan
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}