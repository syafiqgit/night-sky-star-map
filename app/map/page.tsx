"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import StarCanvas from "@/components/map/star-canvas";
import StarTooltip from "@/components/map/star-tooltip";
import MapHUD from "@/components/map/map-hud";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";
import {
  parseCoordinate,
  isValidLatitude,
  isValidLongitude,
} from "@/lib/utils";

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
  name: string;
  lines: [number, number][];
}
export interface HoveredStar {
  id: number;
  name?: string | null;
  mag: number;
  bv?: number;
  alt: number;
  az: number;
}
interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean;
}

const DEFAULT_COORDS = { lat: -6.175, lon: 106.82 } as const;
const CLOCK_INTERVAL_MS = 1000;

export default function Page() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const lat = parseCoordinate(searchParams.get("lat"), DEFAULT_COORDS.lat);
  const lon = parseCoordinate(searchParams.get("lon"), DEFAULT_COORDS.lon);

  const initialQuery = searchParams.get("q") || "";
  const initialFilters: MapFilters = {
    constellations: searchParams.get("constellations") !== "false",
    faintStars: searchParams.get("faintStars") !== "false",
    planets: searchParams.get("planets") !== "false",
    atmosphere: searchParams.get("atmosphere") !== "false",
  };

  const [stars, setStars] = useState<Star[]>([]);
  const [dsos, setDsos] = useState<DSO[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [solarSystem, setSolarSystem] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [hoveredStar, setHoveredStar] = useState<HoveredStar | null>(null);
  const [activeTarget, setActiveTarget] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<MapFilters>(initialFilters);
  const [time, setTime] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleStarHover = useCallback(
    (star: HoveredStar | null) => setHoveredStar(star),
    [],
  );
  const toggleFilter = useCallback(
    (key: keyof MapFilters) =>
      setFilters((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );

  const coordinates = useMemo(() => {
    return { lat, lon, isValid: isValidLatitude(lat) && isValidLongitude(lon) };
  }, [lat, lon]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => setTime((prev) => new Date(prev.getTime() + CLOCK_INTERVAL_MS)),
      CLOCK_INTERVAL_MS,
    );
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");

    (Object.keys(filters) as Array<keyof MapFilters>).forEach((key) => {
      if (!filters[key]) params.set(key, "false");
      else params.delete(key);
    });

    const newUrl = `${pathname}?${params.toString()}`;
    router.replace(newUrl, { scroll: false });
  }, [searchQuery, filters, pathname, router]);

  useEffect(() => {
    const controller = new AbortController();

    const delayDebounceFn = setTimeout(async () => {
      try {
        if (!stars.length) setLoading(true);

        const queryParams = new URLSearchParams({
          q: searchQuery,
          constellations: filters.constellations.toString(),
          planets: filters.planets.toString(),
        });

        const response = await fetch(
          `/api/object-astronomies?${queryParams.toString()}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) throw new Error("Gagal memuat katalog langit");

        const data = await response.json();

        setStars(data.stars);
        setConstellations(data.constellations);
        setDsos(data.dsos);
        setSolarSystem(data.solarSystem);
        setSearchResults(data.searchResults);

        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Terjadi kesalahan koneksi",
        );
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(delayDebounceFn);
      controller.abort();
    };
  }, [searchQuery, filters]);

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

  return (
    <main className="relative h-full w-full overflow-hidden bg-black">
      <StarCanvas
        stars={stars}
        constellations={constellations}
        observer={{ lat, lon }}
        time={time}
        solarSystem={solarSystem}
        onStarHover={handleStarHover}
        filters={filters}
        activeTarget={activeTarget}
        onClearTarget={() => setActiveTarget(null)}
        dsos={dsos}
      />
      <StarTooltip star={hoveredStar} />
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
        onSelectTarget={(target) => {
          setActiveTarget(target);
          setSearchQuery("");
        }}
        onClearTarget={() => setActiveTarget(null)}
        setTime={setTime}
      />
    </main>
  );
}
