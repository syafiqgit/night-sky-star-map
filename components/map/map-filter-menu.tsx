"use client";

import { memo, useState } from "react";
import { Eye, EyeOff, Layers3 } from "lucide-react";
import { type MapFilters } from "./map-hud"; // Mengambil interface dari MapHUD

interface MapFilterMenuProps {
  filters: MapFilters;
  onToggleFilter: (key: keyof MapFilters) => void;
}

const FILTER_LABELS: Record<keyof MapFilters, string> = {
  atmosphere: "Atmosphere",
  constellations: "Constellations",
  faintStars: "Faint Stars",
  planets: "Planets",
};

const PANEL_CLASSNAME = `
  rounded-2xl border border-white/10 bg-black/45 shadow-[0_10px_50px_rgba(0,0,0,0.35)]
  backdrop-blur-2xl supports-[backdrop-filter]:bg-black/35
`;

const FilterButton = memo(function FilterButton({
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
      type="button"
      onClick={onClick}
      className={`group flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all duration-200 ${
        active
          ? "border-sky-500/30 bg-sky-500/10 text-white"
          : "border-white/5 bg-white/3 text-slate-400 hover:border-white/10 hover:bg-white/5"
      }`}
    >
      <span className="text-[11px] font-medium tracking-wide">{label}</span>
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full transition-all ${
          active ? "bg-sky-500/20 text-sky-300" : "bg-white/4 text-slate-600"
        }`}
      >
        {active ? <Eye size={11} /> : <EyeOff size={11} />}
      </div>
    </button>
  );
});

export default function MapFilterMenu({
  filters,
  onToggleFilter,
}: MapFilterMenuProps) {
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  return (
    <div className="pointer-events-auto absolute bottom-24 right-3 z-50 flex flex-col items-end gap-3 md:bottom-auto md:right-6 md:top-16">
      <button
        type="button"
        onClick={() => setShowFilterMenu(!showFilterMenu)}
        className={`
          group flex h-13 w-13 items-center justify-center rounded-2xl border backdrop-blur-2xl transition-all duration-300
          ${
            showFilterMenu
              ? "border-sky-500/30 bg-sky-500/15 text-sky-300 shadow-[0_0_30px_rgba(56,189,248,0.2)]"
              : "border-white/10 bg-black/45 text-slate-300 hover:border-white/20 hover:bg-white/4"
          }
        `}
      >
        <Layers3
          size={19}
          className={`transition-transform duration-300 ${
            showFilterMenu ? "rotate-90" : "group-hover:rotate-12"
          }`}
        />
      </button>

      {showFilterMenu && (
        <div
          className={`w-65 overflow-hidden animate-in slide-in-from-top-2 fade-in ${PANEL_CLASSNAME}`}
        >
          <div className="border-b border-white/5 px-4 py-3 flex items-center gap-2">
            <Layers3 size={14} className="text-sky-400" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">
              Display Filters
            </span>
          </div>
          <div className="space-y-2 p-3">
            {(Object.keys(FILTER_LABELS) as Array<keyof MapFilters>).map(
              (key) => (
                <FilterButton
                  key={key}
                  label={FILTER_LABELS[key]}
                  active={filters[key]}
                  onClick={() => onToggleFilter(key)}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
