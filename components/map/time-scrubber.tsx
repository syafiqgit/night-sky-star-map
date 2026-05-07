"use client";

import { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, FastForward, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface TimeScrubberProps {
  time: Date;
  // Ubah tipe ini agar mendukung Functional State Update (prev => newState)
  onTimeChange: React.Dispatch<React.SetStateAction<Date>>;
}

export default function TimeScrubber({ time, onTimeChange }: TimeScrubberProps) {
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1); // 1x, 10x, 100x
  const [isDragging, setIsDragging] = useState(false);

  // Kalkulasi akurat jam pecahan untuk slider (0.00 hingga 24.00)
  const currentFractionalHour = time.getHours() + time.getMinutes() / 60 + time.getSeconds() / 3600;

  // ─── HANDLER: Geser Slider Jam ──────────────────────────────────────────
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    
    // Perbaikan matematika agar tidak ada error desimal
    const totalSeconds = Math.floor(val * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Menggunakan functional update agar tidak bentrok dengan state rendering
    onTimeChange((prev) => {
      const newDate = new Date(prev);
      newDate.setHours(hours, minutes, seconds, 0);
      return newDate;
    });
  };

  // ─── HANDLER: Geser Hari (Masa Lalu / Masa Depan) ───────────────────────
  const shiftDays = (daysOffset: number) => {
    onTimeChange((prev) => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + daysOffset);
      return newDate;
    });
  };

  // ─── HANDLER: Reset ke Waktu Asli Sekarang ──────────────────────────────
  const handleReset = () => {
    setIsAutoPlay(false);
    setSpeedMultiplier(1);
    onTimeChange(new Date());
  };

  // ─── ENGINE: Auto-play menggunakan RequestAnimationFrame (60 FPS) ───────
  const lastTickRef = useRef<number>(0);
  const requestRef = useRef<number>(0);

  useEffect(() => {
    // Berhenti jika di-pause atau user sedang menahan slider
    if (!isAutoPlay || isDragging) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      lastTickRef.current = 0;
      return;
    }

    const animate = (now: number) => {
      if (!lastTickRef.current) lastTickRef.current = now;
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      // Functional update: Ambil waktu SEBELUMNYA dan tambahkan delta
      // Angka 100 di bawah adalah base speed (1 detik di dunia nyata = 100 milidetik di simulasi)
      onTimeChange((prevTime) => {
        return new Date(prevTime.getTime() + deltaMs * speedMultiplier * 100);
      });

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isAutoPlay, isDragging, speedMultiplier, onTimeChange]);

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 pointer-events-auto z-50">
      <div className="bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col gap-4 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
        
        {/* Top bar: Controls & Info */}
        <div className="flex justify-between items-center px-1">
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <button 
              onClick={() => setIsAutoPlay(!isAutoPlay)}
              className={`p-2 rounded-lg border transition-all ${
                isAutoPlay 
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]" 
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
              title="Play/Pause Simulation"
            >
              {isAutoPlay ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button 
              onClick={handleReset}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors"
              title="Reset to Real-Time"
            >
              <RotateCcw size={16} />
            </button>
            <button 
              onClick={() => setSpeedMultiplier(prev => prev === 1 ? 10 : prev === 10 ? 100 : 1)}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors flex items-center gap-1 text-xs font-mono"
              title="Time Speed"
            >
              <FastForward size={14} /> {speedMultiplier}x
            </button>
          </div>

          {/* Date Shifter (Masa Lalu / Masa Depan) */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
            <button onClick={() => shiftDays(-1)} className="p-1 hover:text-blue-400 text-slate-400 transition-colors" title="Kembali 1 Hari">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center justify-center gap-2 text-slate-300 text-xs font-mono min-w-35">
              <Calendar size={14} className="text-slate-500" />
              {time.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
            <button onClick={() => shiftDays(1)} className="p-1 hover:text-blue-400 text-slate-400 transition-colors" title="Maju 1 Hari">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Bottom bar: Scrubber Slider */}
        <div className="flex items-center gap-4 px-1">
          <div className="text-[11px] font-mono text-slate-500 w-10 text-right">00:00</div>
          <input
            type="range"
            min="0"
            max="24"
            step="0.05" // Resolusi pergerakan ~3 Menit
            value={currentFractionalHour}
            onChange={handleSliderChange}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-grab active:cursor-grabbing focus:outline-none focus:ring-1 focus:ring-blue-500/50
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
              [&::-webkit-slider-thumb]:bg-blue-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(96,165,250,0.8)]"
          />
          <div className="text-[11px] font-mono text-slate-500 w-10">23:59</div>
        </div>
        
      </div>
    </div>
  );
}