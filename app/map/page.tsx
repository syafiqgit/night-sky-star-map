"use client";

import { useCallback, useEffect, useState, Suspense, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import MapHUD from "@/components/map/map-hud";
import {
  parseCoordinate,
  isValidLatitude,
  isValidLongitude,
} from "@/lib/utils";
import StarCanvas, { FOVConfig } from "@/components/map/star-canvas";

// --- Interfaces ---

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
  fovConfig?: FOVConfig;
  // ✨ FITUR BARU: Nilai Skala Bortle (1-9)
  bortleScale: number;
}

const DEFAULT_COORDS = { lat: -6.175, lon: 106.82 } as const;
const CLOCK_INTERVAL_MS = 1000;
const DEFAULT_ZOOM = 0.1;
const DEBOUNCE_DELAY = 300;

interface SkyCatalogData {
  stars: Star[];
  dsos: DSO[];
  constellations: Constellation[];
  solarSystem: any[];
  minorBodies: MinorBodies[];
  satellites: Satellites[];
  meteorShowers: MeteorShower[];
  searchResults: any[];
}

/** * Custom hook untuk fetch data astronomi dengan caching internal
 */
function useAstronomyData(searchQuery: string) {
  const [cachedData, setCachedData] = useState<SkyCatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBackgroundFetching, setIsBackgroundFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    abortRef.current = new AbortController();

    debounceTimer.current = setTimeout(async () => {
      try {
        setCachedData((prev) => {
          if (prev) {
            setIsBackgroundFetching(true);
            return prev;
          }
          setLoading(true);
          return null;
        });

        const queryParams = new URLSearchParams({ q: searchQuery });
        const response = await fetch(
          `/api/object-astronomies?${queryParams.toString()}`,
          { signal: abortRef.current?.signal },
        );

        if (!response.ok) throw new Error("Failed to load sky catalog");
        const json = await response.json();

        setCachedData({
          stars: json.stars || [],
          dsos: json.dsos || [],
          constellations: json.constellations || [],
          solarSystem: json.solarSystem || [],
          minorBodies: json.minorBodies || [],
          satellites: json.satellites || [],
          meteorShowers: json.meteorShowers || [],
          searchResults: json.searchResults || [],
        });
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Connection error");
      } finally {
        setLoading(false);
        setIsBackgroundFetching(false);
      }
    }, DEBOUNCE_DELAY);

    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  return { data: cachedData, loading, isBackgroundFetching, error };
}

/** * Komponen Utama MapContent
 */
function MapContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // 1. Parsing Koordinat & Filter dari URL
  const lat = parseCoordinate(searchParams.get("lat"), DEFAULT_COORDS.lat);
  const lon = parseCoordinate(searchParams.get("lon"), DEFAULT_COORDS.lon);

  const initialQuery = searchParams.get("q") ?? "";

  // ✨ Inisialisasi Filters termasuk Bortle
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
    bortleScale: Number(searchParams.get("bortle")) || 1, // Default ke Bortle 1
  };

  // ✨ Inisialisasi FOV Config dari URL Parameters
  const initialFov: FOVConfig = {
    enabled: searchParams.get("fov_on") === "true",
    type: (searchParams.get("fov_type") as "sensor" | "eyepiece") || "sensor",
    focalLength: Number(searchParams.get("fov_fl")) || 600,
    sensorWidth: Number(searchParams.get("fov_sw")) || 23.6,
    sensorHeight: Number(searchParams.get("fov_sh")) || 15.7,
    eyepieceFocalLength: Number(searchParams.get("fov_efl")) || 25,
    eyepieceAfov: Number(searchParams.get("fov_afov")) || 68,
    color: "rgba(239, 68, 68, 0.85)",
  };

  // 2. Local State
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<MapFilters>(initialFilters);
  const [fovConfig, setFovConfig] = useState<FOVConfig>(initialFov);
  const [activeTarget, setActiveTarget] = useState<any | null>(null);
  const [hoveredStar, setHoveredStar] = useState<HoveredStar | null>(null);
  const [time, setTime] = useState(() => new Date());
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [resetKey, setResetKey] = useState(0);

  // 3. Clock Tick
  useEffect(() => {
    const id = window.setInterval(() => {
      setTime((prev) => new Date(prev.getTime() + CLOCK_INTERVAL_MS));
    }, CLOCK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // 4. Sync URL dengan State (Shallow Update)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");

    params.set("lat", String(lat));
    params.set("lon", String(lon));

    // Sync Filter Display
    (Object.keys(filters) as Array<keyof MapFilters>).forEach((key) => {
      if (key === "fovConfig") return;

      // ✨ Handle khusus untuk bortleScale (Number)
      if (key === "bortleScale") {
        if (filters.bortleScale > 1)
          params.set("bortle", String(filters.bortleScale));
        else params.delete("bortle");
        return;
      }

      // Handle boolean filters
      if (!filters[key as keyof MapFilters]) params.set(key, "false");
      else params.delete(key);
    });

    // ✨ Sync FOV Simulator ke URL
    if (fovConfig.enabled) {
      params.set("fov_on", "true");
      params.set("fov_type", fovConfig.type);
      params.set("fov_fl", String(fovConfig.focalLength));
      if (fovConfig.type === "sensor") {
        params.set("fov_sw", String(fovConfig.sensorWidth));
        params.set("fov_sh", String(fovConfig.sensorHeight));
      } else {
        params.set("fov_efl", String(fovConfig.eyepieceFocalLength));
        params.set("fov_afov", String(fovConfig.eyepieceAfov));
      }
    } else {
      [
        "fov_on",
        "fov_type",
        "fov_fl",
        "fov_sw",
        "fov_sh",
        "fov_efl",
        "fov_afov",
      ].forEach((p) => params.delete(p));
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchQuery, filters, fovConfig, lat, lon, pathname, router]);

  // 5. Fetch Data
  const { data, loading, isBackgroundFetching, error } =
    useAstronomyData(searchQuery);

  // 6. Handlers
  const handleStarHover = useCallback(
    (star: HoveredStar | null) => setHoveredStar(star),
    [],
  );

  // ✨ Diperbarui agar mendukung pengiriman value (untuk Bortle Slider)
  const toggleFilter = useCallback(
    (key: keyof MapFilters, value?: any) =>
      setFilters((prev) => ({
        ...prev,
        [key]: value !== undefined ? value : !prev[key as keyof MapFilters],
      })),
    [],
  );

  const handleUpdateFov = useCallback((newConfig: FOVConfig) => {
    setFovConfig(newConfig);
  }, []);

  const handleSelectTarget = useCallback((target: any) => {
    setActiveTarget(target);
    setSearchQuery("");
  }, []);

  const handleClearTarget = useCallback(() => setActiveTarget(null), []);

  const handleResetView = useCallback(() => {
    setActiveTarget(null);
    setSearchQuery("");
    setZoomLevel(DEFAULT_ZOOM);
    setFovConfig((prev) => ({ ...prev, enabled: false }));
    // Kembalikan Bortle ke 1 saat reset jika diinginkan
    setFilters(initialFilters);
    setResetKey((k) => k + 1);
  }, [initialFilters]);

  const handleTeleportObserver = useCallback(
    (newLat: number, newLon: number) => {
      const params = new URLSearchParams(window.location.search);
      params.set("lat", String(newLat));
      params.set("lon", String(newLon));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  // 7. Render Logic
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-red-400">
        INVALID COORDINATES detected.
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-xs text-sky-400/70">
        INITIALIZING SKY CATALOG...
      </div>
    );
  }

  const skyData = data || {
    stars: [],
    dsos: [],
    constellations: [],
    solarSystem: [],
    minorBodies: [],
    satellites: [],
    meteorShowers: [],
    searchResults: [],
  };

  console.log(
    "total stars:",
    skyData.stars?.length,
    "mag range:",
    Math.min(...skyData.stars.map((s) => s.mag)).toFixed(1),
    "to",
    Math.max(...skyData.stars.map((s) => s.mag)).toFixed(1),
  );

  return (
    <main className="relative h-screen w-full overflow-hidden bg-black">
      <StarCanvas
        key={`canvas-${resetKey}`}
        stars={skyData.stars}
        constellations={skyData.constellations}
        observer={{ lat, lon }}
        time={time}
        solarSystem={skyData.solarSystem}
        onStarHover={handleStarHover}
        // ✨ Filters sekarang membawa state bortleScale ke StarCanvas
        filters={{ ...filters, fovConfig }}
        activeTarget={activeTarget}
        onSelectTarget={handleSelectTarget}
        onClearTarget={handleClearTarget}
        dsos={skyData.dsos}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
        minorBodies={skyData.minorBodies}
        satellites={skyData.satellites}
        meteorShowers={skyData.meteorShowers}
      />
      <MapHUD
        lat={lat}
        lon={lon}
        time={time}
        filters={{ ...filters, fovConfig }}
        onToggleFilter={toggleFilter}
        onUpdateFovConfig={handleUpdateFov}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={skyData.searchResults}
        activeTarget={activeTarget}
        onSelectTarget={handleSelectTarget}
        onClearTarget={handleClearTarget}
        setTime={setTime}
        hoveredStar={hoveredStar}
        onCloseStarTooltip={() => setHoveredStar(null)}
        zoomLevel={zoomLevel}
        onResetView={handleResetView}
        onTeleportObserver={handleTeleportObserver}
        solarSystemObjects={skyData.solarSystem}
      />
      {isBackgroundFetching && (
        <div className="absolute top-4 right-32 z-50 pointer-events-none flex items-center gap-1.5 bg-black/40 border border-white/10 px-2 py-1 rounded-full backdrop-blur-md animate-fadeIn">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping" />
          <span className="text-[8px] font-mono text-slate-400 tracking-wider">
            SYNCING CATALOG
          </span>
        </div>
      )}
      {error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 bg-red-500/20 border border-red-500/50 px-4 py-2 rounded-xl backdrop-blur-md text-[10px] text-red-300 font-mono">
          ERROR: {error}
        </div>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center bg-slate-950 font-mono text-xs text-sky-400/70">
          INITIALIZING GENETIF ENGINE...
        </div>
      }
    >
      <MapContent />
    </Suspense>
  );
}
