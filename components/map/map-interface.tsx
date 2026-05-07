"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Layers, Eye, EyeOff, Search, Target, X } from "lucide-react";
import StarCanvas, { type HoveredStar } from "./star-canvas";
import StarTooltip from "./star-tooltip";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

interface Star { id: number; ra: number; dec: number; mag: number; bv?: number; name?: string | null; }
interface Constellation { name: string; lines: [number, number][]; }

// ─── [BARU] Tambahkan properti atmosphere ────────────────────────────────────
export interface MapFilters {
  constellations: boolean;
  faintStars: boolean;
  planets: boolean;
  atmosphere: boolean; 
}

interface Props { lat: number; lon: number; time: Date; }

function FilterItem({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full p-2 hover:bg-white/5 rounded-lg transition-colors text-left">
      <span className={`text-xs font-mono ${active ? "text-slate-200" : "text-slate-500"}`}>{label}</span>
      {active ? <Eye size={14} className="text-blue-400" /> : <EyeOff size={14} className="text-slate-600" />}
    </button>
  );
}

export default function MapInterface({ lat, lon, time }: Props) {
  const [stars, setStars] = useState<Star[]>([]);
  const [constellations, setConstellations] = useState<Constellation[]>([]);
  const [hoveredStar, setHoveredStar] = useState<HoveredStar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFilterMenu, setShowFilterMenu] = useState(false);
  
  // ─── [BARU] Inisialisasi atmosphere = true secara default ────────────────
  const [filters, setFilters] = useState<MapFilters>({
    constellations: true,
    faintStars: true,
    planets: true,
    atmosphere: true, 
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTarget, setActiveTarget] = useState<Star | null>(null);

  const searchResults = useMemo(() => {
    if (searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase();
    const planets = getSolarSystemObjects(time);
    const allObjects = [...planets, ...stars];
    return allObjects.filter(s => s.name && s.name.toLowerCase().includes(q)).slice(0, 5);
  }, [searchQuery, stars, time]);

  const toggleFilter = (key: keyof MapFilters) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleStarHover = useCallback((star: HoveredStar | null) => { setHoveredStar(star); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [starsRes, consRes] = await Promise.all([ fetch("/data/stars.json"), fetch("/data/constellations.json") ]);
        if (!starsRes.ok || !consRes.ok) throw new Error(`Failed to load catalog`);
        const [starsData, consData] = await Promise.all([ starsRes.json() as Promise<Star[]>, consRes.json() as Promise<Constellation[]> ]);
        if (!cancelled) {
          const filteredStars = starsData.filter((star) => star.id !== 0 && star.name !== "Sol");
          setStars(filteredStars); setConstellations(consData);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error loading data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950">
      <Loader2 size={22} className="animate-spin text-blue-400/70" />
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 font-mono">Loading Star Catalog</p>
    </div>
  );

  if (error) return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-950 font-mono">
      <AlertCircle size={22} className="text-red-400/70" />
      <p className="text-[10px] text-slate-600">{error}</p>
    </div>
  );

  return (
    <div className="relative h-full w-full">
      <StarCanvas
        stars={stars} constellations={constellations} observer={{ lat, lon }} time={time}
        onStarHover={handleStarHover} filters={filters} activeTarget={activeTarget} onClearTarget={() => setActiveTarget(null)}
      />
      <StarTooltip star={hoveredStar} />

      <div className="absolute top-32 left-6 z-50 pointer-events-auto w-72 flex flex-col gap-2">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search star, Sun, Moon..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-black/60 backdrop-blur-md border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-blue-500/50 shadow-lg" />
          {searchQuery && (<button onClick={() => { setSearchQuery(""); setActiveTarget(null); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"><X size={16} /></button>)}
        </div>

        {searchResults.length > 0 && (
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-2 flex flex-col gap-1 shadow-2xl animate-in fade-in">
            {searchResults.map((s) => (
              <button key={s.id} onClick={() => { setActiveTarget(s); setSearchQuery(""); }} className="flex items-center justify-between p-3 hover:bg-blue-500/20 rounded-lg transition-colors text-left group">
                <div className="flex flex-col"><span className="text-sm font-bold text-slate-200 group-hover:text-blue-400">{s.name}</span><span className="text-[10px] font-mono text-slate-500">Mag {s.mag.toFixed(2)}</span></div>
                <Target size={18} className="text-slate-600 group-hover:text-blue-400" />
              </button>
            ))}
          </div>
        )}

        {activeTarget && !searchQuery && (
          <div className="bg-green-500/10 border border-green-500/30 backdrop-blur-md rounded-xl p-3 flex items-center justify-between animate-in fade-in shadow-[0_0_15px_rgba(34,197,94,0.15)]">
            <div className="flex items-center gap-3"><Target size={20} className="text-green-400 animate-pulse" /><div className="flex flex-col"><span className="text-[9px] font-bold text-green-400 tracking-[0.2em] uppercase">Target Locked</span><span className="text-sm font-mono text-slate-200 font-bold">{activeTarget.name}</span></div></div>
            <button onClick={() => setActiveTarget(null)} className="p-1 hover:bg-green-500/20 rounded text-green-400/70 hover:text-green-400"><X size={16} /></button>
          </div>
        )}
      </div>

      <div className="absolute top-16 right-6 z-50 pointer-events-auto flex flex-col items-end gap-2">
        <button onClick={() => setShowFilterMenu(!showFilterMenu)} className={`p-3 rounded-full border transition-all shadow-lg backdrop-blur-md ${showFilterMenu ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : "bg-black/60 border-white/10 text-slate-300 hover:bg-white/10"}`}><Layers size={18} /></button>
        {showFilterMenu && (
          <div className="bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl p-3 flex flex-col gap-2 min-w-50 shadow-2xl animate-in slide-in-from-top-2 fade-in">
            <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1 px-1">Display Filters</div>
            {/* ─── [BARU] Tombol Filter Atmosphere ────────────────────────────── */}
            <FilterItem label="Atmosphere (Daylight)" active={filters.atmosphere} onClick={() => toggleFilter("atmosphere")} />
            <FilterItem label="Constellations" active={filters.constellations} onClick={() => toggleFilter("constellations")} />
            <FilterItem label="Faint Stars (Mag > 3.5)" active={filters.faintStars} onClick={() => toggleFilter("faintStars")} />
            <FilterItem label="Planets & Solar Sys." active={filters.planets} onClick={() => toggleFilter("planets")} />
          </div>
        )}
      </div>
    </div>
  );
}