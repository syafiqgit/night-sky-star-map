import type { HoveredStar } from "./star-canvas";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSpectralClass(bv: number | undefined): string {
  if (bv === undefined) return "—";
  if (bv < -0.3) return "O";
  if (bv < 0.0)  return "B";
  if (bv < 0.3)  return "A";
  if (bv < 0.6)  return "F";
  if (bv < 0.8)  return "G";
  if (bv < 1.4)  return "K";
  return "M";
}

function getSpectralColor(bv: number | undefined): string {
  if (bv === undefined) return "#ffffff";
  if (bv < 0.0)  return "#b8d0ff";
  if (bv < 0.5)  return "#ffffff";
  if (bv < 1.0)  return "#fff4ea";
  if (bv < 1.5)  return "#ffd2a1";
  return "#ff9b9b";
}

function azToCardinal(az: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                 "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(az / 22.5) % 16];
}

function formatDeg(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}°`;
}

// ─── Data row helper ──────────────────────────────────────────────────────────

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500 text-[10px] uppercase tracking-wider">{label}</dt>
      <dd className="text-right tabular-nums text-slate-200 text-[11px]">{value}</dd>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StarTooltip({ star }: { star: HoveredStar | null }) {
  if (!star) return null;

  const spectral      = getSpectralClass(star.bv);
  const spectralColor = getSpectralColor(star.bv);
  const cardinal      = azToCardinal(star.az);
  const isNamedStar   = Boolean(star.name);

  return (
    <div
      className="pointer-events-none absolute bottom-8 left-1/2 z-50 -translate-x-1/2"
      aria-live="polite"
      role="status"
    >
      <div
        className="
          w-68 overflow-hidden
          rounded-2xl border border-white/[0.07]
          bg-slate-950/80 font-mono
          shadow-[0_8px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(96,165,250,0.08)]
          backdrop-blur-xl
        "
      >
        {/* Accent bar di atas */}
        <div className="h-px bg-linear-to-r from-transparent via-blue-500/40 to-transparent" />

        <div className="p-4">
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-blue-400/70">
              Object Identified
            </span>
            <span className="text-[9px] text-blue-500 animate-pulse">◉</span>
          </div>

          {/* Nama bintang */}
          <div className="mb-3 border-b border-white/6 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-bold leading-tight text-white">
                  {isNamedStar ? star.name : `Star #${star.id}`}
                </h3>
                {isNamedStar && (
                  <p className="mt-0.5 text-[9px] text-slate-600">HYG #{star.id}</p>
                )}
              </div>

              {/* Warna spektral */}
              <div
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: `${spectralColor}18`,
                  border: `1px solid ${spectralColor}40`,
                  color: spectralColor,
                }}
                title={`Spectral class ${spectral}`}
              >
                {spectral}
              </div>
            </div>
          </div>

          {/* Data grid */}
          <dl className="grid grid-cols-2 items-baseline gap-x-4 gap-y-2">
            <DataRow
              label="Magnitude"
              value={star.mag.toFixed(2)}
            />
            <DataRow
              label="Altitude"
              value={
                <span className={star.alt < 15 ? "text-amber-400/80" : undefined}>
                  {formatDeg(star.alt)}
                </span>
              }
            />
            <DataRow
              label="Azimuth"
              value={`${star.az.toFixed(1)}° ${cardinal}`}
            />
            {star.bv !== undefined && (
              <DataRow
                label="B−V Index"
                value={formatDeg(star.bv, 2).replace("+", "")}
              />
            )}
          </dl>

          {/* Peringatan jika bintang dekat horizon */}
          {star.alt < 10 && (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1.5">
              <span className="text-amber-400/80 text-[8px]">⚠</span>
              <span className="text-[9px] text-amber-400/70">Near horizon — atmospheric refraction may apply</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}