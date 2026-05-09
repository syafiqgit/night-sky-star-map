"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
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

type RenderableObject = Pick<ProjectedStar, "id" | "baseAlt" | "baseAz"> &
  Partial<ProjectedStar>;

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
    gridHorizontal?: boolean; // Penambahan fitur toggle grid Alt/Az
    gridEquatorial?: boolean; // Penambahan fitur toggle grid RA/Dec
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
const CLICK_MOVE_THRESHOLD = 6;

const TARGET_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32' fill='none'%3E%3Ccircle cx='16' cy='16' r='10' stroke='%23ffffff' stroke-width='2'/%3E%3Ccircle cx='16' cy='16' r='2' fill='%23ffffff'/%3E%3C/svg%3E") 16 16, crosshair`;

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

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

  const c = Math.acos(clamp(cosC, -1, 1));
  if (c > Math.PI * 0.95) return null;

  const sinC = Math.sin(c);
  const k = c === 0 ? 1 : c / sinC;
  const x = k * Math.cos(altRad) * Math.sin(deltaAz);
  const y =
    k *
    (Math.cos(camAlt) * Math.sin(altRad) -
      Math.sin(camAlt) * Math.cos(altRad) * Math.cos(deltaAz));

  return {
    x: centerX + x * scale,
    y: centerY - y * scale,
    visible: true,
  };
}

function getStarColor(bv?: number): string {
  if (bv === undefined) return "#ffffff";
  if (bv < -0.1) return "#e0f2fe";
  if (bv < 0.5) return "#ffffff";
  if (bv < 1.0) return "#fef08a";
  if (bv < 1.5) return "#fed7aa";
  return "#fca5a5";
}

function buildMilkyWayDust() {
  const dust: Array<{ ra: number; dec: number; size: number; alpha: number }> =
    [];

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

  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const didPointerMoveRef = useRef(false);
  const isDraggingRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);

  const prevLocationRef = useRef({ lat: observer.lat, lon: observer.lon });

  const [viewAngle, setViewAngle] = useState(() => {
    return {
      az: observer.lat < 0 ? 0 : 180,
      alt: clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45),
    };
  });

  const latestObjectsRef = useRef<Map<number, RenderableObject>>(new Map());

  const [zoomLevel, setZoomLevel] = useState(0.85);
  const zoomLevelRef = useRef(0.85);

  const prevTargetRef = useRef<any>(null);
  const isAutoZoomingOutRef = useRef(false);

  useEffect(() => {
    const latChanged =
      Math.abs(observer.lat - prevLocationRef.current.lat) > 0.0001;
    const lonChanged =
      Math.abs(observer.lon - prevLocationRef.current.lon) > 0.0001;

    if (latChanged || lonChanged) {
      if (latChanged) {
        setViewAngle({
          az: observer.lat < 0 ? 0 : 180,
          alt: clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45),
        });
      }

      if (!activeTarget) {
        requestAnimationFrame(() => {
          setViewAngle((current) => ({ ...current }));
        });
      }

      prevLocationRef.current = { lat: observer.lat, lon: observer.lon };
    }
  }, [observer.lat, observer.lon, activeTarget]);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      isAutoZoomingOutRef.current = false;

      if (activeTarget) onClearTarget();

      setZoomLevel((prev) => {
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        return clamp(prev * zoomFactor, 0.45, 10.0);
      });
    };

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

  const baseMilkyWay = useMemo(() => buildMilkyWayDust(), []);

  const baseStars = useMemo(() => {
    const safeObserver = {
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    };

    return stars.map((star) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: star.ra, dec: star.dec },
        safeObserver as any,
        time,
      );

      return { ...star, baseAlt: altitude, baseAz: azimuth };
    });
  }, [observer.lat, observer.lon, stars, time]);

  const basePlanets = useMemo(() => {
    const safeObserver = {
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    };

    return getSolarSystemObjects(time, solarSystem).map((planet) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: planet.ra, dec: planet.dec },
        safeObserver as any,
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
  }, [observer.lat, observer.lon, time, solarSystem]);

  const baseDsos = useMemo(() => {
    const safeObserver = {
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    };

    return dsos.map((dso) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: dso.ra, dec: dso.dec },
        safeObserver as any,
        time,
      );

      return {
        ...dso,
        baseAlt: altitude,
        baseAz: azimuth,
      };
    });
  }, [dsos, observer.lat, observer.lon, time]);

  const projectedMilkyWay = useMemo(() => {
    const safeObserver = {
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    };

    return baseMilkyWay.map((cloud) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: cloud.ra, dec: cloud.dec },
        safeObserver as any,
        time,
      );

      return { ...cloud, baseAlt: altitude, baseAz: azimuth };
    });
  }, [baseMilkyWay, observer.lat, observer.lon, time]);

  // ─── MEMOISASI SIMPUL GRID EKUATORIAL (RA/DEC) ──────────────────────────────
  // Menghitung titik absolut bola langit secara presisi dan ringan di belakang layar.
  const equatorialGridNodes = useMemo(() => {
    if (!filters.gridEquatorial) {
      return { raLines: [], decLines: [], equatorNodes: [] };
    }

    const raLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const decLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const equatorNodes: Array<{ baseAlt: number; baseAz: number }> = [];

    const safeObserver = {
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    };

    // 1. Garis Bujur RA (Right Ascension) setiap 1 jam (15 derajat)
    for (let ra = 0; ra < 360; ra += 15) {
      const lineNodes: Array<{ baseAlt: number; baseAz: number }> = [];
      for (let dec = -85; dec <= 85; dec += 3) {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra, dec },
          safeObserver as any,
          time,
        );
        lineNodes.push({ baseAlt: altitude, baseAz: azimuth });
      }
      raLines.push(lineNodes);
    }

    // 2. Garis Paralel Dec (Declination) setiap 15 derajat
    for (let dec = -75; dec <= 75; dec += 15) {
      if (dec === 0) continue; // Ekuator 0° dipisahkan khusus
      const lineNodes: Array<{ baseAlt: number; baseAz: number }> = [];
      for (let ra = 0; ra <= 360; ra += 3) {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: ra % 360, dec },
          safeObserver as any,
          time,
        );
        lineNodes.push({ baseAlt: altitude, baseAz: azimuth });
      }
      decLines.push(lineNodes);
    }

    // 3. Garis Utama Ekuator Langit (Dec = 0°)
    for (let ra = 0; ra <= 360; ra += 3) {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: ra % 360, dec: 0 },
        safeObserver as any,
        time,
      );
      equatorNodes.push({ baseAlt: altitude, baseAz: azimuth });
    }

    return { raLines, decLines, equatorNodes };
  }, [filters.gridEquatorial, observer.lat, observer.lon, time]);

  useEffect(() => {
    const objectMap = new Map<number, RenderableObject>();

    for (const star of baseStars) objectMap.set(star.id, star);
    for (const planet of basePlanets) objectMap.set(planet.id, planet);
    for (const dso of baseDsos) objectMap.set(dso.id, dso);

    latestObjectsRef.current = objectMap;
  }, [baseStars, basePlanets, baseDsos]);

  useEffect(() => {
    let frameId = 0;
    let isActive = true;

    if (prevTargetRef.current !== null && activeTarget === null) {
      isAutoZoomingOutRef.current = true;
    }
    prevTargetRef.current = activeTarget;

    const animate = () => {
      if (!isActive) return;
      let isMoving = false;

      if (activeTarget) {
        isAutoZoomingOutRef.current = false;

        setZoomLevel((prev) => {
          const diffZ = 4.5 - prev;
          if (Math.abs(diffZ) > 0.005) {
            isMoving = true;
            return prev + diffZ * 0.08;
          }
          return 4.5;
        });

        const targetObj = latestObjectsRef.current.get(activeTarget.id);
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
                alt: clamp(prev.alt + diffAlt * 0.08, -90, 90),
              };
            }

            isMoving = true;
            return {
              az: targetObj.baseAz,
              alt: clamp(targetAlt, -90, 90),
            };
          });
        }
      } else if (isAutoZoomingOutRef.current) {
        setZoomLevel((prev) => {
          const defaultZoom = 0.85;
          const diffZ = defaultZoom - prev;
          if (Math.abs(diffZ) > 0.005) {
            isMoving = true;
            return prev + diffZ * 0.06;
          }
          isAutoZoomingOutRef.current = false;
          return defaultZoom;
        });
      }

      if (isMoving || activeTarget || isAutoZoomingOutRef.current) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      isActive = false;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [activeTarget]);

  const findClosestStar = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return null;

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

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

      return closestStar;
    },
    [isMobile],
  );

  const selectStarAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const closestStar = findClosestStar(clientX, clientY);

      const selectedStar = closestStar
        ? {
            id: closestStar.id,
            name: closestStar.name,
            mag: closestStar.mag,
            bv: closestStar.bv,
            alt: closestStar.baseAlt,
            az: closestStar.baseAz,
          }
        : null;

      onStarHover(selectedStar);
    },
    [findClosestStar, onStarHover],
  );

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

    // Inline projection helper penangkap scope
    const proj = (bAlt: number, bAz: number) =>
      projectPlanetarium(
        bAlt,
        bAz,
        viewAngle.alt,
        viewAngle.az,
        centerX,
        centerY,
        fovScale,
      );

    if (filters.atmosphere && sunData && sunAlt > -18 && sunAlt < 10) {
      const sunProj = proj(sunData.baseAlt, sunData.baseAz);

      const tIntensity =
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

    if (filters.atmosphere && sunAlt < -4) {
      const nightStrength = clamp((-sunAlt - 4) / 18, 0, 1);

      if (nightStrength > 0.04) {
        context.save();
        context.globalCompositeOperation = "screen";

        const hazeRadius = Math.max(width, height) * (0.95 + zoomLevel * 0.08);
        const glowX =
          centerX + Math.cos((viewAngle.az * Math.PI) / 180) * width * 0.08;
        const glowY =
          centerY -
          Math.sin(((viewAngle.alt - 12) * Math.PI) / 180) * height * 0.08;

        const skyGrad = context.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, `rgba(125, 211, 252, ${0.05 * nightStrength})`);
        skyGrad.addColorStop(
          0.45,
          `rgba(96, 165, 250, ${0.035 * nightStrength})`,
        );
        skyGrad.addColorStop(1, `rgba(30, 64, 175, ${0.02 * nightStrength})`);

        context.globalAlpha = 1;
        context.fillStyle = skyGrad;
        context.fillRect(0, 0, width, height);

        const hazeGrad = context.createRadialGradient(
          glowX,
          glowY,
          0,
          glowX,
          glowY,
          hazeRadius,
        );

        hazeGrad.addColorStop(
          0,
          `rgba(147, 197, 253, ${0.18 * nightStrength})`,
        );
        hazeGrad.addColorStop(
          0.35,
          `rgba(96, 165, 250, ${0.12 * nightStrength})`,
        );
        hazeGrad.addColorStop(
          0.7,
          `rgba(59, 130, 246, ${0.06 * nightStrength})`,
        );
        hazeGrad.addColorStop(1, "rgba(0,0,0,0)");

        context.fillStyle = hazeGrad;
        context.beginPath();
        context.arc(glowX, glowY, hazeRadius, 0, Math.PI * 2);
        context.fill();

        const hazeGrad2 = context.createRadialGradient(
          centerX,
          centerY * 0.85,
          0,
          centerX,
          centerY * 0.85,
          hazeRadius * 0.7,
        );

        hazeGrad2.addColorStop(
          0,
          `rgba(186, 230, 253, ${0.08 * nightStrength})`,
        );
        hazeGrad2.addColorStop(
          0.5,
          `rgba(96, 165, 250, ${0.04 * nightStrength})`,
        );
        hazeGrad2.addColorStop(1, "rgba(0,0,0,0)");

        context.fillStyle = hazeGrad2;
        context.beginPath();
        context.arc(centerX, centerY * 0.85, hazeRadius * 0.7, 0, Math.PI * 2);
        context.fill();

        context.restore();
        context.globalAlpha = 1;
      }
    }

    const zoomScale = Math.max(1, 1 + (zoomLevel - 1) * 0.2);

    if (dayIntensity < 0.8) {
      context.globalAlpha = 1 - dayIntensity;

      for (const cloud of projectedMilkyWay) {
        const p = proj(cloud.baseAlt, cloud.baseAz);

        if (!p) continue;

        const cloudRadius = cloud.size * zoomScale;

        context.beginPath();
        context.arc(p.x, p.y, cloudRadius, 0, Math.PI * 2);

        const grad = context.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
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

    const visibleStars = new Map<number, ProjectedStar>();

    const projectVisibleObject = (obj: RenderableObject) => {
      const p = proj(obj.baseAlt, obj.baseAz);

      if (!p) return;
      visibleStars.set(obj.id, {
        ...(obj as ProjectedStar),
        x: p.x,
        y: p.y,
      });
    };

    for (const star of baseStars) projectVisibleObject(star);
    for (const dso of baseDsos) projectVisibleObject(dso);
    if (filters.planets) {
      for (const planet of basePlanets) projectVisibleObject(planet);
    }

    renderedStarsRef.current = visibleStars;

    if (dayIntensity < 0.75) {
      context.globalAlpha = 1 - dayIntensity * 0.9;

      for (const dso of baseDsos) {
        const p = proj(dso.baseAlt, dso.baseAz);

        if (!p) continue;
        if (zoomLevel < 1.5 && dso.mag > 7) continue;

        const size =
          Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
          Math.max(1, zoomLevel * 0.5);

        context.save();
        context.translate(p.x, p.y);

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

          case "nebula": {
            const grad = context.createRadialGradient(0, 0, 0, 0, 0, size * 3);
            grad.addColorStop(0, `${dso.color}bb`);
            grad.addColorStop(1, `${dso.color}00`);
            context.fillStyle = grad;
            context.beginPath();
            context.arc(0, 0, size * 3, 0, Math.PI * 2);
            context.fill();
            break;
          }

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

    // ─── PENGGAMBARAN JALUR GRID AMAN DENGAN PEMUTUS GARIS (CLIP PROJECTION) ───
    const drawProjectedPath = (
      nodes: Array<{ baseAlt: number; baseAz: number }>,
      color: string,
      lineWidth: number,
      dashPattern: number[] = [],
    ) => {
      context.beginPath();
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.setLineDash(dashPattern);

      let isDrawing = false;

      for (const node of nodes) {
        const p = proj(node.baseAlt, node.baseAz);
        if (p) {
          if (!isDrawing) {
            context.moveTo(p.x, p.y);
            isDrawing = true;
          } else {
            context.lineTo(p.x, p.y);
          }
        } else {
          isDrawing = false; // Putuskan garis jika keluar dari cakrawala pandangan
        }
      }
      context.stroke();
    };

    // ─── 1. MENGGAMBAR GRID HORIZONTAL (ALT/AZ) - SOFT CYAN ───────────────────
    if (filters.gridHorizontal) {
      // Garis Azimuth (Vertikal mata angin: dari Zenith 90° turun ke Horizon 0°)
      for (let az = 0; az < 360; az += 30) {
        const azNodes = [];
        for (let alt = 0; alt <= 90; alt += 3) {
          azNodes.push({ baseAlt: alt, baseAz: az });
        }
        drawProjectedPath(
          azNodes,
          "rgba(56, 189, 248, 0.15)",
          1 * zoomScale,
          [2, 4],
        );
      }

      // Garis Altitude (Konsentris elevasi: melingkari Zenith pada 15°, 30°, dst)
      for (let alt = 15; alt <= 75; alt += 15) {
        const altNodes = [];
        for (let az = 0; az <= 360; az += 3) {
          altNodes.push({ baseAlt: alt, baseAz: az % 360 });
        }
        drawProjectedPath(
          altNodes,
          "rgba(56, 189, 248, 0.2)",
          1 * zoomScale,
          [2, 4],
        );
      }
    }

    // ─── 2. MENGGAMBAR GRID EKUATORIAL (RA/DEC) - AMBER/JINGGA ────────────────
    if (filters.gridEquatorial) {
      const { raLines, decLines, equatorNodes } = equatorialGridNodes;

      // Gambar garis bujur RA dan paralel Dec (putus-putus jingga tipis)
      for (const line of raLines) {
        drawProjectedPath(
          line,
          "rgba(245, 158, 11, 0.18)",
          1 * zoomScale,
          [3, 5],
        );
      }
      for (const line of decLines) {
        drawProjectedPath(
          line,
          "rgba(245, 158, 11, 0.18)",
          1 * zoomScale,
          [3, 5],
        );
      }

      // Gambar Ekuator Langit secara spesifik (solid, tebal, dan sedikit berpendar)
      if (equatorNodes.length > 0) {
        context.save();
        context.shadowBlur = 6 * zoomScale;
        context.shadowColor = "rgba(245, 158, 11, 0.8)";
        drawProjectedPath(
          equatorNodes,
          "rgba(245, 158, 11, 0.6)",
          1.5 * zoomScale,
          [],
        );
        context.restore();
      }
    }

    context.setLineDash([]); // Reset pola putus-putus untuk bintang dan planet

    const MAG_LIMIT_BASE = filters.faintStars ? MAX_MAG : 3.5;

    let adjustedMagLimit = MAG_LIMIT_BASE;
    if (zoomLevel > 3.0) adjustedMagLimit += (zoomLevel - 3.0) * 0.5;

    const CURRENT_MAG_LIMIT =
      adjustedMagLimit - dayIntensity * (adjustedMagLimit + 2);

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

      const planetScale = 1 + (zoomLevel - 1) * 0.8;
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
        const drawRadius = isMobile ? radiusPx * 1.2 : radiusPx;

        context.shadowBlur = 15 * zoomScale;
        context.shadowColor = star.colorStr || "#ffffff";
        context.fillStyle = star.colorStr || "#ffffff";
        context.beginPath();
        context.arc(star.x, star.y, drawRadius, 0, Math.PI * 2);
        context.fill();

        context.shadowBlur = 0;
        context.fillStyle = "rgba(255, 255, 255, 0.75)";
        context.beginPath();
        context.arc(star.x, star.y, drawRadius * 0.4, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.globalAlpha = 1;

    context.beginPath();
    context.strokeStyle = "rgba(56, 189, 248, 0.3)";
    context.lineWidth = 1.5 * zoomScale;
    context.setLineDash([4 * zoomScale, 6 * zoomScale]);

    let firstLine = true;
    for (let az = 0; az <= 360; az += 2) {
      const p = proj(0, az);

      if (p) {
        if (firstLine) {
          context.moveTo(p.x, p.y);
          firstLine = false;
        } else {
          context.lineTo(p.x, p.y);
        }
      } else {
        firstLine = true;
      }
    }

    context.stroke();
    context.setLineDash([]);

    context.textAlign = "center";
    context.fillStyle = "rgba(56, 189, 248, 0.8)";
    context.font = `bold ${isMobile ? 10 * zoomScale : 12 * zoomScale}px 'Courier New', monospace`;

    for (const point of CARDINAL_POINTS) {
      const p = proj(0, point.az);

      if (p && p.visible) {
        context.fillText(point.label, p.x, p.y + 16 * zoomScale);
      }
    }

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
    baseDsos,
    equatorialGridNodes,
  ]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      activePointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (
        pointerDownRef.current &&
        !didPointerMoveRef.current &&
        Math.hypot(
          event.clientX - pointerDownRef.current.x,
          event.clientY - pointerDownRef.current.y,
        ) > CLICK_MOVE_THRESHOLD
      ) {
        didPointerMoveRef.current = true;
      }

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

        setZoomLevel(clamp(initialZoom.current * scale, 0.15, 15.0));
        return;
      }

      if (activePointers.current.size === 1 && isDraggingRef.current) {
        const deltaX = event.clientX - lastPointerRef.current.x;
        const deltaY = event.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: event.clientX, y: event.clientY };

        const baseSensitivity = isMobile
          ? VIEW_SENSITIVITY * 0.8
          : VIEW_SENSITIVITY;
        const sensitivity = baseSensitivity / zoomLevelRef.current;

        if (Math.hypot(deltaX, deltaY) > CLICK_MOVE_THRESHOLD) {
          didPointerMoveRef.current = true;
        }

        setViewAngle((prev) => ({
          az: normalizeAzimuth(prev.az - deltaX * sensitivity),
          alt: clamp(prev.alt + deltaY * sensitivity, -90, 90),
        }));
        return;
      }
    },
    [isMobile],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      isAutoZoomingOutRef.current = false;

      activePointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      pointerDownRef.current = { x: event.clientX, y: event.clientY };
      didPointerMoveRef.current = false;

      if (activePointers.current.size === 1) {
        isDraggingRef.current = true;
        setIsDragging(true);
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
      } else if (activePointers.current.size === 2) {
        isDraggingRef.current = false;
        setIsDragging(false);

        const pts = Array.from(activePointers.current.values());
        initialPinchDist.current = Math.hypot(
          pts[0].x - pts[1].x,
          pts[0].y - pts[1].y,
        );
        initialZoom.current = zoomLevelRef.current;
      }

      if (activeTarget) onClearTarget();
    },
    [activeTarget, onClearTarget],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const target = event.currentTarget;

      try {
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore capture-release race on pointer cancellation / edge cases.
      }

      const wasClick =
        activePointers.current.size === 1 &&
        !didPointerMoveRef.current &&
        pointerDownRef.current !== null;

      activePointers.current.delete(event.pointerId);

      if (activePointers.current.size < 2) {
        initialPinchDist.current = null;
      }

      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        const remaining = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: remaining.x, y: remaining.y };
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (wasClick) {
        selectStarAtPoint(event.clientX, event.clientY);
      }

      pointerDownRef.current = null;
      didPointerMoveRef.current = false;
    },
    [selectStarAtPoint],
  );

  const handlePointerCancelOrLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        const target = event.currentTarget;
        if (target.hasPointerCapture(event.pointerId)) {
          target.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore edge cases.
      }

      activePointers.current.delete(event.pointerId);

      if (activePointers.current.size < 2) {
        initialPinchDist.current = null;
      }

      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        const remaining = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: remaining.x, y: remaining.y };
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      pointerDownRef.current = null;
      didPointerMoveRef.current = false;
    },
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full select-none touch-none"
      style={{
        cursor: isDragging ? "grabbing" : TARGET_CURSOR,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancelOrLeave}
      onPointerLeave={handlePointerCancelOrLeave}
    />
  );
}
