"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

interface DeepSpaceObject {
  id: number;
  name: string;
  messier: string;
  ra: number;
  dec: number;
  mag: number;
  type: string;
  color: string;
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
  isPlanet?: boolean;
  colorStr?: string;
  radiusPx?: number;
}

export interface StarCanvasProps {
  stars: Star[];
  constellations: Constellation[];
  solarSystem: any[];
  observer: { lat: number; lon: number };
  dsos: DeepSpaceObject[];
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
const VIEW_SENSITIVITY = 0.15;
const MOBILE_BREAKPOINT = 768;
const MOBILE_DPR = 1.5;
const DESKTOP_DPR = 2;
const MOBILE_HOVER_RADIUS = 28;
const DESKTOP_HOVER_RADIUS = 16;

const CARDINAL_POINTS = [
  { label: "N", az: 0 },
  { label: "E", az: 90 },
  { label: "S", az: 180 },
  { label: "W", az: 270 },
  { label: "NE", az: 45 },
  { label: "SE", az: 135 },
  { label: "SW", az: 225 },
  { label: "NW", az: 315 },
] as const;

const MILKY_WAY_NODES = [
  { ra: 266, dec: -29 },
  { ra: 280, dec: -10 },
  { ra: 295, dec: 10 },
  { ra: 310, dec: 40 },
  { ra: 340, dec: 55 },
  { ra: 15, dec: 60 },
  { ra: 50, dec: 45 },
  { ra: 85, dec: 40 },
  { ra: 110, dec: -5 },
  { ra: 140, dec: -45 },
  { ra: 160, dec: -60 },
  { ra: 188, dec: -60 },
  { ra: 205, dec: -60 },
  { ra: 230, dec: -50 },
  { ra: 250, dec: -40 },
  { ra: 266, dec: -29 },
];

function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

function projectPlanetarium(
  baseAlt: number,
  baseAz: number,
  viewAlt: number,
  viewAz: number,
  centerX: number,
  centerY: number,
  scale: number,
) {
  const altRad = baseAlt * (Math.PI / 180);
  const azRad = baseAz * (Math.PI / 180);
  const camAlt = viewAlt * (Math.PI / 180);
  const camAz = viewAz * (Math.PI / 180);

  const deltaAz = azRad - camAz;
  const cosC =
    Math.sin(camAlt) * Math.sin(altRad) +
    Math.cos(camAlt) * Math.cos(altRad) * Math.cos(deltaAz);
  const c = Math.acos(Math.max(-1, Math.min(1, cosC)));

  if (c > Math.PI * 0.95) return null;

  const k = c === 0 ? 1 : c / Math.sin(c);
  const x = k * Math.cos(altRad) * Math.sin(deltaAz);
  const y =
    k *
    (Math.cos(camAlt) * Math.sin(altRad) -
      Math.sin(camAlt) * Math.cos(altRad) * Math.cos(deltaAz));

  return { x: centerX + x * scale, y: centerY - y * scale, visible: true };
}

function getStarColor(bv?: number): string {
  if (bv === undefined) return "#ffffff";
  if (bv < -0.1) return "#e0f2fe";
  if (bv < 0.5) return "#ffffff";
  if (bv < 1.0) return "#fef08a";
  if (bv < 1.5) return "#fed7aa";
  return "#fca5a5";
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
  solarSystem,
  dsos,
}: StarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedStarsRef = useRef<Map<number, ProjectedStar>>(new Map());
  const hoveredStarRef = useRef<HoveredStar | null>(null);

  const lastPointerRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // State Multi-Touch (Pinch-to-zoom)
  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);

  const [viewAngle, setViewAngle] = useState({ az: 0, alt: 30 });
  const latestObjectsRef = useRef<any[]>([]);

  const [zoomLevel, setZoomLevel] = useState(0.85);
  const zoomLevelRef = useRef(0.85);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  // NATIVE WHEEL LISTENER (Untuk Desktop Scroll Tanpa Membuat Halaman Turun)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Cari baris handleWheel di dalam useEffect:
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (activeTarget) onClearTarget();

      setZoomLevel((prev) => {
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        // PEMBATASAN BARU:
        // 0.45 setara dengan pandangan luas ~185 derajat
        // 10.0 adalah batas zoom-in yang cukup detail
        return Math.max(0.45, Math.min(10.0, prev * zoomFactor));
      });
    };

    // Cari baris di handlePointerMove (logika pinch-to-zoom):
    if (
      activePointers.current.size === 2 &&
      initialPinchDist.current !== null
    ) {
      const pts = Array.from(activePointers.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const scale = currentDist / initialPinchDist.current;

      // PEMBATASAN BARU:
      setZoomLevel(Math.max(0.45, Math.min(10.0, initialZoom.current * scale)));
      return;
    }

    // passive: false wajib ada agar event.preventDefault() bisa bekerja pada wheel
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [activeTarget, onClearTarget]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    );
    const update = (event?: MediaQueryListEvent) =>
      setIsMobile(event?.matches ?? mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const baseMilkyWay = useMemo(() => {
    const dust = [];
    for (let i = 0; i < MILKY_WAY_NODES.length - 1; i++) {
      const p1 = MILKY_WAY_NODES[i];
      const p2 = MILKY_WAY_NODES[i + 1];
      let raDiff = p2.ra - p1.ra;
      if (raDiff > 180) raDiff -= 360;
      if (raDiff < -180) raDiff += 360;

      for (let j = 0; j < 20; j++) {
        const t = j / 20;
        let ra = p1.ra + raDiff * t + (Math.random() - 0.5) * 15;
        if (ra < 0) ra += 360;
        if (ra >= 360) ra -= 360;
        const dec = p1.dec + (p2.dec - p1.dec) * t + (Math.random() - 0.5) * 12;
        const isCore = p1.ra === 266 || p1.ra === 250;
        dust.push({
          ra,
          dec,
          size: Math.random() * 50 + 35,
          alpha: Math.random() * 0.03 + 0.01 + (isCore ? 0.025 : 0),
        });
      }
    }
    return dust;
  }, []);

  const baseStars = useMemo(() => {
    return stars.map((star) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: star.ra, dec: star.dec },
        observer,
        time,
      );
      return { ...star, baseAlt: altitude, baseAz: azimuth };
    });
  }, [observer, stars, time]);

  const basePlanets = useMemo(() => {
    return getSolarSystemObjects(time, solarSystem).map((planet) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: planet.ra, dec: planet.dec },
        observer,
        time,
      );
      return {
        ...planet,
        baseAlt: altitude,
        baseAz: azimuth,
        isPlanet: true,
        colorStr: planet.color,
        radiusPx: planet.radiusPx,
      };
    });
  }, [observer, time, solarSystem]);

  const baseDsos = useMemo(() => {
    return dsos.map((dso) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: dso.ra, dec: dso.dec },
        observer,
        time,
      );

      return {
        ...dso,
        baseAlt: altitude,
        baseAz: azimuth,
      };
    });
  }, [dsos, observer, time]);

  const projectedMilkyWay = useMemo(() => {
    return baseMilkyWay.map((cloud) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: cloud.ra, dec: cloud.dec },
        observer,
        time,
      );
      return { ...cloud, baseAlt: altitude, baseAz: azimuth };
    });
  }, [baseMilkyWay, observer, time]);

  useEffect(() => {
    latestObjectsRef.current = [...baseStars, ...basePlanets, ...baseDsos];
  }, [baseStars, basePlanets, baseDsos]);

  // ANIMASI SAAT KLIK TARGET
  useEffect(() => {
    let frameId: number;
    let isActive = true;

    const animate = () => {
      if (!isActive) return;
      let isMoving = false;

      // HANYA beranimasi jika ada activeTarget. Jika tidak ada, biarkan zoomLevel statis sesuai zoom manual user.
      if (activeTarget) {
        setZoomLevel((prev) => {
          const diffZ = 4.5 - prev; // Zoom in ke 4.5x saat mencari objek
          if (Math.abs(diffZ) > 0.005) {
            isMoving = true;
            return prev + diffZ * 0.08;
          }
          return 4.5;
        });

        const targetObj = latestObjectsRef.current.find(
          (o) => o.id === activeTarget.id,
        );
        if (targetObj) {
          setViewAngle((prev) => {
            let diffAz = (targetObj.baseAz - prev.az) % 360;
            if (diffAz > 180) diffAz -= 360;
            if (diffAz < -180) diffAz += 360;

            const targetAlt = targetObj.baseAlt;
            const diffAlt = targetAlt - prev.alt;

            if (Math.abs(diffAz) > 0.05 || Math.abs(diffAlt) > 0.05) {
              isMoving = true;
              return {
                az: normalizeAzimuth(prev.az + diffAz * 0.08),
                alt: Math.max(-90, Math.min(90, prev.alt + diffAlt * 0.08)),
              };
            }
            isMoving = true;
            return {
              az: targetObj.baseAz,
              alt: Math.max(-90, Math.min(90, targetAlt)),
            };
          });
        }
      }

      if (isMoving || activeTarget) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      isActive = false;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [activeTarget]);

  // RENDER UTAMA KANVAS
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile ? MOBILE_DPR : DESKTOP_DPR,
    );
    const scaledWidth = Math.round(width * dpr);
    const scaledHeight = Math.round(height * dpr);

    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const centerX = width / 2;
    const centerY = height / 2;

    const fovScale = (Math.max(width, height) / 2.5) * zoomLevel;

    // 1. BACKGROUND DEEP SPACE
    const bgGrad = context.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      Math.max(width, height),
    );
    bgGrad.addColorStop(0, "#0b1021");
    bgGrad.addColorStop(1, "#030712");
    context.fillStyle = bgGrad;
    context.fillRect(0, 0, width, height);

    const sunData = basePlanets.find((p) => p.id === 0);
    const sunAlt = sunData ? sunData.baseAlt : -90;
    let dayIntensity = 0;

    if (filters.atmosphere) {
      if (sunAlt > 0) dayIntensity = 1;
      else if (sunAlt > -18) dayIntensity = (sunAlt + 18) / 18;
    }

    if (dayIntensity > 0) {
      context.globalAlpha = dayIntensity * 0.6;
      context.fillStyle = "#0ea5e9";
      context.fillRect(0, 0, width, height);
      context.globalAlpha = 1;
    }

    if (filters.atmosphere && sunData && sunAlt > -18 && sunAlt < 10) {
      const sunProj = projectPlanetarium(
        sunData.baseAlt,
        sunData.baseAz,
        viewAngle.alt,
        viewAngle.az,
        centerX,
        centerY,
        fovScale,
      );
      let tIntensity =
        sunAlt <= 0 ? (sunAlt + 18) / 18 : Math.max(0, 1 - sunAlt / 10);

      if (sunProj && tIntensity > 0) {
        context.globalAlpha = tIntensity;
        const glowRadius = Math.min(
          300,
          Math.max(width, height) * 0.4 * zoomLevel,
        );
        const tGrad = context.createRadialGradient(
          sunProj.x,
          sunProj.y,
          0,
          sunProj.x,
          sunProj.y,
          glowRadius,
        );
        tGrad.addColorStop(0, "rgba(249, 115, 22, 0.95)");
        tGrad.addColorStop(0.25, "rgba(225, 29, 72, 0.6)");
        tGrad.addColorStop(0.6, "rgba(76, 29, 149, 0.2)");
        tGrad.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = tGrad;
        context.beginPath();
        context.arc(sunProj.x, sunProj.y, glowRadius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
      }
    }

    const zoomScale = Math.max(1, 1 + (zoomLevel - 1) * 0.2); // Batasi pembesaran garis rasi agar tidak terlalu tebal saat di-zoom

    // 2. RENDER BIMA SAKTI
    if (dayIntensity < 0.8) {
      context.globalAlpha = 1 - dayIntensity;
      for (const cloud of projectedMilkyWay) {
        const proj = projectPlanetarium(
          cloud.baseAlt,
          cloud.baseAz,
          viewAngle.alt,
          viewAngle.az,
          centerX,
          centerY,
          fovScale,
        );
        if (!proj) continue;

        const cloudRadius = cloud.size * zoomScale;
        context.beginPath();
        context.arc(proj.x, proj.y, cloudRadius, 0, Math.PI * 2);

        const grad = context.createRadialGradient(
          proj.x,
          proj.y,
          0,
          proj.x,
          proj.y,
          cloudRadius,
        );
        grad.addColorStop(0, `rgba(147, 197, 253, ${cloud.alpha})`);
        grad.addColorStop(0.5, `rgba(167, 139, 250, ${cloud.alpha * 0.4})`);
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");

        context.fillStyle = grad;
        context.fill();
      }
      context.globalAlpha = 1;
    }

    // 3. PROYEKSI SEMUA OBJEK BINTANG
    const visibleStars = new Map<number, ProjectedStar>();
    const projectVisibleObject = (obj: any) => {
      const proj = projectPlanetarium(
        obj.baseAlt,
        obj.baseAz,
        viewAngle.alt,
        viewAngle.az,
        centerX,
        centerY,
        fovScale,
      );
      if (!proj) return;
      visibleStars.set(obj.id, { ...obj, x: proj.x, y: proj.y });
    };

    for (const star of baseStars) projectVisibleObject(star);
    for (const dso of baseDsos) {
      projectVisibleObject(dso);
    }
    if (filters.planets) {
      for (const planet of basePlanets) projectVisibleObject(planet);
    }
    renderedStarsRef.current = visibleStars;

    // DSO RENDER
    if (dayIntensity < 0.75) {
      context.globalAlpha = 1 - dayIntensity * 0.9;

      for (const dso of baseDsos) {
        const proj = projectPlanetarium(
          dso.baseAlt,
          dso.baseAz,
          viewAngle.alt,
          viewAngle.az,
          centerX,
          centerY,
          fovScale,
        );

        if (!proj) continue;

        // Skip DSO redup saat zoom kecil
        if (zoomLevel < 1.5 && dso.mag > 7) continue;

        const size =
          Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
          Math.max(1, zoomLevel * 0.5);

        context.save();

        context.translate(proj.x, proj.y);

        context.shadowBlur = 20 * zoomScale;
        context.shadowColor = dso.color;

        switch (dso.type) {
          case "galaxy":
            context.strokeStyle = dso.color;
            context.lineWidth = 1.5 * zoomScale;

            context.beginPath();
            context.ellipse(
              0,
              0,
              size * 1.8,
              size,
              Math.PI / 5,
              0,
              Math.PI * 2,
            );
            context.stroke();
            break;

          case "nebula":
            {
              const grad = context.createRadialGradient(
                0,
                0,
                0,
                0,
                0,
                size * 3,
              );

              grad.addColorStop(0, `${dso.color}bb`);
              grad.addColorStop(1, `${dso.color}00`);

              context.fillStyle = grad;

              context.beginPath();
              context.arc(0, 0, size * 3, 0, Math.PI * 2);
              context.fill();
            }
            break;

          case "cluster":
            context.fillStyle = dso.color;

            for (let i = 0; i < 10; i++) {
              const angle = (Math.PI * 2 * i) / 10;
              const r = size * 1.5;

              context.beginPath();
              context.arc(
                Math.cos(angle) * r * 0.5,
                Math.sin(angle) * r * 0.5,
                1.2 * zoomScale,
                0,
                Math.PI * 2,
              );
              context.fill();
            }
            break;

          default:
            context.fillStyle = dso.color;

            context.beginPath();
            context.arc(0, 0, size, 0, Math.PI * 2);
            context.fill();
        }

        context.shadowBlur = 0;

        // LABEL DSO
        if (zoomLevel > 2.2) {
          context.fillStyle = "rgba(255,255,255,0.8)";
          context.font = `${10 * zoomScale}px monospace`;
          context.textAlign = "center";

          context.fillText(dso.messier || dso.name, 0, -size * 3);
        }

        context.restore();
      }

      context.globalAlpha = 1;
    }
    // RASI BINTANG
    if (filters.constellations && dayIntensity < 0.9) {
      context.globalAlpha = 1 - dayIntensity;
      context.strokeStyle = "rgba(125, 211, 252, 0.25)";
      context.lineWidth = (isMobile ? 0.7 : 1.2) * zoomScale;
      context.setLineDash(isMobile ? [2, 4] : [3, 6]);

      for (const constellation of constellations) {
        const nodes: ProjectedStar[] = [];
        for (const [startId, endId] of constellation.lines) {
          const start = visibleStars.get(startId);
          const end = visibleStars.get(endId);
          if (!start || !end) continue;

          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();

          if (!nodes.includes(start)) nodes.push(start);
          if (!nodes.includes(end)) nodes.push(end);
        }

        if (nodes.length > 0) {
          const lx = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length;
          const ly = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length;

          context.setLineDash([]);
          context.font = `bold ${(isMobile ? 8 : 10) * zoomScale}px 'Courier New', monospace`;
          context.shadowBlur = 4;
          context.shadowColor = "#000000";
          context.fillStyle = "rgba(148, 163, 184, 0.6)";
          context.textAlign = "center";
          context.fillText(
            constellation.name.toUpperCase(),
            lx,
            ly - 12 * zoomScale,
          );
          context.shadowBlur = 0;
          context.setLineDash(isMobile ? [2, 4] : [3, 6]);
        }
      }
      context.globalAlpha = 1;
    }

    context.setLineDash([]);
    const MAG_LIMIT_BASE = filters.faintStars ? MAX_MAG : 3.5;

    // Logika Pintar: Jika kita zoom sangat dalam, tunjukkan lebih banyak bintang redup agar tidak terlihat sepi
    let adjustedMagLimit = MAG_LIMIT_BASE;
    if (zoomLevel > 3.0) adjustedMagLimit += (zoomLevel - 3.0) * 0.5; // Menambah magnitudo yang terlihat seiring zoom

    const CURRENT_MAG_LIMIT =
      adjustedMagLimit - dayIntensity * (adjustedMagLimit - -2);

    for (const star of visibleStars.values()) {
      if (!star.isPlanet) {
        if (star.mag > CURRENT_MAG_LIMIT) continue;

        const normalizedMagnitude = Math.max(0, (MAX_MAG - star.mag) / MAX_MAG);
        const radiusPx =
          Math.max(
            isMobile ? 0.6 : 0.4,
            normalizedMagnitude * (isMobile ? 3.0 : 2.6) + 0.2,
          ) * zoomScale;

        const starColor = getStarColor(star.bv);
        context.globalAlpha = Math.min(
          1,
          Math.max(0.1, (adjustedMagLimit - star.mag) / 5.5),
        );

        if (star.mag < 2.5 && dayIntensity < 0.5) {
          context.shadowBlur = (3 - star.mag) * 4 * zoomScale;
          context.shadowColor = starColor;
        } else {
          context.shadowBlur = 0;
        }

        context.fillStyle = starColor;
        context.beginPath();
        context.arc(star.x, star.y, radiusPx, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
        continue;
      }

      const planetScale = 1 + (zoomLevel - 1) * 0.8; // Planet membesar lebih signifikan saat zoom
      context.globalAlpha = 1;
      const radiusPx = (star.radiusPx || 4) * planetScale;

      if (star.id === 0) {
        context.shadowBlur = 50 * zoomScale;
        context.shadowColor = "#f59e0b";
        context.fillStyle = "rgba(251, 191, 36, 0.4)";
        context.beginPath();
        context.arc(star.x, star.y, radiusPx * 4, 0, Math.PI * 2);
        context.fill();

        context.shadowBlur = 10 * zoomScale;
        context.fillStyle = "#fffbeb";
        context.beginPath();
        context.arc(star.x, star.y, radiusPx * 1.5, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      } else {
        context.shadowBlur = 15 * zoomScale;
        context.shadowColor = star.colorStr || "#ffffff";
        context.fillStyle = star.colorStr || "#ffffff";
        context.beginPath();
        context.arc(
          star.x,
          star.y,
          isMobile ? radiusPx * 1.2 : radiusPx,
          0,
          Math.PI * 2,
        );
        context.fill();

        context.shadowBlur = 0;
        context.fillStyle = "rgba(255, 255, 255, 0.75)";
        context.beginPath();
        context.arc(
          star.x,
          star.y,
          (isMobile ? radiusPx * 1.2 : radiusPx) * 0.4,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    }
    context.globalAlpha = 1;

    // 4. GARIS HORIZON (Putus-putus)
    context.beginPath();
    context.strokeStyle = "rgba(56, 189, 248, 0.3)";
    context.lineWidth = 1.5 * zoomScale;
    context.setLineDash([4 * zoomScale, 6 * zoomScale]);
    let firstLine = true;
    for (let az = 0; az <= 360; az += 2) {
      const proj = projectPlanetarium(
        0,
        az,
        viewAngle.alt,
        viewAngle.az,
        centerX,
        centerY,
        fovScale,
      );
      if (proj) {
        if (firstLine) {
          context.moveTo(proj.x, proj.y);
          firstLine = false;
        } else context.lineTo(proj.x, proj.y);
      } else {
        firstLine = true;
      }
    }
    context.stroke();
    context.setLineDash([]);

    // KOMPAS
    context.textAlign = "center";
    context.fillStyle = "rgba(56, 189, 248, 0.8)";
    context.font = `bold ${isMobile ? 10 * zoomScale : 12 * zoomScale}px 'Courier New', monospace`;

    for (const point of CARDINAL_POINTS) {
      const proj = projectPlanetarium(
        0,
        point.az,
        viewAngle.alt,
        viewAngle.az,
        centerX,
        centerY,
        fovScale,
      );
      if (proj && proj.visible) {
        context.fillText(point.label, proj.x, proj.y + 16 * zoomScale);
      }
    }

    // 5. RADAR TARGET AKTIF
    if (activeTarget) {
      const t = visibleStars.get(activeTarget.id);
      if (t) {
        const timeOff = Date.now() / 400;
        context.save();
        context.translate(t.x, t.y);
        const crosshairLength = 35 * zoomScale;
        const innerGap = 15 * zoomScale;

        context.setLineDash([]);
        context.lineWidth = 1;
        context.strokeStyle = "rgba(34, 197, 94, 0.6)";
        context.beginPath();
        context.moveTo(-crosshairLength, 0);
        context.lineTo(-innerGap, 0);
        context.moveTo(crosshairLength, 0);
        context.lineTo(innerGap, 0);
        context.moveTo(0, -crosshairLength);
        context.lineTo(0, -innerGap);
        context.moveTo(0, crosshairLength);
        context.lineTo(0, innerGap);
        context.stroke();

        context.rotate(timeOff);
        context.strokeStyle = "rgba(34, 197, 94, 0.9)";
        context.lineWidth = 1.5;
        context.setLineDash([8, 6]);
        context.beginPath();
        context.arc(0, 0, 24 * zoomScale, 0, Math.PI * 2);
        context.stroke();

        context.restore();
      }
    }
  }, [
    basePlanets,
    baseStars,
    constellations,
    filters,
    isMobile,
    viewAngle,
    activeTarget,
    zoomLevel,
    projectedMilkyWay,
  ]);

  // DRAG HANDLER & MULTI-TOUCH PINCH ZOOM
  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Catat pointer yang aktif
      activePointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      // ─── LOGIKA ZOOM 2 JARI (PINCH TO ZOOM) ───
      if (
        activePointers.current.size === 2 &&
        initialPinchDist.current !== null
      ) {
        const pts = Array.from(activePointers.current.values());
        const currentDist = Math.hypot(
          pts[0].x - pts[1].x,
          pts[0].y - pts[1].y,
        );
        const scale = currentDist / initialPinchDist.current;

        setZoomLevel(
          Math.max(0.15, Math.min(15.0, initialZoom.current * scale)),
        );
        return; // Batalkan drag kamera selama user sedang pinch-to-zoom
      }

      // ─── LOGIKA DRAG KAMERA (1 Jari / Mouse) ───
      if (activePointers.current.size === 1 && isDraggingRef.current) {
        const deltaX = event.clientX - lastPointerRef.current.x;
        const deltaY = event.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: event.clientX, y: event.clientY };

        const baseSensitivity = isMobile
          ? VIEW_SENSITIVITY * 0.8
          : VIEW_SENSITIVITY;
        const sensitivity = baseSensitivity / zoomLevelRef.current; // Semakin dalam zoom, drag semakin pelan agar tidak pusing

        setViewAngle((prev) => ({
          az: normalizeAzimuth(prev.az - deltaX * sensitivity),
          alt: Math.max(-90, Math.min(90, prev.alt + deltaY * sensitivity)),
        }));
        return;
      }

      // ─── LOGIKA HOVER (Tampilan Tooltip Nama Bintang) ───
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      let closestStar: ProjectedStar | null = null;
      let minimumDistance = isMobile
        ? MOBILE_HOVER_RADIUS
        : DESKTOP_HOVER_RADIUS;

      for (const star of renderedStarsRef.current.values()) {
        const distance = Math.hypot(star.x - mouseX, star.y - mouseY);
        if (distance < minimumDistance) {
          minimumDistance = distance;
          closestStar = star;
        }
      }

      const hoveredStar = closestStar
        ? {
            id: closestStar.id,
            name: closestStar.name,
            mag: closestStar.mag,
            bv: closestStar.bv,
            alt: closestStar.baseAlt,
            az: closestStar.baseAz,
          }
        : null;

      if (hoveredStarRef.current?.id === hoveredStar?.id) return;
      hoveredStarRef.current = hoveredStar;
      onStarHover(hoveredStar);
    },
    [isMobile, onStarHover],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (activePointers.current.size === 1) {
        // User melakukan drag layar tunggal
        isDraggingRef.current = true;
        setIsDragging(true);
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
      } else if (activePointers.current.size === 2) {
        // User menaruh jari kedua (Persiapan Zoom)
        isDraggingRef.current = false;
        setIsDragging(false);
        const pts = Array.from(activePointers.current.values());
        initialPinchDist.current = Math.hypot(
          pts[0].x - pts[1].x,
          pts[0].y - pts[1].y,
        );
        initialZoom.current = zoomLevelRef.current; // Kunci zoom awal sebelum direnggangkan
      }

      if (activeTarget) onClearTarget(); // Hentikan auto-tracking jika user menyentuh layar
    },
    [activeTarget, onClearTarget],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      activePointers.current.delete(event.pointerId);

      if (activePointers.current.size < 2) {
        initialPinchDist.current = null; // Matikan status pinch-zoom
      }

      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        // Jika sisa 1 jari setelah zoom, lanjutkan sebagai drag dari posisi jari tersebut
        const remaining = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: remaining.x, y: remaining.y };
        isDraggingRef.current = true;
        setIsDragging(true);
      }
    },
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full select-none touch-none"
      style={{
        cursor: isDragging ? "grabbing" : "crosshair",
        touchAction: "none", // Mematikan perilaku refresh Tarik-ke-bawah (Pull-to-refresh) di HP
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}
