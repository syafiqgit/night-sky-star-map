"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { equatorialToHorizontal } from "@/lib/astro/coordinates";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
  bv?: number;
  name?: string | null;
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

interface ProjectedStar extends Star {
  baseAlt: number;
  baseAz: number;
  x: number;
  y: number;
  currentAlt: number;
  isPlanet?: boolean;
  colorStr?: string;
  radiusPx?: number;
}

export interface StarCanvasProps {
  stars: Star[];
  constellations: Constellation[];
  observer: { lat: number; lon: number };
  time: Date;
  onStarHover: (star: HoveredStar | null) => void;
  filters: {
    constellations: boolean;
    faintStars: boolean;
    planets: boolean;
    atmosphere: boolean;
  };
  activeTarget: Star | null;
  onClearTarget: () => void;
}

const MAX_MAG = 6.5;

const VIEW_SENSITIVITY = 0.12;

function normalizeAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

function project(
  alt: number,
  az: number,
  cx: number,
  cy: number,
  R: number
) {
  const r = R * Math.tan(((90 - alt) * Math.PI) / 360);

  const theta = (az - 90) * (Math.PI / 180);

  return {
    x: cx + r * Math.cos(theta),
    y: cy + r * Math.sin(theta),
  };
}

function getStarColor(bv: number | undefined): string {
  if (bv === undefined) return "#ffffff";

  if (bv < -0.1) return "#b8d0ff";

  if (bv < 0.5) return "#ffffff";

  if (bv < 1.0) return "#fff4ea";

  if (bv < 1.5) return "#ffd2a1";

  return "#ff9b9b";
}

export default function StarCanvas({
  stars,
  constellations,
  observer,
  time,
  onStarHover,
  filters,
  activeTarget,
  onClearTarget,
}: StarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [viewAngle, setViewAngle] = useState({
    az: 0,
    alt: 0,
  });

  const [isDragging, setIsDragging] =
    useState(false);

  const [isMobile, setIsMobile] =
    useState(false);

  const lastPos = useRef({
    x: 0,
    y: 0,
  });

  const hoveredRef =
    useRef<HoveredStar | null>(null);

  const renderedStars = useRef<
    Map<number, ProjectedStar>
  >(new Map());

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();

    window.addEventListener(
      "resize",
      checkMobile
    );

    return () => {
      window.removeEventListener(
        "resize",
        checkMobile
      );
    };
  }, []);

  const baseStars = useMemo(() => {
    return stars.map((star) => {
      const { altitude, azimuth } =
        equatorialToHorizontal(
          {
            ra: star.ra,
            dec: star.dec,
          },
          observer,
          time
        );

      return {
        ...star,
        baseAlt: altitude,
        baseAz: azimuth,
      };
    });
  }, [stars, observer, time]);

  const basePlanets = useMemo(() => {
    const planets =
      getSolarSystemObjects(time);

    return planets.map((p) => {
      const { altitude, azimuth } =
        equatorialToHorizontal(
          {
            ra: p.ra,
            dec: p.dec,
          },
          observer,
          time
        );

      return {
        ...p,
        baseAlt: altitude,
        baseAz: azimuth,
        isPlanet: true,
        colorStr: p.color,
        radiusPx: p.radiusPx,
      };
    });
  }, [observer, time]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext("2d", {
      alpha: false,
    });

    if (!ctx) return;

    const rect =
      canvas.getBoundingClientRect();

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile ? 1.5 : 2
    );

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = rect.width;
    const H = rect.height;

    const cx = W / 2;
    const cy = H / 2;

    const R =
      Math.min(cx, cy) *
      (isMobile ? 1.18 : 1.45);

    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    const visible =
      new Map<number, ProjectedStar>();

    for (const star of baseStars) {
      const currentAlt =
        star.baseAlt - viewAngle.alt;

      const currentAz = normalizeAz(
        star.baseAz - viewAngle.az
      );

      if (currentAlt > -12) {
        const { x, y } = project(
          currentAlt,
          currentAz,
          cx,
          cy,
          R
        );

        visible.set(star.id, {
          ...star,
          x,
          y,
          currentAlt,
        });
      }
    }

    if (filters.planets) {
      for (const planet of basePlanets) {
        const currentAlt =
          planet.baseAlt - viewAngle.alt;

        const currentAz = normalizeAz(
          planet.baseAz - viewAngle.az
        );

        if (currentAlt > -12) {
          const { x, y } = project(
            currentAlt,
            currentAz,
            cx,
            cy,
            R
          );

          visible.set(planet.id, {
            ...planet,
            x,
            y,
            currentAlt,
          });
        }
      }
    }

    renderedStars.current = visible;

    for (const star of visible.values()) {
      if (star.currentAlt <= 0) continue;

      if (!star.isPlanet) {
        if (
          !filters.faintStars &&
          star.mag > 3.5
        ) {
          continue;
        }

        const normalized = Math.max(
          0,
          (MAX_MAG - star.mag) / MAX_MAG
        );

        const size = Math.max(
          isMobile ? 0.7 : 0.4,
          normalized *
            (isMobile ? 3.4 : 2.8) +
            0.2
        );

        ctx.fillStyle = getStarColor(
          star.bv
        );

        ctx.beginPath();

        ctx.arc(
          star.x,
          star.y,
          size,
          0,
          Math.PI * 2
        );

        ctx.fill();
      } else {
        const r = star.radiusPx || 4;

        ctx.fillStyle =
          star.colorStr || "#ffffff";

        ctx.beginPath();

        ctx.arc(
          star.x,
          star.y,
          isMobile ? r * 1.2 : r,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }

    if (filters.constellations) {
      ctx.strokeStyle =
        "rgba(100,160,255,0.18)";

      ctx.lineWidth = isMobile ? 0.7 : 1;

      ctx.setLineDash(
        isMobile ? [2, 4] : [3, 5]
      );

      for (const constellation of constellations) {
        for (const [idA, idB] of constellation.lines) {
          const sA = visible.get(idA);

          const sB = visible.get(idB);

          if (!sA || !sB) continue;

          if (
            sA.currentAlt <= 0 ||
            sB.currentAlt <= 0
          ) {
            continue;
          }

          ctx.beginPath();

          ctx.moveTo(sA.x, sA.y);

          ctx.lineTo(sB.x, sB.y);

          ctx.stroke();
        }
      }
    }

    ctx.setLineDash([]);

    const compassSize = isMobile
      ? 10
      : 14;

    ctx.font = `bold ${compassSize}px monospace`;

    ctx.fillStyle =
      "rgba(148,163,184,0.85)";

    ctx.textAlign = "center";

    const points = [
      { label: "N", az: 0 },
      { label: "E", az: 90 },
      { label: "S", az: 180 },
      { label: "W", az: 270 },
    ];

    for (const p of points) {
      const currentAz = normalizeAz(
        p.az - viewAngle.az
      );

      const theta =
        (currentAz - 90) *
        (Math.PI / 180);

      const x =
        cx +
        (R - (isMobile ? 18 : 14)) *
          Math.cos(theta);

      const y =
        cy +
        (R - (isMobile ? 18 : 14)) *
          Math.sin(theta);

      ctx.fillText(p.label, x, y);
    }
  }, [
    baseStars,
    basePlanets,
    viewAngle,
    filters,
    constellations,
    isMobile,
  ]);

  const handlePointerMove = (
    clientX: number,
    clientY: number
  ) => {
    const rect =
      canvasRef.current?.getBoundingClientRect();

    if (!rect) return;

    if (isDragging) {
      const dx =
        clientX - lastPos.current.x;

      const dy =
        clientY - lastPos.current.y;

      lastPos.current = {
        x: clientX,
        y: clientY,
      };

      setViewAngle((prev) => ({
        az: normalizeAz(
          prev.az -
            dx *
              (isMobile
                ? VIEW_SENSITIVITY * 0.8
                : VIEW_SENSITIVITY)
        ),

        alt: Math.max(
          -88,
          Math.min(
            88,
            prev.alt +
              dy *
                (isMobile
                  ? VIEW_SENSITIVITY * 0.8
                  : VIEW_SENSITIVITY)
          )
        ),
      }));

      return;
    }

    const mx = clientX - rect.left;

    const my = clientY - rect.top;

    let closest: ProjectedStar | null =
      null;

    let minDist = isMobile ? 28 : 16;

    for (const star of renderedStars.current.values()) {
      const dist = Math.hypot(
        star.x - mx,
        star.y - my
      );

      if (dist < minDist) {
        minDist = dist;
        closest = star;
      }
    }

    const newHovered = closest
      ? {
          id: closest.id,
          name: closest.name,
          mag: closest.mag,
          bv: closest.bv,
          alt: closest.baseAlt,
          az: closest.baseAz,
        }
      : null;

    if (
      (hoveredRef.current?.id ?? null) !==
      (newHovered?.id ?? null)
    ) {
      hoveredRef.current = newHovered;

      onStarHover(newHovered);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full touch-none select-none"
      style={{
        cursor: isDragging
          ? "grabbing"
          : "crosshair",
      }}
      onMouseDown={(e) => {
        setIsDragging(true);

        lastPos.current = {
          x: e.clientX,
          y: e.clientY,
        };

        if (activeTarget) {
          onClearTarget();
        }
      }}
      onMouseMove={(e) => {
        handlePointerMove(
          e.clientX,
          e.clientY
        );
      }}
      onMouseUp={() =>
        setIsDragging(false)
      }
      onMouseLeave={() => {
        setIsDragging(false);

        hoveredRef.current = null;

        onStarHover(null);
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];

        setIsDragging(true);

        lastPos.current = {
          x: t.clientX,
          y: t.clientY,
        };

        if (activeTarget) {
          onClearTarget();
        }
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];

        handlePointerMove(
          t.clientX,
          t.clientY
        );
      }}
      onTouchEnd={() => {
        setIsDragging(false);
      }}
    />
  );
}