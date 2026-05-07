"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Loader2,
  AlertCircle,
  Layers,
  Eye,
  EyeOff,
  Search,
  Target,
  X,
} from "lucide-react";

import StarCanvas, { type HoveredStar } from "./star-canvas";
import StarTooltip from "./star-tooltip";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
  bv?: number;
  name?: string | null;
}

interface Constellation {
  name: string;
  lines: [number, number][];
}

export interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean;
}

interface Props {
  lat: number;
  lon: number;
  time: Date;
}

function FilterItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg p-2 text-left transition-colors hover:bg-white/5"
    >
      <span
        className={`text-xs font-mono ${
          active ? "text-slate-200" : "text-slate-500"
        }`}
      >
        {label}
      </span>

      {active ? (
        <Eye size={14} className="text-blue-400" />
      ) : (
        <EyeOff size={14} className="text-slate-600" />
      )}
    </button>
  );
}

export default function MapInterface({
  lat,
  lon,
  time,
}: Props) {
  const [stars, setStars] = useState<Star[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [hoveredStar, setHoveredStar] =
    useState<HoveredStar | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const [filters, setFilters] = useState<MapFilters>({
    constellations: true,
    faintStars: true,
    planets: true,
    atmosphere: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTarget, setActiveTarget] =
    useState<Star | null>(null);

  const searchResults = useMemo(() => {
    if (searchQuery.trim().length < 2) return [];

    const q = searchQuery.toLowerCase();

    const planets = getSolarSystemObjects(time);
    const allObjects = [...planets, ...stars];

    return allObjects
      .filter(
        (s) =>
          s.name &&
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [searchQuery, stars, time]);

  const toggleFilter = (key: keyof MapFilters) => {
    setFilters((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleStarHover = useCallback(
    (star: HoveredStar | null) => {
      setHoveredStar(star);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [starsRes, consRes] =
          await Promise.all([
            fetch("/data/stars.json"),
            fetch("/data/constellations.json"),
          ]);

        if (!starsRes.ok || !consRes.ok) {
          throw new Error("Failed to load catalog");
        }

        const [starsData, consData] =
          await Promise.all([
            starsRes.json() as Promise<Star[]>,
            consRes.json() as Promise<
              Constellation[]
            >,
          ]);

        if (!cancelled) {
          const filteredStars =
            starsData.filter(
              (star) =>
                star.id !== 0 &&
                star.name !== "Sol"
            );

          setStars(filteredStars);
          setConstellations(consData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Error loading data"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950">
        <Loader2
          size={22}
          className="animate-spin text-blue-400/70"
        />

        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">
          Loading Star Catalog
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 font-mono">
        <AlertCircle
          size={22}
          className="text-red-400/70"
        />

        <p className="text-[10px] text-slate-600">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <StarCanvas
        stars={stars}
        constellations={constellations}
        observer={{ lat, lon }}
        time={time}
        onStarHover={handleStarHover}
        filters={filters}
        activeTarget={activeTarget}
        onClearTarget={() =>
          setActiveTarget(null)
        }
      />

      <StarTooltip star={hoveredStar} />

      {/* SEARCH PANEL */}
      <div
        className="
          absolute z-50 pointer-events-auto flex flex-col gap-2
          top-24 left-3 right-3
          md:top-32 md:left-6 md:right-auto md:w-72
        "
      >
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search star, Sun, Moon..."
            value={searchQuery}
            onChange={(e) =>
              setSearchQuery(e.target.value)
            }
            className="
              w-full rounded-xl border border-white/10
              bg-black/60 py-3 pl-10 pr-10
              text-sm text-slate-200 shadow-lg
              backdrop-blur-md font-mono
              focus:outline-none focus:border-blue-500/50
            "
          />

          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveTarget(null);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="flex max-h-70 flex-col gap-1 overflow-y-auto rounded-xl border border-white/10 bg-black/80 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in">
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveTarget(s);
                  setSearchQuery("");
                }}
                className="group flex items-center justify-between rounded-lg p-3 text-left transition-colors hover:bg-blue-500/20"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-200 group-hover:text-blue-400">
                    {s.name}
                  </span>

                  <span className="text-[10px] font-mono text-slate-500">
                    Mag {s.mag.toFixed(2)}
                  </span>
                </div>

                <Target
                  size={18}
                  className="text-slate-600 group-hover:text-blue-400"
                />
              </button>
            ))}
          </div>
        )}

        {activeTarget && !searchQuery && (
          <div className="flex items-center justify-between rounded-xl border border-green-500/30 bg-green-500/10 p-3 shadow-[0_0_15px_rgba(34,197,94,0.15)] backdrop-blur-md animate-in fade-in">
            <div className="flex items-center gap-3">
              <Target
                size={20}
                className="animate-pulse text-green-400"
              />

              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-green-400">
                  Target Locked
                </span>

                <span className="font-mono text-sm font-bold text-slate-200">
                  {activeTarget.name}
                </span>
              </div>
            </div>

            <button
              onClick={() =>
                setActiveTarget(null)
              }
              className="rounded p-1 text-green-400/70 hover:bg-green-500/20 hover:text-green-400"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* FILTER PANEL */}
      <div
        className="
          absolute z-50 pointer-events-auto flex flex-col items-end gap-2
          right-3 bottom-24
          md:top-16 md:right-6 md:bottom-auto
        "
      >
        <button
          onClick={() =>
            setShowFilterMenu(!showFilterMenu)
          }
          className={`
            rounded-full border p-3 shadow-lg
            backdrop-blur-md transition-all
            ${
              showFilterMenu
                ? "border-blue-500/50 bg-blue-500/20 text-blue-400"
                : "border-white/10 bg-black/60 text-slate-300 hover:bg-white/10"
            }
          `}
        >
          <Layers size={18} />
        </button>

        {showFilterMenu && (
          <div
            className="
              min-w-60 rounded-xl border border-white/10
              bg-black/80 p-3 shadow-2xl
              backdrop-blur-xl animate-in slide-in-from-top-2 fade-in
            "
          >
            <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
              Display Filters
            </div>

            <div className="flex flex-col gap-1">
              <FilterItem
                label="Atmosphere (Daylight)"
                active={filters.atmosphere}
                onClick={() =>
                  toggleFilter("atmosphere")
                }
              />

              <FilterItem
                label="Constellations"
                active={filters.constellations}
                onClick={() =>
                  toggleFilter(
                    "constellations"
                  )
                }
              />

              <FilterItem
                label="Faint Stars (Mag > 3.5)"
                active={filters.faintStars}
                onClick={() =>
                  toggleFilter("faintStars")
                }
              />

              <FilterItem
                label="Planets & Solar Sys."
                active={filters.planets}
                onClick={() =>
                  toggleFilter("planets")
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}