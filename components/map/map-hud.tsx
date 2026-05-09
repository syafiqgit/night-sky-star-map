"use client";

import { memo, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  Globe2,
  MapPin,
  MousePointer2,
  Layers3,
  Eye,
  EyeOff,
  Search,
  Sparkles,
  Target,
  X,
  Check,
  Crosshair,
} from "lucide-react";
import TimeScrubber from "./time-scrubber";
import StarPanel from "./star-panel";

export interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean;
  gridHorizontal?: boolean; // Penambahan fitur toggle grid Alt/Az
  gridEquatorial?: boolean;
}

export interface HoveredStar {
  id: number;
  name?: string | null;
  mag: number;
  alt: number;
  az: number;
  bv?: number;
  messier?: string;
  type?: string;
  color?: string;
  description?: string;
}

interface HUDProps {
  lat: number;
  lon: number;
  time: Date;
  filters: MapFilters;
  onToggleFilter: (key: keyof MapFilters) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: any[];
  activeTarget: any | null;
  onSelectTarget: (target: any | null) => void;
  onClearTarget: () => void;
  setTime: React.Dispatch<React.SetStateAction<Date>>;
  hoveredStar: HoveredStar | null;
  onCloseStarTooltip: () => void;
}

const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatUTCOffset(date: Date): string {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "−";
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""}`;
}

function fmtCoord(value: number, pos: string, neg: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? pos : neg}`;
}

const FILTER_META: Record<keyof MapFilters, { label: string }> = {
  atmosphere: { label: "Atmosphere" },
  constellations: { label: "Constellations" },
  faintStars: { label: "Faint Stars" },
  planets: { label: "Planets" },
  gridHorizontal: { label: "Grid (Alt/Az)" },
  gridEquatorial: { label: "Grid (RA/Dec)" },
};

const Panel = memo(function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-black/50 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
});

const Label = memo(function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[8px] font-semibold uppercase tracking-[0.24em] text-sky-400/80 sm:text-[9px]">
      {children}
    </span>
  );
});

const Divider = () => <div className="mx-4 h-px bg-white/5" />;

export default function MapHUD({
  lat,
  lon,
  time,
  filters,
  onToggleFilter,
  searchQuery,
  onSearchChange,
  searchResults,
  activeTarget,
  onSelectTarget,
  onClearTarget,
  setTime,
  hoveredStar,
  onCloseStarTooltip,
}: HUDProps) {
  const [mounted, setMounted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fmt = useMemo(() => {
    if (!mounted)
      return { time: "--:--:--", date: "--- --, ----", offset: "UTC±--" };
    return {
      time: TIME_FMT.format(time),
      date: DATE_FMT.format(time),
      offset: formatUTCOffset(time),
    };
  }, [mounted, time]);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 select-none font-mono text-white">
      <div className="pointer-events-auto absolute left-4 top-4 flex w-72 flex-col gap-2 sm:left-5 sm:top-5">
        <Panel>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-400/20">
                <Globe2 size={14} className="text-sky-400" />
              </div>
              <div>
                <Label>Observer</Label>
                <div className="text-[11px] font-semibold text-white">
                  Earth Position
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Live
              </span>
            </div>
          </div>
          <Divider />
          <div className="space-y-1 px-4 py-3">
            {[
              { label: "Latitude", value: fmtCoord(lat, "N", "S") },
              { label: "Longitude", value: fmtCoord(lon, "E", "W") },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={11} className="text-sky-400/60" />
                  <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
                    {label}
                  </span>
                </div>
                <span className="text-[10px] font-medium tabular-nums text-slate-200">
                  {value}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-sky-400/40 to-transparent" />
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search stars, planets, nebula..."
              className="h-12 w-full bg-transparent pl-11 pr-10 text-[12px] text-white outline-none placeholder:text-slate-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  onClearTarget();
                }}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </Panel>

        {searchQuery.length > 0 && searchResults.length > 0 && (
          <Panel className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
              <Sparkles size={11} className="text-sky-400" />
              <Label>Results</Label>
              <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-sky-500/20 text-[8px] font-bold text-sky-300">
                {searchResults.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              {searchResults.map((obj) => (
                <button
                  key={obj.id}
                  type="button"
                  onClick={() => onSelectTarget(obj)}
                  className="group mx-1.5 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-sky-500/20 hover:bg-sky-500/10"
                  style={{ width: "calc(100% - 12px)" }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-slate-500 transition-all group-hover:border-sky-500/20 group-hover:bg-sky-500/10 group-hover:text-sky-300">
                    <Target size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-slate-100 group-hover:text-sky-200">
                      {obj.name}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-600">
                      {obj.messier ? `${obj.messier} · ` : ""}
                      {typeof obj.mag === "number"
                        ? `mag ${obj.mag.toFixed(2)}`
                        : "mag --"}
                    </div>
                  </div>
                  <Crosshair
                    size={12}
                    className="text-slate-600 transition-colors group-hover:text-sky-400"
                  />
                </button>
              ))}
            </div>
          </Panel>
        )}

        {activeTarget && !searchQuery && (
          <div className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/8 shadow-[0_8px_32px_rgba(16,185,129,0.15)] backdrop-blur-2xl">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                <Target size={15} className="animate-pulse text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Check size={10} className="text-emerald-400" />
                  <Label>Tracking</Label>
                </div>
                <div className="mt-0.5 truncate text-[12px] font-semibold text-white">
                  {activeTarget.name}
                </div>
              </div>
              <button
                type="button"
                onClick={onClearTarget}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-400/60 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={[
            "flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur-2xl transition-all duration-200",
            showFilters
              ? "border-sky-500/30 bg-sky-500/15 text-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.2)]"
              : "border-white/10 bg-black/50 text-slate-400 hover:border-white/20 hover:text-white",
          ].join(" ")}
        >
          <Layers3
            size={16}
            className={`transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`}
          />
        </button>

        {showFilters && (
          <Panel className="w-52 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-2.5">
              <Layers3 size={12} className="text-sky-400" />
              <Label>Display</Label>
            </div>
            <div className="space-y-1 p-2">
              {(Object.keys(FILTER_META) as Array<keyof MapFilters>).map(
                (key) => {
                  const on = filters[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleFilter(key)}
                      className={[
                        "group flex w-full items-center justify-between rounded-xl border px-3 py-2 transition-all duration-150",
                        on
                          ? "border-sky-500/25 bg-sky-500/10 text-white"
                          : "border-white/5 bg-white/3 text-slate-500 hover:border-white/10 hover:text-slate-300",
                      ].join(" ")}
                    >
                      <span className="text-[11px] font-medium">
                        {FILTER_META[key].label}
                      </span>
                      <div
                        className={[
                          "flex h-5 w-5 items-center justify-center rounded-full transition-all",
                          on
                            ? "bg-sky-500/20 text-sky-300"
                            : "bg-white/5 text-slate-600",
                        ].join(" ")}
                      >
                        {on ? <Eye size={10} /> : <EyeOff size={10} />}
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          </Panel>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-col gap-2 sm:bottom-5 sm:left-5 sm:right-5">
        <div className="flex items-end justify-between gap-3">
          <Panel className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 ring-1 ring-sky-400/20">
                <Clock3 size={13} className="text-sky-400" />
              </div>
              <div>
                <Label>Local Time</Label>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-[22px] font-black leading-none tracking-tighter tabular-nums text-white sm:text-[26px]">
                    {fmt.time}
                  </span>
                  <span className="rounded border border-sky-400/15 bg-sky-400/10 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                    {fmt.offset}
                  </span>
                </div>
                <div className="mt-0.5 text-[8px] text-slate-600">
                  {fmt.date}
                </div>
              </div>
            </div>
          </Panel>
          <TimeScrubber time={time} onTimeChange={setTime} />

          <div className="flex flex-col items-end gap-1.5">
            <Panel className="px-3 py-2">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                <span className="text-[8px] font-medium uppercase tracking-[0.2em] text-slate-400">
                  Realtime
                </span>
              </div>
            </Panel>
            <Panel className="px-3 py-2">
              <div className="flex items-center gap-1.5">
                <MousePointer2 size={10} className="text-slate-500" />
                <span className="text-[8px] text-slate-500">
                  Drag to navigate
                </span>
              </div>
            </Panel>
          </div>
        </div>
      </div>
      <StarPanel
        star={hoveredStar}
        onTrackStar={onSelectTarget}
        activeTarget={activeTarget}
        onClearTarget={onClearTarget}
        onClose={onCloseStarTooltip}
      />
    </div>
  );
}
