import { memo, useMemo } from "react";
import { Crosshair, X } from "lucide-react";

// Perluas tipe bawaan agar mendukung properti DSO yang masuk saat di-hover
export interface HoveredSkyObject {
  id: number;
  name?: string | null;
  mag: number;
  alt: number;
  az: number;
  bv?: number;
  messier?: string;
  type?: string;
  color?: string;
  description?: string;
}

interface StarTooltipProps {
  star: HoveredSkyObject | null;
  activeTarget: { id: number } | null;
  onTrackStar: (star: HoveredSkyObject) => void;
  onClearTarget: () => void;
  onClose: () => void;
}

const CARDINAL_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
] as const;

// Mengembalikan objek lengkap dengan Suhu & Deskripsi untuk Bintang
function getSpectralDetails(bv?: number) {
  if (bv === undefined) return { class: "—", temp: "—", desc: "Unknown" };
  if (bv < -0.3) return { class: "O", temp: "> 30,000 K", desc: "Hot Blue" };
  if (bv < 0.0)
    return { class: "B", temp: "10,000 - 30,000 K", desc: "Blue-White" };
  if (bv < 0.3) return { class: "A", temp: "7,500 - 10,000 K", desc: "White" };
  if (bv < 0.6)
    return { class: "F", temp: "6,000 - 7,500 K", desc: "Yellow-White" };
  if (bv < 0.8)
    return { class: "G", temp: "5,200 - 6,000 K", desc: "Yellow (Sun-like)" };
  if (bv < 1.4) return { class: "K", temp: "3,700 - 5,200 K", desc: "Orange" };
  return { class: "M", temp: "< 3,700 K", desc: "Red Dwarf/Giant" };
}

// Menentukan warna dot indikator secara dinamis (DSO > Planet > Bintang)
function getIndicatorColor(obj: HoveredSkyObject, isPlanet: boolean): string {
  if (obj.color) return obj.color; // Gunakan warna asli DSO jika tersedia
  if (isPlanet) return "#f59e0b"; // Amber/Gold untuk planet
  if (obj.bv === undefined) return "#ffffff";
  if (obj.bv < 0.0) return "#b8d0ff";
  if (obj.bv < 0.5) return "#ffffff";
  if (obj.bv < 1.0) return "#fff4ea";
  if (obj.bv < 1.5) return "#ffd2a1";
  return "#ff9b9b";
}

function azimuthToCardinal(azimuth: number): string {
  return CARDINAL_DIRECTIONS[Math.round(azimuth / 22.5) % 16];
}

function formatDegree(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}°`;
}

// Penilai Visibilitas berdasarkan Magnitudo
function getVisibilityRating(mag: number): string {
  if (mag < 2.0) return "Urban Sky (Naked Eye)";
  if (mag < 4.5) return "Dark Sky (Naked Eye)";
  if (mag < 6.5) return "Pristine Sky / Binoculars";
  return "Telescope Required";
}

const InfoRow = memo(function InfoRow({
  label,
  value,
  highlight = false,
  subValue,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
  subValue?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="mt-0.5 text-[9px] uppercase tracking-[0.18em] text-slate-500 sm:text-[10px]">
        {label}
      </span>
      <div className="text-right">
        <div
          className={`text-[10px] font-medium tabular-nums sm:text-[11px] ${
            highlight ? "text-amber-300" : "text-slate-100"
          }`}
        >
          {value}
        </div>
        {subValue && (
          <div className="text-[8px] text-slate-400 font-sans tracking-normal sm:text-[9px]">
            {subValue}
          </div>
        )}
      </div>
    </div>
  );
});

export default function StarPanel({
  star,
  activeTarget,
  onTrackStar,
  onClearTarget,
  onClose,
}: StarTooltipProps) {
  const computed = useMemo(() => {
    if (!star) return null;
    const isCurrentlyTracking = activeTarget?.id === star.id;

    // 1. Klasifikasi Tipe Objek
    const isPlanet = star.id <= 0;
    const isDSO = !!star.type || !!star.messier || star.id > 200000;
    const isStar = !isPlanet && !isDSO;

    const spectral = getSpectralDetails(star.bv);
    const indicatorColor = getIndicatorColor(star, isPlanet);

    // 2. Pembuatan Label Dinamis
    let objectTypeLabel = "Celestial Object";
    if (isPlanet) objectTypeLabel = "Solar System Object";
    else if (isDSO)
      objectTypeLabel = `Deep Space Object (${star.type || "DSO"})`;
    else objectTypeLabel = `Class ${spectral.class} Star`;

    let catalogLabel = `ID #${star.id}`;
    if (isPlanet) catalogLabel = "Ephemeris Data";
    else if (isDSO)
      catalogLabel = star.messier
        ? `Messier ${star.messier}`
        : `DSO #${star.id}`;
    else catalogLabel = `HYG #${star.id}`;

    let displayName = star.name || "";
    if (!displayName) {
      if (isPlanet) displayName = "Planet";
      else if (isDSO) displayName = star.messier || `Object #${star.id}`;
      else displayName = `Star #${star.id}`;
    }

    return {
      isPlanet,
      isDSO,
      isStar,
      objectTypeLabel,
      catalogLabel,
      spectralTemp: spectral.temp,
      spectralDesc: spectral.desc,
      indicatorColor,
      cardinal: azimuthToCardinal(star.az),
      isNearHorizon: star.alt < 10,
      isLowAltitude: star.alt < 15,
      displayName,
      visibility: getVisibilityRating(star.mag),
      isCurrentlyTracking,
    };
  }, [star, activeTarget]);

  if (!star || !computed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute right-3 top-24 z-50 w-[min(92vw,22rem)] sm:right-4 sm:top-20"
    >
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/55 font-mono backdrop-blur-2xl shadow-[0_12px_60px_rgba(0,0,0,0.55)] supports-backdrop-filter:bg-black/40">
        <div className="h-px bg-linear-to-r from-transparent via-sky-400/40 to-transparent" />

        <div className="p-4">
          {/* Header Panel */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: computed.indicatorColor }}
                />
                <div className="text-[8px] font-semibold uppercase tracking-[0.26em] text-sky-300/80 sm:text-[9px]">
                  {computed.objectTypeLabel}
                </div>
              </div>
              <h3 className="mt-1.5 truncate text-[15px] font-bold tracking-tight text-white sm:text-[16px]">
                {computed.displayName}
              </h3>
              <p className="mt-0.5 text-[9px] text-slate-500">
                {computed.catalogLabel}
              </p>
            </div>

            {/* Tombol Aksi */}
            <div className="flex items-center gap-1.5">
              {computed.isCurrentlyTracking ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearTarget();
                  }}
                  className="group flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-rose-500/30 bg-rose-500/15 px-3 text-[10px] font-semibold text-rose-300 transition-all duration-150 hover:scale-[1.02] hover:bg-rose-500/25 active:scale-[0.98]"
                >
                  <X
                    size={12}
                    className="transition-transform group-hover:rotate-90"
                  />
                  <span>Cancel</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrackStar(star);
                  }}
                  className="group flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-[10px] font-semibold transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    color: computed.indicatorColor,
                    borderColor: `${computed.indicatorColor}35`,
                    backgroundColor: `${computed.indicatorColor}15`,
                  }}
                >
                  <Crosshair
                    size={12}
                    className="transition-transform group-hover:rotate-90"
                  />
                  <span>Tracking</span>
                </button>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-400 transition-all duration-150 hover:scale-[1.02] hover:bg-white/10 hover:text-white active:scale-[0.98]"
                aria-label="Close tooltip"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="my-4 h-px bg-white/5" />

          {/* Grid Informasi Bintang / DSO */}
          <div className="space-y-3">
            <InfoRow
              label="Magnitude"
              value={star.mag.toFixed(2)}
              subValue={computed.visibility}
            />
            <InfoRow
              label="Altitude"
              value={formatDegree(star.alt)}
              highlight={computed.isLowAltitude}
            />
            <InfoRow
              label="Azimuth"
              value={`${star.az.toFixed(1)}° ${computed.cardinal}`}
            />

            {/* Tampilan Khusus Bintang: Tampilkan Indeks B-V */}
            {computed.isStar && star.bv !== undefined && (
              <InfoRow
                label="Spectrum (B−V)"
                value={formatDegree(star.bv, 2).replace("+", "")}
                subValue={`${computed.spectralTemp} (${computed.spectralDesc})`}
              />
            )}

            {/* Tampilan Khusus DSO: Tampilkan Tipe & Deskripsi jika ada */}
            {computed.isDSO && star.description && (
              <div className="mt-2 border-t border-white/5 pt-2.5">
                <span className="text-[9px] uppercase tracking-[0.18em] text-slate-500 block mb-1 sm:text-[10px]">
                  Description
                </span>
                <p className="text-[11px] font-sans leading-relaxed text-slate-300">
                  {star.description}
                </p>
              </div>
            )}
          </div>

          {/* Peringatan Horizon Rendah */}
          {computed.isNearHorizon && (
            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/10 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="mt-px text-[10px] text-amber-300">⚠</span>
                <div>
                  <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-amber-300">
                    Low Horizon Visibility
                  </div>
                  <p className="mt-1 text-[9px] leading-relaxed text-amber-200/70">
                    Atmospheric refraction may affect apparent position and
                    brightness.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
