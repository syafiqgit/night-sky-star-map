"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { equatorialToHorizontal } from "@/lib/astro/coordinates";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

// ─── Types ────────────────────────────────────────────────────────────────────
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
const HOVER_RADIUS_PX = 16;
const VIEW_SENSITIVITY = 0.12;
const MILKY_WAY_PATH: ReadonlyArray<{ ra: number; dec: number }> = [
  { ra: 17.75, dec: -29 },
  { ra: 18.5, dec: -5 },
  { ra: 19, dec: 10 },
  { ra: 20, dec: 30 },
  { ra: 21, dec: 45 },
  { ra: 23, dec: 55 },
  { ra: 0, dec: 60 },
  { ra: 2, dec: 58 },
  { ra: 3, dec: 50 },
  { ra: 5.5, dec: 10 },
  { ra: 7, dec: -15 },
  { ra: 8, dec: -30 },
  { ra: 10.5, dec: -55 },
  { ra: 11, dec: -60 },
  { ra: 13, dec: -60 },
  { ra: 14.5, dec: -60 },
  { ra: 16, dec: -45 },
];

function getStarColor(bv: number | undefined): string {
  if (bv === undefined) return "#ffffff";
  if (bv < -0.1) return "#b8d0ff";
  if (bv < 0.5) return "#ffffff";
  if (bv < 1.0) return "#fff4ea";
  if (bv < 1.5) return "#ffd2a1";
  return "#ff9b9b";
}

function project(
  alt: number,
  az: number,
  cx: number,
  cy: number,
  R: number,
): { x: number; y: number } {
  const r = R * Math.tan(((90 - alt) * Math.PI) / 360);
  const theta = (az - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

function normalizeAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

// ─── Component ────────────────────────────────────────────────────────────────
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
  const [viewAngle, setViewAngle] = useState({ az: 0, alt: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const lastPos = useRef({ x: 0, y: 0 });
  const hoveredRef = useRef<HoveredStar | null>(null);
  const renderedStars = useRef<Map<number, ProjectedStar>>(new Map());

  const [redrawTick, setRedrawTick] = useState(0);
  const bumpRedraw = () => setRedrawTick((t) => t + 1);

  // Kalkulasi Bintang
  const baseStars = useMemo(() => {
    return stars.map((star) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: star.ra, dec: star.dec },
        observer,
        time,
      );
      return { ...star, baseAlt: altitude, baseAz: azimuth };
    });
  }, [stars, observer, time]);

  // Kalkulasi Tata Surya
  const basePlanets = useMemo(() => {
    const planets = getSolarSystemObjects(time);
    return planets.map((p) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: p.ra, dec: p.dec },
        observer,
        time,
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

  const milkyWayPoints = useMemo(() => {
    return MILKY_WAY_PATH.map((p) => {
      const { altitude, azimuth } = equatorialToHorizontal(p, observer, time);
      return { baseAlt: altitude, baseAz: azimuth };
    });
  }, [observer, time]);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => bumpRedraw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // Engine Auto-Pan
  useEffect(() => {
    if (!activeTarget) return;
    let frameId: number;
    const animateFlyTo = () => {
      const targetBase =
        baseStars.find((s) => s.id === activeTarget.id) ||
        basePlanets.find((p) => p.id === activeTarget.id);
      if (!targetBase) return;
      const targetVAz = targetBase.baseAz;
      const targetVAlt = targetBase.baseAlt - 90;

      setViewAngle((prev) => {
        let diffAz = targetVAz - prev.az;
        diffAz = ((diffAz + 540) % 360) - 180;
        const speed = 0.08;
        return {
          az: normalizeAz(prev.az + diffAz * speed),
          alt: Math.max(
            -88,
            Math.min(88, prev.alt + (targetVAlt - prev.alt) * speed),
          ),
        };
      });
      frameId = requestAnimationFrame(animateFlyTo);
    };
    animateFlyTo();
    return () => cancelAnimationFrame(frameId);
  }, [activeTarget, baseStars, basePlanets]);

  useEffect(() => {
    if (!activeTarget) return;
    let frame: number;
    const loop = () => {
      bumpRedraw();
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(frame);
  }, [activeTarget]);

  // ─── MAIN DRAW EFFECT ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    const targetW = Math.round(W * dpr);
    const targetH = Math.round(H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(cx, cy) * 1.45;
    const { az: vAz, alt: vAlt } = viewAngle;

    // ─── 1. KALKULASI DAY/NIGHT CYCLE ───────────────────────────────────────
    const sunData = basePlanets.find((p) => p.id === -1);
    const sunAlt = sunData ? sunData.baseAlt : -90;

    // dayIntensity: 1 (Siang), 0 (Malam Gelap)
    let dayIntensity = 0;

    if (filters.atmosphere) {
      if (sunAlt > 0) dayIntensity = 1;
      else if (sunAlt > -18) dayIntensity = (sunAlt + 18) / 18;
    }

    // Latar Belakang Malam Dasar
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Lapisan Langit Siang (Biru)
    if (dayIntensity > 0) {
      ctx.globalAlpha = dayIntensity;
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, "#0ea5e9"); // Sky-500
      skyGrad.addColorStop(1, "#bae6fd"); // Sky-200
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1; // Reset
    }

    // Lapisan Hamburan Atmosfer Senja/Fajar (Twilight Glow)
    if (sunData && sunAlt > -18 && sunAlt < 10) {
      const currentSunAlt = sunData.baseAlt - vAlt;
      const currentSunAz = normalizeAz(sunData.baseAz - vAz);
      const { x: sunX, y: sunY } = project(
        currentSunAlt,
        currentSunAz,
        cx,
        cy,
        R,
      );

      let twilightIntensity = 0;
      if (sunAlt <= 0) twilightIntensity = (sunAlt + 18) / 18;
      else twilightIntensity = Math.max(0, 1 - sunAlt / 10);

      if (twilightIntensity > 0) {
        ctx.globalAlpha = twilightIntensity;
        const twilightGrad = ctx.createRadialGradient(
          sunX,
          sunY,
          0,
          sunX,
          sunY,
          R * 1.5,
        );
        twilightGrad.addColorStop(0, "rgba(249, 115, 22, 0.9)"); // Orange terang
        twilightGrad.addColorStop(0.2, "rgba(225, 29, 72, 0.5)"); // Rose/Pink
        twilightGrad.addColorStop(0.6, "rgba(76, 29, 149, 0.15)"); // Ungu pudar
        twilightGrad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = twilightGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, R * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ─── 2. PROYEKSI BINTANG & PLANET ───────────────────────────────────────
    const visible = new Map<number, ProjectedStar>();
    for (const star of baseStars) {
      const currentAlt = star.baseAlt - vAlt;
      const currentAz = normalizeAz(star.baseAz - vAz);
      if (currentAlt > -12) {
        const { x, y } = project(currentAlt, currentAz, cx, cy, R);
        visible.set(star.id, { ...star, x, y, currentAlt });
      }
    }

    if (filters.planets) {
      for (const planet of basePlanets) {
        const currentAlt = planet.baseAlt - vAlt;
        const currentAz = normalizeAz(planet.baseAz - vAz);
        if (currentAlt > -12) {
          const { x, y } = project(currentAlt, currentAz, cx, cy, R);
          visible.set(planet.id, { ...planet, x, y, currentAlt });
        }
      }
    }

    // ─── 3. MILKY WAY (Sembunyi saat siang) ─────────────────────────────────
    if (filters.faintStars && dayIntensity < 0.8) {
      ctx.globalAlpha = 1 - dayIntensity; // Memudar saat fajar
      for (const pt of milkyWayPoints) {
        const currentAlt = pt.baseAlt - vAlt;
        const currentAz = normalizeAz(pt.baseAz - vAz);
        if (currentAlt > -20) {
          const { x, y } = project(currentAlt, currentAz, cx, cy, R);
          const blobR = R / 3.2;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, blobR);
          grad.addColorStop(0, "rgba(148, 163, 200, 0.07)");
          grad.addColorStop(0.5, "rgba(148, 163, 200, 0.03)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, blobR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ─── 4. KONSTELASI (Sembunyi saat siang) ────────────────────────────────
    if (filters.constellations && dayIntensity < 0.9) {
      ctx.globalAlpha = 1 - dayIntensity;
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 0.8;
      for (const constellation of constellations) {
        const labelNodes: ProjectedStar[] = [];
        for (const [idA, idB] of constellation.lines) {
          const sA = visible.get(idA);
          const sB = visible.get(idB);
          if (!sA || !sB || sA.currentAlt <= 0 || sB.currentAlt <= 0) continue;

          const linGrad = ctx.createLinearGradient(sA.x, sA.y, sB.x, sB.y);
          linGrad.addColorStop(0, "rgba(100, 160, 255, 0.18)");
          linGrad.addColorStop(1, "rgba(100, 160, 255, 0.10)");
          ctx.strokeStyle = linGrad;
          ctx.beginPath();
          ctx.moveTo(sA.x, sA.y);
          ctx.lineTo(sB.x, sB.y);
          ctx.stroke();

          if (!labelNodes.includes(sA)) labelNodes.push(sA);
          if (!labelNodes.includes(sB)) labelNodes.push(sB);
        }
        if (labelNodes.length >= 2) {
          const lx =
            labelNodes.reduce((a, s) => a + s.x, 0) / labelNodes.length;
          const ly =
            labelNodes.reduce((a, s) => a + s.y, 0) / labelNodes.length;
          ctx.setLineDash([]);
          ctx.font = "bold 8.5px 'Courier New', monospace";
          ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
          ctx.textAlign = "center";
          ctx.fillText(constellation.name.toUpperCase(), lx, ly - 10);
        }
      }
      ctx.globalAlpha = 1;
    }

    // ─── 5. BINTANG & PLANET (Dynamic Filter Siang/Malam) ──────────────────
    ctx.setLineDash([]);
    const MAG_LIMIT_BASE = filters.faintStars ? MAX_MAG : 3.5;

    // Saat Siang (dayIntensity = 1), batas mag adalah -2 (Hanya matahari, bulan, venus yg kelihatan)
    const CURRENT_MAG_LIMIT =
      MAG_LIMIT_BASE - dayIntensity * (MAG_LIMIT_BASE - -2);

    for (const star of visible.values()) {
      if (star.currentAlt <= 0) continue;

      if (star.isPlanet) {
        ctx.save();
        ctx.translate(star.x, star.y);
        const r = star.radiusPx || 4;
        ctx.globalAlpha = 1;

        if (star.id === -1) {
          // MATAHARI
          ctx.beginPath();
          ctx.arc(0, 0, r * 4, 0, Math.PI * 2);
          const sunGrad = ctx.createRadialGradient(0, 0, r, 0, 0, r * 4);
          sunGrad.addColorStop(0, "rgba(251, 191, 36, 0.6)");
          sunGrad.addColorStop(1, "rgba(245, 158, 11, 0)");
          ctx.fillStyle = sunGrad;
          ctx.fill();

          ctx.shadowBlur = 30;
          ctx.shadowColor = "#fbbf24";
          ctx.fillStyle = "#fffbeb";
          ctx.beginPath();
          ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (star.id === -2) {
          // BULAN FASE
          ctx.shadowBlur = 25;
          ctx.shadowColor =
            dayIntensity > 0.5
              ? "rgba(255,255,255,0.2)"
              : "rgba(255,255,255,0.8)";
          ctx.rotate(-(star as any).phaseAngle);
          const phase = (star as any).phase || 1;

          ctx.fillStyle =
            dayIntensity > 0.5
              ? "rgba(56, 189, 248, 0.9)"
              : "rgba(15, 23, 42, 0.9)";
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
          const curve = r * (1 - phase * 2);
          ctx.bezierCurveTo(0, r, curve, r, curve, 0);
          ctx.bezierCurveTo(curve, -r, 0, -r, 0, -r);
          ctx.fill();
        } else {
          // PLANET LAIN
          ctx.shadowBlur = 20;
          ctx.shadowColor = star.colorStr || "#ffffff";
          ctx.fillStyle = star.colorStr || "#ffffff";
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.font = "bold 10.5px 'Courier New', monospace";
        ctx.fillStyle =
          star.id === -1 ? "#fde68a" : "rgba(255, 255, 255, 0.95)";
        ctx.textAlign = "center";
        ctx.shadowBlur = 6;
        ctx.shadowColor = "#000000";
        ctx.fillText(star.name!.toUpperCase(), 0, r + 16);
        ctx.shadowBlur = 0;

        ctx.restore();
        continue;
      }

      // Hide star if fainter than dynamic current limit
      if (star.mag > CURRENT_MAG_LIMIT) continue;

      const normalized = Math.max(0, (MAX_MAG - star.mag) / MAX_MAG);
      const size = Math.max(0.4, normalized * 2.8 + 0.2);
      const opacity = Math.min(1, Math.max(0.1, (MAX_MAG - star.mag) / 5.5));
      const color = getStarColor(star.bv);

      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      if (star.mag < 2.5) {
        ctx.shadowBlur = star.mag < 1.5 ? size * 6 : size * 3.5;
        ctx.shadowColor = color;
      }
      ctx.beginPath();
      ctx.arc(star.x, star.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    // ── TARGET RADAR DRAWING ─────────────────────────────────────────────────
    if (activeTarget) {
      const tStar = visible.get(activeTarget.id);
      if (tStar && tStar.currentAlt > 0) {
        const timeOffset = Date.now() / 400;
        const rBase = 26;
        const pulse = Math.sin(timeOffset * 2) * 2;

        ctx.save();
        ctx.translate(tStar.x, tStar.y);
        ctx.rotate(timeOffset);
        ctx.beginPath();
        ctx.arc(0, 0, rBase + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([12, 8]);
        ctx.stroke();

        ctx.rotate(-timeOffset * 2);
        ctx.beginPath();
        ctx.arc(0, 0, rBase - 8 + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(34, 197, 94, 0.4)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();

        ctx.font = "bold 10px 'Courier New', monospace";
        ctx.fillStyle = "#4ade80";
        ctx.textAlign = "center";
        ctx.shadowBlur = 5;
        ctx.shadowColor = "#020617";
        ctx.fillText(
          `TARGET: ${activeTarget.name?.toUpperCase()}`,
          tStar.x,
          tStar.y - 35,
        );
        ctx.shadowBlur = 0;
      }
    }

    // ── HORIZON MASK ────────────────────────────────────────────────────────
    ctx.fillStyle = "#020617";
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    // Dynamic Horizon Fade (Gelap di malam, Biru Keputihan di siang)
    const horizonFade = ctx.createRadialGradient(
      cx,
      cy,
      R * 0.82,
      cx,
      cy,
      R * 1.02,
    );
    const rSky = Math.round(2 + dayIntensity * (191 - 2));
    const gSky = Math.round(6 + dayIntensity * (219 - 6));
    const bSky = Math.round(23 + dayIntensity * (254 - 23));

    horizonFade.addColorStop(0, `rgba(${rSky}, ${gSky}, ${bSky}, 0)`);
    horizonFade.addColorStop(1, `rgba(${rSky}, ${gSky}, ${bSky}, 0.9)`);

    ctx.fillStyle = horizonFade;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(96, 165, 250, 0.25)";
    ctx.fill();

    // ── COMPASS ─────────────────────────────────────────────────────────────
    const cardinalPoints = [
      { label: "N", az: 0, main: true },
      { label: "NE", az: 45, main: false },
      { label: "E", az: 90, main: true },
      { label: "SE", az: 135, main: false },
      { label: "S", az: 180, main: true },
      { label: "SW", az: 225, main: false },
      { label: "W", az: 270, main: true },
      { label: "NW", az: 315, main: false },
    ];
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const compassR = R - 14;

    for (const pt of cardinalPoints) {
      const currentAz = normalizeAz(pt.az - vAz);
      const theta = (currentAz - 90) * (Math.PI / 180);
      const x = cx + compassR * Math.cos(theta);
      const y = cy + compassR * Math.sin(theta);

      if (x > -20 && x < W + 20 && y > -20 && y < H + 20) {
        ctx.font = pt.main
          ? "bold 14px 'Courier New', monospace"
          : "bold 10px 'Courier New', monospace";
        ctx.fillStyle =
          pt.label === "N"
            ? "rgba(239, 68, 68, 0.9)"
            : pt.main
              ? "rgba(148, 163, 184, 0.8)"
              : "rgba(100, 116, 139, 0.5)";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "#020617";
        ctx.fillText(pt.label, x, y);
        ctx.shadowBlur = 0;
      }
    }

    // ── HOVER RETICLE ────────────────────────────────────────────────────────
    const hovered = hoveredRef.current;
    if (hovered && (!activeTarget || activeTarget.id !== hovered.id)) {
      const h = visible.get(hovered.id);
      if (h && h.currentAlt > 0) {
        const rSize = 11;
        const armGap = 5;
        const armLen = 7;
        ctx.beginPath();
        ctx.arc(h.x, h.y, rSize, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(96, 165, 250, 0.85)";
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.stroke();

        ctx.strokeStyle = "rgba(96, 165, 250, 0.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(h.x - rSize - armGap - armLen, h.y);
        ctx.lineTo(h.x - rSize - armGap, h.y);
        ctx.moveTo(h.x + rSize + armGap, h.y);
        ctx.lineTo(h.x + rSize + armGap + armLen, h.y);
        ctx.moveTo(h.x, h.y - rSize - armGap - armLen);
        ctx.lineTo(h.x, h.y - rSize - armGap);
        ctx.moveTo(h.x, h.y + rSize + armGap);
        ctx.lineTo(h.x, h.y + rSize + armGap + armLen);
        ctx.stroke();
      }
    }

    renderedStars.current = visible;
  }, [
    baseStars,
    viewAngle,
    constellations,
    milkyWayPoints,
    redrawTick,
    filters,
    activeTarget,
    basePlanets,
  ]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (isDragging) {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      setViewAngle((prev) => ({
        az: normalizeAz(prev.az - dx * VIEW_SENSITIVITY),
        alt: Math.max(-88, Math.min(88, prev.alt + dy * VIEW_SENSITIVITY)),
      }));
      return;
    }

    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest: ProjectedStar | null = null;
    let minDist = HOVER_RADIUS_PX;

    // Pakai batas dinamis yang sama saat deteksi kursor
    const sunData = basePlanets.find((p) => p.id === -1);
    const sunAlt = sunData ? sunData.baseAlt : -90;
    let dayIntensity = 0;
    if (sunAlt > 0) dayIntensity = 1;
    else if (sunAlt > -18) dayIntensity = (sunAlt + 18) / 18;

    const MAG_LIMIT_BASE = filters.faintStars ? MAX_MAG : 3.5;
    const CURRENT_MAG_LIMIT =
      MAG_LIMIT_BASE - dayIntensity * (MAG_LIMIT_BASE - -2);

    for (const star of renderedStars.current.values()) {
      if (star.currentAlt <= 0 || star.mag > CURRENT_MAG_LIMIT) continue;
      const dist = Math.hypot(star.x - mx, star.y - my);
      if (dist < minDist) {
        minDist = dist;
        closest = star;
      }
    }

    const newHovered: HoveredStar | null = closest
      ? {
          id: closest.id,
          name: closest.name,
          mag: closest.mag,
          bv: closest.bv,
          alt: closest.baseAlt,
          az: closest.baseAz,
        }
      : null;

    if ((hoveredRef.current?.id ?? null) !== (newHovered?.id ?? null)) {
      hoveredRef.current = newHovered;
      onStarHover(newHovered);
      bumpRedraw();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={(e) => {
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
        if (activeTarget) onClearTarget();
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => {
        setIsDragging(false);
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          onStarHover(null);
          bumpRedraw();
        }
      }}
      style={{ cursor: isDragging ? "grabbing" : "crosshair" }}
      className="w-full h-full touch-none select-none"
    />
  );
}
