"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import MapHUD from "@/components/map/map-hud";
import MapInterface from "@/components/map/map-interface";
import TimeScrubber from "@/components/map/time-scrubber";

const DEFAULT_LAT = -6.175;
const DEFAULT_LON = 106.82;

function isValidLat(v: number): boolean {
  return Number.isFinite(v) && v >= -90 && v <= 90;
}

function isValidLon(v: number): boolean {
  return Number.isFinite(v) && v >= -180 && v <= 180;
}

export default function Page() {
  const searchParams = useSearchParams();

  // Inisialisasi awal ke waktu saat ini
  const [time, setTime] = useState<Date>(() => new Date());
  
  const rawLat = Number(searchParams.get("lat") ?? DEFAULT_LAT);
  const rawLon = Number(searchParams.get("lon") ?? DEFAULT_LON);

  // ─── PERBAIKAN: Engine Waktu Natural (1 detik per detik) ───
  useEffect(() => {
    const id = setInterval(() => {
      // Gunakan functional update: ambil waktu 'prev' dan tambahkan 1 detik (1000ms)
      // Ini membuat waktu mengalir natural dari titik manapun yang dipilih user
      setTime((prevTime) => new Date(prevTime.getTime() + 1000));
    }, 1000);
    
    return () => clearInterval(id);
  }, []);
  // ──────────────────────────────────────────────────────────

  if (!isValidLat(rawLat) || !isValidLon(rawLon)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 font-mono">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-400">
          Invalid Coordinates
        </div>
        <div className="text-[10px] text-slate-600">
          lat={String(rawLat)} · lon={String(rawLon)}
        </div>
        <div className="text-[9px] text-slate-700">
          Expected: lat ∈ [−90, 90] · lon ∈ [−180, 180]
        </div>
      </div>
    );
  }

  const lat = rawLat;
  const lon = rawLon;

  return (
    <main className="relative h-screen w-full overflow-hidden bg-slate-950">
      <MapInterface lat={lat} lon={lon} time={time} />
      <div className="absolute inset-0 z-20 pointer-events-none">
        <MapHUD lat={lat} lon={lon} time={time} onTimeChange={setTime} />
        <TimeScrubber time={time} onTimeChange={setTime} />
      </div>
    </main>
  );
}