"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
  useRef,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import StarCanvas from "@/components/map/star-canvas";
import MapHUD from "@/components/map/map-hud";
import {
  parseCoordinate,
  isValidLatitude,
  isValidLongitude,
} from "@/lib/utils";
import React from "react";

// Interfaces (unchanged)
interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
  bv?: number;
  name?: string | null;
}
interface DSO {
  id: number;
  name: string;
  messier: string;
  ra: number;
  dec: number;
  mag: number;
  type: string;
  color: string;
}
interface Constellation {
  id: string;
  name: string;
  center: [number, number];
  lines: Array<Array<[number, number]>>;
}
export interface MinorBodies {
  id: number;
  name: string;
  type: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  description: string;
}
export interface Satellites {
  id: number;
  name: string;
  type: string;
  color: string;
  tle1: string;
  tle2: string;
  description: string;
}
export interface MeteorShower {
  id: number;
  name: string;
  constellation: string;
  ra: number;
  dec: number;
  peak: string;
  activeStart: string;
  activeEnd: string;
  zhr: number;
  color: string;
  description: string;
}
export interface HoveredStar {
  id: number | string;
  name?: string | null;
  mag: number;
  bv?: number;
  alt: number;
  az: number;
  type?: string;
}
interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean;
  minorBodies: boolean;
  satellites: boolean;
  meteorShowers: boolean;
  gridHorizontal?: boolean;
  gridEquatorial?: boolean;
}

const DEFAULT_COORDS = { lat: -6.175, lon: 106.82 } as const;
const CLOCK_INTERVAL_MS = 1000;
const DEFAULT_ZOOM = 0.1;
const DEBOUNCE_DELAY = 300;

/** Custom hook to fetch astronomy data */
function useAstronomyData(searchQuery: string, filters: MapFilters) {
  const [data, setData] = useState<{
    stars: Star[];
    dsos: DSO[];
    constellations: Constellation[];
    solarSystem: any[];
    minorBodies: MinorBodies[];
    satellites: Satellites[];
    meteorShowers: MeteorShower[];
    searchResults: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup previous request
    if (abortRef.current) abortRef.current.abort();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    abortRef.current = new AbortController();
    debounceTimer.current = setTimeout(async () => {
      try {
        setLoading(true);
        const queryParams = new URLSearchParams({
          q: searchQuery,
        });
        const response = await fetch(
          `/api/object-astronomies?${queryParams.toString()}`,
          {
            signal: abortRef.current?.signal,
          },
        );
        if (!response.ok) throw new Error("Failed to load sky catalog");
        const json = await response.json();
        setData({
          stars: json.stars,
          dsos: json.dsos,
          constellations: json.constellations,
          solarSystem: json.solarSystem,
          minorBodies: json.minorBodies,
          satellites: json.satellites,
          meteorShowers: json.meteorShowers,
          searchResults: json.searchResults,
        });
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Connection error");
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_DELAY);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  return { data, loading, error };
}

/** Main map content component */
function MapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Parse coordinates from URL
  const lat = parseCoordinate(searchParams.get("lat"), DEFAULT_COORDS.lat);
  const lon = parseCoordinate(searchParams.get("lon"), DEFAULT_COORDS.lon);

  const initialQuery = searchParams.get("q") ?? "";
  const initialFilters: MapFilters = {
    constellations: searchParams.get("constellations") !== "false",
    faintStars: searchParams.get("faintStars") !== "false",
    planets: searchParams.get("planets") !== "false",
    atmosphere: searchParams.get("atmosphere") !== "false",
    gridHorizontal: searchParams.get("gridHorizontal") !== "false",
    gridEquatorial: searchParams.get("gridEquatorial") !== "false",
    minorBodies: searchParams.get("minorBodies") !== "false",
    satellites: searchParams.get("satellites") !== "false",
    meteorShowers: searchParams.get("meteorShowers") !== "false",
  };

  // Local UI state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<MapFilters>(initialFilters);
  const [activeTarget, setActiveTarget] = useState<any | null>(null);
  const [hoveredStar, setHoveredStar] = useState<HoveredStar | null>(null);
  const [time, setTime] = useState(() => new Date());
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [resetKey, setResetKey] = useState(0);

  // Clock tick – runs once on mount
  useEffect(() => {
    const id = window.setInterval(() => {
      setTime((prev) => new Date(prev.getTime() + CLOCK_INTERVAL_MS));
    }, CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Sync URL with UI state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");
    (Object.keys(filters) as Array<keyof MapFilters>).forEach((key) => {
      if (!filters[key]) params.set(key, "false");
      else params.delete(key);
    });
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchQuery, filters, pathname, router]);

  const { data, loading, error } = useAstronomyData(searchQuery, filters);

  const coordinates = useMemo(
    () => ({
      lat,
      lon,
      isValid: isValidLatitude(lat) && isValidLongitude(lon),
    }),
    [lat, lon],
  );

  // Handlers – memoized for reference stability
  const handleStarHover = useCallback(
    (star: HoveredStar | null) => setHoveredStar(star),
    [],
  );
  const toggleFilter = useCallback(
    (key: keyof MapFilters) =>
      setFilters((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );
  const handleSelectTarget = useCallback((target: any) => {
    setActiveTarget(target);
    if (target) setSearchQuery("");
  }, []);
  const handleClearTarget = useCallback(() => setActiveTarget(null), []);
  const handleResetView = useCallback(() => {
    setActiveTarget(null);
    setSearchQuery("");
    setZoomLevel(DEFAULT_ZOOM);
    setResetKey((k) => k + 1);
  }, []);

  if (!coordinates.isValid) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 px-4 text-center font-mono">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
          Invalid Coordinates
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-xs text-sky-400/70">
        SYNCING SERVER DATA...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-xs text-red-400">
        {error}
      </div>
    );
  }

  // Guard against missing data (should not happen but keeps TypeScript happy)
  const {
    stars = [],
    dsos = [],
    constellations = [],
    solarSystem = [],
    minorBodies = [],
    satellites = [],
    meteorShowers = [],
    searchResults = [],
  } = data ?? {};

  return (
    <main className="relative h-full w-full overflow-hidden bg-black">
      <StarCanvas
        key={`canvas-${resetKey}`}
        stars={stars}
        constellations={constellations}
        observer={{ lat, lon }}
        time={time}
        solarSystem={solarSystem}
        onStarHover={handleStarHover}
        filters={filters}
        activeTarget={activeTarget}
        onSelectTarget={handleSelectTarget}
        onClearTarget={handleClearTarget}
        dsos={dsos}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        minorBodies={minorBodies}
        satellites={satellites}
        meteorShowers={meteorShowers}
      />
      <MapHUD
        lat={lat}
        lon={lon}
        time={time}
        filters={filters}
        onToggleFilter={toggleFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        activeTarget={activeTarget}
        onSelectTarget={handleSelectTarget}
        onClearTarget={handleClearTarget}
        setTime={setTime}
        hoveredStar={hoveredStar}
        onCloseStarTooltip={() => setHoveredStar(null)}
        zoomLevel={zoomLevel}
        onResetView={handleResetView}
      />
    </main>
  );
}

// Export memoized component to avoid unnecessary re‑renders
export default React.memo(function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-xs text-sky-400/70">
          INITIALIZING SYSTEM...
        </div>
      }
    >
      <MapContent />
    </Suspense>
  );
});
