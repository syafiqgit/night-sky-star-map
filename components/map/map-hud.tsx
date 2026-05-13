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
  Maximize2,
  RotateCcw,
  CalendarDays,
  Camera,
  Sun, // Icon tambahan untuk polusi cahaya
} from "lucide-react";
import TimeScrubber from "./time-scrubber";
import StarPanel from "./star-panel";

/* ---------------------------------------------------------------- */
/* Bagian 1: Struktur & Data Peristiwa Langit Internal              */
/* ---------------------------------------------------------------- */

export interface SkyEvent {
  id: string;
  title: string;
  date: string;
  description: string;
  category: "eclipse" | "transit" | "shower" | "conjunction";
  bestObserver: { lat: number; lon: number; name: string };
  targetCamera: {
    targetId?: string | number;
    fallbackRa?: number;
    fallbackDec?: number;
  };
}

const UPCOMING_SKY_EVENTS: SkyEvent[] = [
  {
    id: "evt-eclipse-2026",
    title: "Gerhana Matahari Total",
    date: "2026-08-12T17:45:00Z",
    description:
      "Puncak penutupan bayangan bulan melintasi langit Islandia dan Spanyol.",
    category: "eclipse",
    bestObserver: { lat: 64.1466, lon: -21.9426, name: "Reykjavík, Islandia" },
    targetCamera: { targetId: 0, fallbackRa: 142.5, fallbackDec: 15.2 },
  },
  {
    id: "evt-transit-merc-2032",
    title: "Transit Merkurius",
    date: "2032-11-13T08:00:00Z",
    description:
      "Titik siluet pekat planet Merkurius menyeberangi piringan cerah Matahari.",
    category: "transit",
    bestObserver: { lat: 25.0, lon: 45.0, name: "Timur Tengah / Asia Barat" },
    targetCamera: { targetId: 0 },
  },
  {
    id: "evt-geminids-2026",
    title: "Puncak Meteor Geminids",
    date: "2026-12-14T02:00:00Z",
    description:
      "Hujan meteor paling terang bercahaya kuning-putih dengan ZHR hingga 120/jam.",
    category: "shower",
    bestObserver: { lat: -6.2088, lon: 106.8456, name: "Jakarta, Indonesia" },
    targetCamera: { targetId: 500002, fallbackRa: 7.47, fallbackDec: 33.0 },
  },
];

/* ---------------------------------------------------------------- */
/* Bagian 2: Tipe Dasar & Meta Konfigurasi                          */
/* ---------------------------------------------------------------- */

export interface FOVConfig {
  enabled: boolean;
  type: "sensor" | "eyepiece";
  focalLength: number;
  sensorWidth: number;
  sensorHeight: number;
  eyepieceFocalLength?: number;
  eyepieceAfov?: number;
  color?: string;
  rotation?: number;
}

export interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean;
  minorBodies: boolean;
  satellites: boolean;
  meteorShowers: boolean;
  gridHorizontal?: boolean;
  gridEquatorial?: boolean;
  fovConfig?: FOVConfig;
  // ✨ PROPERTI BARU: BORTLE SCALE
  bortleScale?: number;
}

const SENSOR_PRESETS = [
  { name: "Full Frame (35mm)", w: 36.0, h: 24.0 },
  { name: "APS-C (Sony/Nikon)", w: 23.6, h: 15.7 },
  { name: "APS-C (Canon)", w: 22.3, h: 14.9 },
  { name: "Micro 4/3 (MFT)", w: 17.3, h: 13.0 },
  { name: "ZWO ASI533 (Square)", w: 11.3, h: 11.3 },
];

// Map deskripsi teks untuk setiap level Bortle
const BORTLE_DESCRIPTIONS: Record<number, { title: string; desc: string }> = {
  1: {
    title: "Excellent Dark Sky",
    desc: "Zodiacal light & Milky Way are very vivid. No skyglow.",
  },
  2: {
    title: "Typical Dark Sky",
    desc: "Milky Way highly structured. Skyglow barely visible on horizon.",
  },
  3: {
    title: "Rural Sky",
    desc: "Some skyglow at horizon. Milky Way still appears complex.",
  },
  4: {
    title: "Rural/Suburban Transition",
    desc: "Zodiacal light faint. Skyglow visible in several directions.",
  },
  5: {
    title: "Suburban Sky",
    desc: "Milky Way very faint at zenith. Clouds are brighter than sky.",
  },
  6: {
    title: "Bright Suburban Sky",
    desc: "Milky Way invisible near horizon. Sky looks grayish.",
  },
  7: {
    title: "Suburban/Urban Transition",
    desc: "Milky Way nearly invisible. Entire sky is light brown.",
  },
  8: {
    title: "City Sky",
    desc: "Sky is bright enough to read by. Few stars visible.",
  },
  9: {
    title: "Inner-City Sky",
    desc: "Entire sky glows brightly. Only brightest stars & planets visible.",
  },
};

export interface HoveredStar {
  id: number | string;
  name?: string | null;
  mag: number;
  bv?: number;
  alt: number;
  az: number;
  type?: string;
}

interface HUDProps {
  lat: number;
  lon: number;
  time: Date;
  filters: MapFilters;
  // Diupdate untuk menerima value tambahan (number untuk bortle)
  onToggleFilter: (key: keyof MapFilters, value?: any) => void;
  onUpdateFovConfig?: (newConfig: FOVConfig) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: any[];
  activeTarget: any | null;
  onSelectTarget: (target: any | null) => void;
  onClearTarget: () => void;
  setTime: React.Dispatch<React.SetStateAction<Date>>;
  hoveredStar: HoveredStar | null;
  onCloseStarTooltip: () => void;
  zoomLevel?: number;
  onResetView: () => void;
  onTeleportObserver?: (lat: number, lon: number) => void;
  solarSystemObjects?: any[];
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

const FILTER_META: Record<
  Exclude<keyof MapFilters, "fovConfig" | "bortleScale">,
  { label: string }
> = {
  atmosphere: { label: "Atmosphere" },
  constellations: { label: "Constellations" },
  faintStars: { label: "Faint Stars" },
  planets: { label: "Planets" },
  minorBodies: { label: "Comets & Asteroids" },
  gridHorizontal: { label: "Grid (Alt/Az)" },
  gridEquatorial: { label: "Grid (RA/Dec)" },
  satellites: { label: "Artificial Satellites" },
  meteorShowers: { label: "Meteor Showers" },
};

/* ---------------------------------------------------------------- */
/* Bagian 3: Sub-Komponen UI Pembantu                               */
/* ---------------------------------------------------------------- */

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
        "rounded-2xl border border-white/15 bg-black/40 shadow-[0_12px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-transform hover:scale-[1.02]",
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

const Divider = () => (
  <div className="mx-4 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
);

const SkyEventsMenuPanel = memo(function SkyEventsMenuPanel({
  onSelectEvent,
}: {
  onSelectEvent: (evt: SkyEvent) => void;
}) {
  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case "eclipse":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "transit":
        return "bg-teal-500/20 text-teal-400 border-teal-500/30";
      case "shower":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  return (
    <Panel className="w-72 overflow-hidden z-50 max-h-96 flex flex-col pointer-events-auto">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-sky-400" />
          <Label>Sky Events Roadmap</Label>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {UPCOMING_SKY_EVENTS.map((evt) => (
          <div
            key={evt.id}
            className="group p-3 rounded-xl bg-white/5 border border-white/5 hover:border-sky-500/30 hover:bg-sky-500/10 transition-all duration-200"
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span
                className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getCategoryColor(evt.category)}`}
              >
                {evt.category.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(evt.date).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
            <h4 className="font-semibold text-xs text-slate-100 group-hover:text-sky-300">
              {evt.title}
            </h4>
            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {evt.description}
            </p>
            <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] text-slate-500 truncate max-w-[130px]">
                📍 {evt.bestObserver.name}
              </span>
              <button
                type="button"
                onClick={() => onSelectEvent(evt)}
                className="text-[9px] font-bold text-sky-400 hover:text-sky-300"
              >
                Lihat Simulasi →
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
});

/* ---------------------------------------------------------------- */
/* Bagian 5: Komponen Utama MapHUD                                  */
/* ---------------------------------------------------------------- */

export default function MapHUD({
  lat,
  lon,
  time,
  filters,
  onToggleFilter,
  onUpdateFovConfig,
  searchQuery,
  onSearchChange,
  searchResults,
  activeTarget,
  onSelectTarget,
  onClearTarget,
  setTime,
  hoveredStar,
  onCloseStarTooltip,
  zoomLevel = 0.85,
  onResetView,
  onTeleportObserver,
  solarSystemObjects = [],
}: HUDProps) {
  const [mounted, setMounted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSkyEvents, setShowSkyEvents] = useState(false);
  const [dismissedTargetId, setDismissedTargetId] = useState<any>(null);

  const [internalFov, setInternalFov] = useState<FOVConfig>({
    enabled: false,
    type: "sensor",
    focalLength: 600,
    sensorWidth: 23.6,
    sensorHeight: 15.7,
    eyepieceFocalLength: 25,
    eyepieceAfov: 68,
    color: "rgba(239, 68, 68, 0.85)",
  });

  const currentFovConfig = filters.fovConfig || internalFov;
  const currentBortle = filters.bortleScale || 1;

  const handleUpdateFov = (updates: Partial<FOVConfig>) => {
    const nextConfig = { ...currentFovConfig, ...updates };
    if (onUpdateFovConfig) onUpdateFovConfig(nextConfig);
    else setInternalFov(nextConfig);
  };

  useEffect(() => {
    if (activeTarget) setDismissedTargetId(null);
  }, [activeTarget]);

  const panelStar = useMemo(() => {
    if (hoveredStar) return hoveredStar;
    if (activeTarget && activeTarget.id !== dismissedTargetId)
      return activeTarget;
    return null;
  }, [hoveredStar, activeTarget, dismissedTargetId]);

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

  const fovDegrees = useMemo(() => {
    return Math.max(
      0.000278,
      Math.min(185, (2.5 / zoomLevel) * (180 / Math.PI)),
    );
  }, [zoomLevel]);

  const fovPercentage = useMemo(() => {
    const logMax = Math.log10(185);
    const logMin = Math.log10(0.000278);
    const logCurrent = Math.log10(fovDegrees);
    return Math.max(
      0,
      Math.min(100, ((logMax - logCurrent) / (logMax - logMin)) * 100),
    );
  }, [fovDegrees]);

  const handleApplySkyEvent = (evt: SkyEvent) => {
    setTime(new Date(evt.date));
    if (onTeleportObserver)
      onTeleportObserver(evt.bestObserver.lat, evt.bestObserver.lon);
    if (evt.category === "shower" && !filters.meteorShowers)
      onToggleFilter("meteorShowers");
    else if (evt.category === "eclipse" && !filters.planets)
      onToggleFilter("planets");

    if (evt.targetCamera.targetId !== undefined) {
      const targetObj = solarSystemObjects.find(
        (obj) => String(obj.id) === String(evt.targetCamera.targetId),
      );
      if (targetObj) onSelectTarget(targetObj);
      else {
        onSelectTarget({
          id: evt.targetCamera.targetId,
          name: evt.title,
          type: evt.category === "shower" ? "MeteorShower" : "CelestialEvent",
          ra: evt.targetCamera.fallbackRa ?? 0,
          dec: evt.targetCamera.fallbackDec ?? 0,
          mag: 1.0,
        });
      }
    }
    setShowSkyEvents(false);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-40 select-none font-mono text-white">
      {/* LEFT TOP PANEL */}
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
              placeholder="Search objects..."
              className="h-12 w-full rounded-md bg-black/30 pl-11 pr-10 text-[12px] text-white outline-none focus:bg-black/50 focus:ring-2 focus:ring-sky-400/40 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  onClearTarget();
                }}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:text-white"
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
              <span className="ml-auto text-[8px] font-bold text-sky-300">
                {searchResults.length}
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto py-1.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
              {searchResults.map((obj) => (
                <button
                  key={obj.id}
                  type="button"
                  onClick={() => {
                    onSelectTarget(obj);
                    onSearchChange("");
                  }}
                  className="group mx-1.5 flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-sky-500/20 hover:bg-sky-500/10"
                  style={{ width: "calc(100% - 12px)" }}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-slate-500 group-hover:text-sky-300">
                    <Target size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-slate-100 group-hover:text-sky-200">
                      {obj.name}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-600">
                      {obj.messier ? `${obj.messier} · ` : ""}
                      {obj.type}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        )}
      </div>

      {/* RIGHT TOP PANEL */}
      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setShowSkyEvents((v) => !v);
              if (showFilters) setShowFilters(false);
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur-2xl transition-all relative ${showSkyEvents ? "border-sky-500/30 bg-sky-500/15 text-sky-300 shadow-[0_0_24px_rgba(56,189,248,0.2)]" : "border-white/10 bg-black/50 text-slate-400 hover:text-white"}`}
          >
            <CalendarDays size={16} />
            <span className="absolute top-3 right-3 flex h-1.5 w-1.5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative rounded-full h-1.5 w-1.5 bg-sky-500"></span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowFilters((v) => !v);
              if (showSkyEvents) setShowSkyEvents(false);
            }}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur-2xl transition-all ${showFilters ? "border-sky-500/30 bg-sky-500/15 text-sky-300" : "border-white/10 bg-black/50 text-slate-400"}`}
          >
            <Layers3 size={16} />
          </button>
        </div>

        {showSkyEvents && (
          <SkyEventsMenuPanel onSelectEvent={handleApplySkyEvent} />
        )}

        {showFilters && (
          <Panel className="w-64 overflow-hidden z-50 pointer-events-auto flex flex-col max-h-[calc(100vh-140px)]">
            <div className="flex items-center gap-2 border-b border-white/5 px-3.5 py-2.5 shrink-0">
              <Layers3 size={12} className="text-sky-400" />
              <Label>Display Layers</Label>
            </div>
            <div className="overflow-y-auto p-4 space-y-3.5 border-b border-white/5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 max-h-56">
              {(
                Object.keys(FILTER_META) as Array<
                  Exclude<keyof MapFilters, "fovConfig" | "bortleScale">
                >
              ).map((key) => {
                const on = filters[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onToggleFilter(key)}
                    className={`group flex w-full items-center justify-between rounded-xl border px-3 py-2 transition-all ${on ? "border-sky-500/30 bg-sky-500/15 text-white" : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"}`}
                  >
                    <span className="text-[11px] font-medium">
                      {FILTER_META[key].label}
                    </span>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-full ${on ? "bg-sky-500/30 text-sky-200" : "bg-white/8 text-slate-600"}`}
                    >
                      {on ? <Eye size={10} /> : <EyeOff size={10} />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ✨ BARU: MODUL SKALA BORTLE (Light Pollution) */}
            <div className="p-4 shrink-0 bg-yellow-500/5 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Sun size={12} className="text-yellow-400" />
                  <Label>Light Pollution</Label>
                </div>
                <span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                  Bortle Class {currentBortle}
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={9}
                step={1}
                value={currentBortle}
                onChange={(e) =>
                  onToggleFilter("bortleScale", Number(e.target.value))
                }
                className="w-full accent-yellow-400 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer mb-2"
              />

              <div className="flex flex-col gap-1.5 animate-fadeIn">
                <div className="text-[10px] font-bold text-slate-200 uppercase tracking-tighter">
                  {BORTLE_DESCRIPTIONS[currentBortle].title}
                </div>
                <p className="text-[9px] text-slate-500 leading-relaxed italic">
                  "{BORTLE_DESCRIPTIONS[currentBortle].desc}"
                </p>
              </div>
            </div>

            {/* FOV SIMULATOR */}
            <div className="p-3 shrink-0 bg-red-500/5">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <Camera size={12} className="text-red-400" />
                  <Label>FOV Simulator</Label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateFov({ enabled: !currentFovConfig.enabled })
                  }
                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${currentFovConfig.enabled ? "bg-red-500/20 border-red-500/40 text-red-300" : "bg-white/5 border-white/10 text-slate-500"}`}
                >
                  {currentFovConfig.enabled ? "ON" : "OFF"}
                </button>
              </div>

              {currentFovConfig.enabled && (
                <div className="space-y-2.5 pt-1">
                  <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-black/40 border border-white/5">
                    {(["sensor", "eyepiece"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => handleUpdateFov({ type: t })}
                        className={`text-[9px] py-1 rounded-md transition-all ${currentFovConfig.type === t ? "bg-white/10 text-white shadow-xs" : "text-slate-500"}`}
                      >
                        {t === "sensor" ? "📷 Camera" : "⭕ Okuler"}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-slate-400">Telescope Scope:</span>
                      <span className="text-sky-300 font-bold">
                        {currentFovConfig.focalLength}mm
                      </span>
                    </div>
                    <input
                      type="range"
                      min={100}
                      max={2500}
                      step={50}
                      value={currentFovConfig.focalLength}
                      onChange={(e) =>
                        handleUpdateFov({ focalLength: Number(e.target.value) })
                      }
                      className="w-full accent-sky-400 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>

      {/* BOTTOM PANEL */}
      <div className="pointer-events-auto absolute bottom-4 left-4 right-4 flex flex-col gap-2 sm:bottom-5 sm:left-5 sm:right-5">
        <div className="flex items-end justify-between gap-3">
          <Panel className="px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-sky-400/30">
                <Clock3 size={13} className="text-sky-300" />
              </div>
              <div>
                <Label>Local Time</Label>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-[22px] font-black tabular-nums text-white sm:text-[26px]">
                    {fmt.time}
                  </span>
                  <span className="rounded border border-sky-400/20 bg-sky-400/15 px-1.5 py-0.5 text-[7px] font-semibold text-sky-200">
                    {fmt.offset}
                  </span>
                </div>
                <div className="mt-0.5 text-[8px] text-slate-500">
                  {fmt.date}
                </div>
              </div>
            </div>
          </Panel>

          <TimeScrubber time={time} onTimeChange={setTime} />

          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={onResetView}
              className="group flex h-10 items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 text-slate-300 hover:border-sky-500/30 hover:text-sky-300 shadow-xl backdrop-blur-xl transition-all"
            >
              <RotateCcw
                size={14}
                className="transition-transform group-hover:-rotate-90"
              />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em]">
                Reset View
              </span>
            </button>
            <Panel className="flex items-center gap-2 px-3 py-2">
              <Maximize2 size={10} className="text-sky-400" />
              <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] font-bold tabular-nums text-slate-200">
                    {fovDegrees.toFixed(2)}°
                  </span>
                  <span className="text-[7px] font-medium uppercase tracking-widest text-slate-500">
                    FOV
                  </span>
                </div>
                <div className="mt-0.5 h-0.5 w-16 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full bg-sky-400 transition-all duration-75"
                    style={{ width: `${fovPercentage}%` }}
                  />
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </div>

      <StarPanel
        star={panelStar}
        onTrackStar={onSelectTarget}
        activeTarget={activeTarget}
        onClearTarget={onClearTarget}
        onClose={() => {
          onCloseStarTooltip();
          if (activeTarget && panelStar && activeTarget.id === panelStar.id)
            setDismissedTargetId(activeTarget.id);
        }}
      />
    </div>
  );
}
