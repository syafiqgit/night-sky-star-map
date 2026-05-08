import { memo, useMemo } from "react";

import type { HoveredStar } from "./star-canvas";

interface StarTooltipProps {
  star: HoveredStar | null;
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

function getSpectralClass(bv?: number): string {
  if (bv === undefined) {
    return "—";
  }

  if (bv < -0.3) {
    return "O";
  }

  if (bv < 0.0) {
    return "B";
  }

  if (bv < 0.3) {
    return "A";
  }

  if (bv < 0.6) {
    return "F";
  }

  if (bv < 0.8) {
    return "G";
  }

  if (bv < 1.4) {
    return "K";
  }

  return "M";
}

function getSpectralColor(bv?: number): string {
  if (bv === undefined) {
    return "#ffffff";
  }

  if (bv < 0.0) {
    return "#b8d0ff";
  }

  if (bv < 0.5) {
    return "#ffffff";
  }

  if (bv < 1.0) {
    return "#fff4ea";
  }

  if (bv < 1.5) {
    return "#ffd2a1";
  }

  return "#ff9b9b";
}

function azimuthToCardinal(azimuth: number): string {
  return CARDINAL_DIRECTIONS[Math.round(azimuth / 22.5) % 16];
}

function formatDegree(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}°`;
}

const InfoRow = memo(function InfoRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className="
        flex items-center
        justify-between gap-4
      "
    >
      <span
        className="
          text-[9px]
          uppercase tracking-[0.18em]
          text-slate-500

          sm:text-[10px]
        "
      >
        {label}
      </span>

      <span
        className={`
          text-right
          text-[10px]
          font-medium
          tabular-nums

          sm:text-[11px]

          ${highlight ? "text-amber-300" : "text-slate-100"}
        `}
      >
        {value}
      </span>
    </div>
  );
});

export default function StarTooltip({ star }: StarTooltipProps) {
  const computed = useMemo(() => {
    if (!star) {
      return null;
    }

    return {
      spectralClass: getSpectralClass(star.bv),

      spectralColor: getSpectralColor(star.bv),

      cardinal: azimuthToCardinal(star.az),

      isNearHorizon: star.alt < 10,

      isLowAltitude: star.alt < 15,

      displayName: star.name || `Star #${star.id}`,
    };
  }, [star]);

  if (!star || !computed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        pointer-events-none
        absolute left-1/2
        bottom-24 z-50
        w-full
        -translate-x-1/2
        px-3

        sm:bottom-8
      "
    >
      <div
        className="
          mx-auto
          w-full
          max-w-85
          overflow-hidden
          rounded-3xl
          border border-white/10
          bg-black/55
          font-mono
          backdrop-blur-2xl

          shadow-[0_12px_60px_rgba(0,0,0,0.55)]

          supports-backdrop-filter:bg-black/40
        "
      >
        <div
          className="
            h-px
            bg-linear-to-r
            from-transparent
            via-sky-400/40
            to-transparent
          "
        />

        <div className="p-4">
          <div
            className="
              flex items-center
              justify-between gap-3
            "
          >
            <div>
              <div
                className="
                  text-[8px]
                  font-semibold
                  uppercase
                  tracking-[0.26em]
                  text-sky-300/80

                  sm:text-[9px]
                "
              >
                Celestial Object
              </div>

              <h3
                className="
                  mt-2
                  truncate
                  text-[15px]
                  font-bold
                  tracking-tight
                  text-white

                  sm:text-[16px]
                "
              >
                {computed.displayName}
              </h3>

              {star.name && (
                <p
                  className="
                    mt-1
                    text-[9px]
                    text-slate-500
                  "
                >
                  HYG #{star.id}
                </p>
              )}
            </div>

            <div
              className="
                flex h-9 w-9
                shrink-0
                items-center
                justify-center
                rounded-2xl
                border text-[10px]
                font-bold
              "
              style={{
                color: computed.spectralColor,

                borderColor: `${computed.spectralColor}35`,

                backgroundColor: `${computed.spectralColor}15`,
              }}
            >
              {computed.spectralClass}
            </div>
          </div>

          <div
            className="
              my-4
              h-px
              bg-white/5
            "
          />

          <div className="space-y-3">
            <InfoRow label="Magnitude" value={star.mag.toFixed(2)} />

            <InfoRow
              label="Altitude"
              value={formatDegree(star.alt)}
              highlight={computed.isLowAltitude}
            />

            <InfoRow
              label="Azimuth"
              value={`${star.az.toFixed(1)}° ${computed.cardinal}`}
            />

            {star.bv !== undefined && (
              <InfoRow
                label="B−V Index"
                value={formatDegree(star.bv, 2).replace("+", "")}
              />
            )}
          </div>

          {computed.isNearHorizon && (
            <div
              className="
                mt-4
                rounded-2xl
                border border-amber-500/15
                bg-amber-500/10
                px-3 py-2.5
              "
            >
              <div
                className="
                  flex items-start gap-2
                "
              >
                <span
                  className="
                    mt-px
                    text-[10px]
                    text-amber-300
                  "
                >
                  ⚠
                </span>

                <div>
                  <div
                    className="
                      text-[9px]
                      font-medium
                      uppercase
                      tracking-[0.16em]
                      text-amber-300
                    "
                  >
                    Low Horizon Visibility
                  </div>

                  <p
                    className="
                      mt-1
                      text-[9px]
                      leading-relaxed
                      text-amber-200/70
                    "
                  >
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
