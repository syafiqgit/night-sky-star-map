"use client";

import { Check, Search, Sparkles, Target, X } from "lucide-react";

interface MapSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  searchResults: any[];
  activeTarget: any | null;
  onSelectTarget: (target: any | null) => void;
  onClearTarget: () => void;
}

const PANEL_CLASSNAME = `
  rounded-2xl border border-white/10 bg-black/45 shadow-[0_10px_50px_rgba(0,0,0,0.35)]
  backdrop-blur-2xl supports-[backdrop-filter]:bg-black/35
`;

export default function MapSearch({
  searchQuery,
  onSearchChange,
  searchResults,
  activeTarget,
  onSelectTarget,
  onClearTarget,
}: MapSearchProps) {
  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-24 z-50 flex flex-col gap-3 md:left-6 md:right-auto md:top-32 md:w-85">
      {/* Input Pencarian */}
      <div className={`relative overflow-hidden ${PANEL_CLASSNAME}`}>
        <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-sky-400/40 to-transparent" />
        <Search
          size={17}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={searchQuery}
          placeholder="Search stars, planets, nebula..."
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-14 w-full bg-transparent pl-12 pr-12 text-sm text-white outline-none placeholder:text-slate-500"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              onSearchChange("");
              onClearTarget();
            }}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Dropdown Hasil Pencarian */}
      {searchResults.length > 0 && (
        <div className={`overflow-hidden ${PANEL_CLASSNAME}`}>
          <div className="border-b border-white/5 px-4 py-3 flex items-center gap-2">
            <Sparkles size={13} className="text-sky-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">
              Search Results
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {searchResults.map((object) => (
              <button
                key={object.id}
                type="button"
                onClick={() => onSelectTarget(object)}
                className="group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-3 text-left transition-all duration-200 hover:border-sky-500/20 hover:bg-sky-500/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-100 transition-colors group-hover:text-sky-300">
                    {object.name}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/3 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                      {object.messier ? `${object.messier} • ` : ""}MAG{" "}
                      {object.mag.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/3 text-slate-500 transition-all group-hover:border-sky-500/20 group-hover:bg-sky-500/10 group-hover:text-sky-300">
                  <Target size={15} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tracking Active Target */}
      {activeTarget && !searchQuery && (
        <div
          className={`overflow-hidden border border-emerald-500/20 bg-emerald-500/10 shadow-[0_10px_40px_rgba(16,185,129,0.12)] ${PANEL_CLASSNAME}`}
        >
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10">
                <Target size={18} className="text-emerald-300 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Check size={12} className="text-emerald-300" />
                  <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                    Tracking Active
                  </span>
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-white">
                  {activeTarget.name}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearTarget}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-emerald-300/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
