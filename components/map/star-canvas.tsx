"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as satellite from "satellite.js";
import { equatorialToHorizontal } from "@/lib/astro/coordinates";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

/* ---------------------------------------------------------------- */
/* Types                                                             */
/* ---------------------------------------------------------------- */

interface ShootingStar {
  id: number;
  x: number;
  y: number;
  speed: number;
  angle: number;
  length: number;
  opacity: number;
}

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
  bv?: number;
  name?: string | null;
  isDouble?: boolean;
  separation?: number;
  positionAngle?: number;
  secondaryMag?: number;
  secondaryBv?: number;
  isVariable?: boolean;
  variablePeriod?: number;
  variableAmplitude?: number;
  variableType?: string;
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

export interface MinorBody {
  id: number;
  name: string;
  type: string;
  ra: number;
  dec: number;
  mag: number;
  color: string;
  tailLength?: number;
}

export interface ArtificialSatellite {
  id: number;
  name: string;
  type: string;
  color: string;
  tle1: string;
  tle2: string;
}

export interface MeteorShower {
  id: number;
  name: string;
  ra: number;
  dec: number;
  activeStart: string;
  activeEnd: string;
  color: string;
  zhr: number;
}

export interface HoveredStar {
  id: number | string;
  name?: string | null;
  mag: number;
  bv?: number;
  alt: number;
  az: number;
  type?: string;
}

interface ProjectedStar extends Star {
  baseAlt: number;
  baseAz: number;
  x: number;
  y: number;
  isPlanet?: boolean;
  colorStr?: string;
  radiusPx?: number;
  parent?: string;
}

type RenderableObject = Pick<ProjectedStar, "id" | "baseAlt" | "baseAz"> &
  Partial<ProjectedStar>;

export interface PopularConstellation {
  id: string;
  name: string;
  center: [number, number];
  lines: Array<Array<[number, number]>>;
  // --- Tambahan: Boundary Area ---
  boundaries?: Array<Array<[number, number]>>;
}

export interface StarCanvasProps {
  stars: Star[];
  constellations?: PopularConstellation[];
  solarSystem: any[];
  dsos: DeepSpaceObject[];
  minorBodies?: MinorBody[];
  satellites?: ArtificialSatellite[];
  meteorShowers?: MeteorShower[];
  observer: { lat: number; lon: number };
  time: Date;
  onStarHover: (star: HoveredStar | null) => void;
  filters: {
    constellations: boolean;
    faintStars: boolean;
    planets: boolean;
    atmosphere: boolean;
    minorBodies: boolean;
    satellites: boolean;
    meteorShowers: boolean;
    gridHorizontal?: boolean;
    gridEquatorial?: boolean;
  };
  activeTarget: any | null;
  onSelectTarget: (target: any) => void;
  onClearTarget: () => void;
  zoomLevel?: number;
  onZoomChange?: (newZoom: number) => void;
}

/* ---------------------------------------------------------------- */
/* Constants                                                         */
/* ---------------------------------------------------------------- */

const MAX_MAG = 6.5;
const VIEW_SENSITIVITY = 0.15;
const MOBILE_BREAKPOINT = 768;
const MOBILE_DPR = 1.5;
const DESKTOP_DPR = 2;
const MOBILE_HOVER_RADIUS = 28;
const DESKTOP_HOVER_RADIUS = 16;
const CLICK_MOVE_THRESHOLD = 6;
const MAX_FOV_DEG = 185;
const MIN_FOV_DEG = 0.000278;
const MIN_ZOOM_LEVEL = (2.5 * 180) / (Math.PI * MAX_FOV_DEG);
const MAX_ZOOM_LEVEL = (MAX_FOV_DEG / MIN_FOV_DEG) * MIN_ZOOM_LEVEL;
const DOUBLE_SPLIT_START = 4.5;
const DOUBLE_SPLIT_FULL = 7.0;

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

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeAzimuth(value: number): number {
  return ((value % 360) + 360) % 360;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getVariableMagOffset(
  period: number | undefined,
  amplitude: number | undefined,
  nowMs: number,
): number {
  if (!period || !amplitude) return 0;
  const periodMs = period * 86_400_000;
  const phase = (nowMs % periodMs) / periodMs;
  return -amplitude * Math.sin(phase * Math.PI * 2);
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

function buildMilkyWayDust() {
  const dust: Array<{ ra: number; dec: number; size: number; alpha: number }> =
    [];
  for (let i = 0; i < MILKY_WAY_NODES.length - 1; i++) {
    const p1 = MILKY_WAY_NODES[i],
      p2 = MILKY_WAY_NODES[i + 1];
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

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const C = x2 - x1,
    D = y2 - y1;
  const lenSq = C * C + D * D;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * C + (py - y1) * D) / lenSq));
  return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
}

function getObjectKey(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as { id?: unknown; name?: unknown; messier?: unknown };
    return getObjectKey(obj.id ?? obj.name ?? obj.messier);
  }
  return String(value);
}

function stableHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

/* ---------------------------------------------------------------- */
/* Satellite layout builder                                          */
/* ---------------------------------------------------------------- */

interface SatelliteLayout {
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  leaderX1: number;
  leaderY1: number;
  leaderX2: number;
  leaderY2: number;
}

function buildSatelliteLayout(
  parent: { x: number; y: number; radiusPx?: number; id: number | string },
  children: ProjectedStar[],
  zoomScale: number,
  planetScale: number,
  isMobile: boolean,
): Map<number, SatelliteLayout> {
  const layouts = new Map<number, SatelliteLayout>();
  if (children.length === 0) return layouts;

  const sorted = [...children].sort((a, b) =>
    `${a.name ?? ""}-${a.id}`.localeCompare(`${b.name ?? ""}-${b.id}`),
  );

  const diskR = (parent.radiusPx ?? 4) * planetScale;
  const baseOff = diskR + (isMobile ? 60 : 100) * zoomScale;
  const baseAngle =
    ((stableHash(getObjectKey(parent.id)) % 360) * Math.PI) / 180;
  const slotCount = Math.max(1, Math.min(8, sorted.length));

  sorted.forEach((child, index) => {
    const ring = Math.floor(index / slotCount);
    const slot = index % slotCount;
    const angle = baseAngle + (slot / slotCount) * Math.PI * 2 + ring * 0.45;
    const dist = baseOff + ring * 120 * zoomScale + slot * 15;
    const x = parent.x + Math.cos(angle) * dist;
    const y = parent.y + Math.sin(angle) * dist;
    layouts.set(child.id, {
      x,
      y,
      labelX: 0,
      labelY: 0,
      leaderX1: parent.x,
      leaderY1: parent.y,
      leaderX2: x,
      leaderY2: y,
    });
  });
  return layouts;
}

/* ---------------------------------------------------------------- */
/* Main component                                                    */
/* ---------------------------------------------------------------- */

export default function StarCanvas({
  stars,
  constellations = [],
  observer,
  time,
  onStarHover,
  filters,
  activeTarget,
  onSelectTarget,
  onClearTarget,
  solarSystem,
  dsos,
  minorBodies = [],
  satellites = [],
  meteorShowers = [],
  zoomLevel: externalZoomLevel = 0.85,
  onZoomChange,
}: StarCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedStarsRef = useRef<Map<number, ProjectedStar>>(new Map());
  const renderedConstellationsRef = useRef<
    Map<
      string,
      {
        id: string;
        name: string;
        x: number;
        y: number;
        baseAlt: number;
        baseAz: number;
        segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
      }
    >
  >(new Map());
  const renderedMinorBodiesRef = useRef<Map<number, any>>(new Map());
  const renderedSatellitesRef = useRef<Map<number, any>>(new Map());
  const renderedMeteorShowersRef = useRef<Map<number, any>>(new Map());

  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const didPointerMoveRef = useRef(false);
  const isDraggingRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [activeShootingStars, setActiveShootingStars] = useState<
    ShootingStar[]
  >([]);

  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const prevLocationRef = useRef({ lat: observer.lat, lon: observer.lon });

  const [viewAngle, setViewAngle] = useState(() => ({
    az: observer.lat < 0 ? 0 : 180,
    alt: clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45),
  }));

  const latestObjectsRef = useRef<Map<any, RenderableObject>>(new Map());

  const initialSafeZoom = useMemo(
    () => clamp(externalZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL),
    [externalZoomLevel],
  );

  const [internalZoomLevel, setInternalZoomLevel] = useState(initialSafeZoom);
  const currentZoomRef = useRef<number>(initialSafeZoom);

  useEffect(() => {
    const clamped = clamp(externalZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
    if (Math.abs(clamped - currentZoomRef.current) > 1e-6) {
      currentZoomRef.current = clamped;
      setInternalZoomLevel(clamped);
    }
  }, [externalZoomLevel]);

  const onZoomChangeRef = useRef(onZoomChange);
  const lastNotifiedZoomRef = useRef<number | null>(null);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  const updateZoomLevel = useCallback((updater: (prev: number) => number) => {
    const next = updater(currentZoomRef.current);
    const clamped = clamp(next, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
    if (Math.abs(clamped - currentZoomRef.current) > 1e-6) {
      currentZoomRef.current = clamped;
      setInternalZoomLevel(clamped);
      if (
        onZoomChangeRef.current &&
        (lastNotifiedZoomRef.current === null ||
          Math.abs(clamped - lastNotifiedZoomRef.current) > 1e-6)
      ) {
        lastNotifiedZoomRef.current = clamped;
        setTimeout(() => onZoomChangeRef.current?.(clamped), 0);
      }
    }
  }, []);

  const currentZoomLevel = internalZoomLevel;
  const zoomLevelRef = currentZoomRef;

  const prevTargetRef = useRef<any>(null);
  const isAutoZoomingOutRef = useRef(false);
  const projectedConstellationsRef = useRef<any[]>([]);

  useEffect(() => {
    const latChanged =
      Math.abs(observer.lat - prevLocationRef.current.lat) > 0.0001;
    const lonChanged =
      Math.abs(observer.lon - prevLocationRef.current.lon) > 0.0001;
    if (latChanged || lonChanged) {
      if (latChanged)
        setViewAngle({
          az: observer.lat < 0 ? 0 : 180,
          alt: clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45),
        });
      if (!activeTarget)
        requestAnimationFrame(() => setViewAngle((v) => ({ ...v })));
      prevLocationRef.current = { lat: observer.lat, lon: observer.lon };
    }
  }, [observer.lat, observer.lon, activeTarget?.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      isAutoZoomingOutRef.current = false;
      if (activeTarget) onClearTarget();
      updateZoomLevel((prev) => (e.deltaY > 0 ? prev * 0.92 : prev * 1.08));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [activeTarget, onClearTarget, updateZoomLevel]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = (e?: MediaQueryListEvent) =>
      setIsMobile(e?.matches ?? mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const baseMilkyWay = useMemo(() => buildMilkyWayDust(), []);

  const safeObserver = useMemo(
    () => ({
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    }),
    [observer.lat, observer.lon],
  );

  const baseStars = useMemo(
    () =>
      stars.map((star) => {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: star.ra, dec: star.dec },
          safeObserver as any,
          time,
        );
        return { ...star, baseAlt: altitude, baseAz: azimuth };
      }),
    [safeObserver, stars, time],
  );

  const basePlanets = useMemo(
    () =>
      getSolarSystemObjects(time, solarSystem)
        .map((planet: any) => {
          const orig =
            solarSystem.find((s: any) => String(s.id) === String(planet.id)) ||
            {};
          const parentVal = orig.parent || planet.parent;
          const radiusVal =
            orig.rPx ?? orig.radiusPx ?? planet.rPx ?? planet.radiusPx ?? 4;
          const colorVal = orig.color || planet.color || "#ffffff";
          const { altitude, azimuth } = equatorialToHorizontal(
            { ra: planet.ra, dec: planet.dec },
            safeObserver as any,
            time,
          );
          return {
            ...orig,
            ...planet,
            baseAlt: altitude,
            baseAz: azimuth,
            isPlanet: true,
            colorStr: colorVal,
            radiusPx: radiusVal,
            parent: parentVal,
          };
        })
        .sort((a: any, b: any) => (a.parent ? -1 : 1)),
    [safeObserver, time, solarSystem],
  );

  const baseDsos = useMemo(
    () =>
      dsos.map((dso) => {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: dso.ra, dec: dso.dec },
          safeObserver as any,
          time,
        );
        return { ...dso, baseAlt: altitude, baseAz: azimuth };
      }),
    [dsos, safeObserver, time],
  );

  const baseMinorBodies = useMemo(() => {
    if (!filters.minorBodies || !minorBodies.length) return [];
    return minorBodies.map((body) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: body.ra, dec: body.dec },
        safeObserver as any,
        time,
      );
      return { ...body, baseAlt: altitude, baseAz: azimuth };
    });
  }, [filters.minorBodies, minorBodies, safeObserver, time]);

  const baseSatellites = useMemo(() => {
    if (!filters.satellites || !satellites.length) return [];
    const observerGd = {
      longitude: observer.lon * (Math.PI / 180),
      latitude: observer.lat * (Math.PI / 180),
      height: 0.05,
    };
    return satellites.map((sat) => {
      try {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        const pv = satellite.propagate(satrec, time);
        if (typeof pv.position === "object") {
          const gmst = satellite.gstime(time);
          const ecf = satellite.eciToEcf(pv.position as any, gmst);
          const look = satellite.ecfToLookAngles(observerGd, ecf);
          return {
            ...sat,
            baseAlt: look.elevation * (180 / Math.PI),
            baseAz: look.azimuth * (180 / Math.PI),
          };
        }
      } catch {}
      return { ...sat, baseAlt: -999, baseAz: 0 };
    });
  }, [filters.satellites, satellites, observer.lat, observer.lon, time]);

  const baseMeteorShowers = useMemo(() => {
    if (!filters.meteorShowers || !meteorShowers) return [];
    const today = time.toISOString().slice(5, 10);
    return meteorShowers.map((ms) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: ms.ra, dec: ms.dec },
        safeObserver as any,
        time,
      );
      return {
        ...ms,
        baseAlt: altitude,
        baseAz: azimuth,
        isActive: today >= ms.activeStart && today <= ms.activeEnd,
        type: "MeteorShower",
      };
    });
  }, [filters.meteorShowers, meteorShowers, safeObserver, time]);

  const projectedMilkyWay = useMemo(
    () =>
      baseMilkyWay.map((cloud) => {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: cloud.ra, dec: cloud.dec },
          safeObserver as any,
          time,
        );
        return { ...cloud, baseAlt: altitude, baseAz: azimuth };
      }),
    [baseMilkyWay, safeObserver, time],
  );

  const projectedConstellations = useMemo(() => {
    if (!filters.constellations || !constellations.length) return [];
    return constellations.map((con) => {
      const { altitude: cAlt, azimuth: cAz } = equatorialToHorizontal(
        { ra: con.center[0], dec: con.center[1] },
        safeObserver as any,
        time,
      );
      const projectedLines =
        con.lines?.map((seg) =>
          seg.map((pt) => {
            const { altitude, azimuth } = equatorialToHorizontal(
              { ra: pt[0], dec: pt[1] },
              safeObserver as any,
              time,
            );
            return { baseAlt: altitude, baseAz: azimuth };
          }),
        ) ?? [];

      // --- Proyeksi Batas Rasi (Boundaries) ---
      const projectedBoundaries =
        con.boundaries?.map((poly) =>
          poly.map((pt) => {
            const { altitude, azimuth } = equatorialToHorizontal(
              { ra: pt[0], dec: pt[1] },
              safeObserver as any,
              time,
            );
            return { baseAlt: altitude, baseAz: azimuth };
          }),
        ) ?? [];

      return {
        id: con.id,
        name: con.name,
        center: { baseAlt: cAlt, baseAz: cAz },
        lines: projectedLines,
        boundaries: projectedBoundaries,
      };
    });
  }, [filters.constellations, constellations, safeObserver, time]);

  useEffect(() => {
    projectedConstellationsRef.current = projectedConstellations;
  }, [projectedConstellations]);

  const equatorialGridNodes = useMemo(() => {
    if (!filters.gridEquatorial)
      return { raLines: [], decLines: [], equatorNodes: [] };
    const raLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const decLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const equatorNodes: Array<{ baseAlt: number; baseAz: number }> = [];
    for (let ra = 0; ra < 360; ra += 15) {
      const ln: Array<{ baseAlt: number; baseAz: number }> = [];
      for (let dec = -85; dec <= 85; dec += 3) {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra, dec },
          safeObserver as any,
          time,
        );
        ln.push({ baseAlt: altitude, baseAz: azimuth });
      }
      raLines.push(ln);
    }
    for (let dec = -75; dec <= 75; dec += 15) {
      if (dec === 0) continue;
      const ln: Array<{ baseAlt: number; baseAz: number }> = [];
      for (let ra = 0; ra <= 360; ra += 3) {
        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: ra % 360, dec },
          safeObserver as any,
          time,
        );
        ln.push({ baseAlt: altitude, baseAz: azimuth });
      }
      decLines.push(ln);
    }
    for (let ra = 0; ra <= 360; ra += 3) {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: ra % 360, dec: 0 },
        safeObserver as any,
        time,
      );
      equatorNodes.push({ baseAlt: altitude, baseAz: azimuth });
    }
    return { raLines, decLines, equatorNodes };
  }, [filters.gridEquatorial, safeObserver, time]);

  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.7) {
        setActiveShootingStars((prev) => [
          ...prev,
          {
            id: Date.now(),
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight * 0.4,
            speed: Math.random() * 12 + 8,
            angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
            length: Math.random() * 60 + 30,
            opacity: 1,
          },
        ]);
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const map = new Map<any, RenderableObject>();
    for (const s of baseStars) map.set(s.id, s);
    for (const p of basePlanets) map.set(p.id, p);
    for (const d of baseDsos) map.set(d.id, d);
    for (const b of baseMinorBodies) map.set(b.id, b);
    for (const s of baseSatellites) map.set(s.id, s);
    for (const m of baseMeteorShowers) map.set(m.id, m);
    for (const c of projectedConstellations)
      map.set(c.id, {
        id: c.id as any,
        baseAlt: c.center.baseAlt,
        baseAz: c.center.baseAz,
      });
    latestObjectsRef.current = map;
  }, [
    baseStars,
    basePlanets,
    baseDsos,
    baseMinorBodies,
    baseSatellites,
    baseMeteorShowers,
    projectedConstellations,
  ]);

  useEffect(() => {
    let frameId = 0,
      isActive = true;
    if (prevTargetRef.current !== null && activeTarget === null)
      isAutoZoomingOutRef.current = true;
    prevTargetRef.current = activeTarget;

    const animate = () => {
      if (!isActive) return;
      let isMoving = false;

      if (activeTarget) {
        isAutoZoomingOutRef.current = false;
        const isCon = typeof activeTarget.id === "string";
        const targetZoom = isCon ? 1.8 : 4.5;

        updateZoomLevel((prev) => {
          const d = targetZoom - prev;
          if (Math.abs(d) > 0.005) {
            isMoving = true;
            return prev + d * 0.08;
          }
          return targetZoom;
        });

        let targetAz: number | null = null,
          targetAlt: number | null = null;

        if (isCon) {
          const tCon = projectedConstellationsRef.current.find(
            (c) => c.id === activeTarget.id,
          );
          if (tCon?.lines?.length) {
            let sumSin = 0,
              sumCos = 0,
              sumAlt = 0,
              count = 0;
            for (const seg of tCon.lines)
              for (const n of seg) {
                sumSin += Math.sin((n.baseAz * Math.PI) / 180);
                sumCos += Math.cos((n.baseAz * Math.PI) / 180);
                sumAlt += n.baseAlt;
                count++;
              }
            if (count > 0) {
              targetAz = normalizeAzimuth(
                (Math.atan2(sumSin / count, sumCos / count) * 180) / Math.PI,
              );
              targetAlt = clamp(sumAlt / count, -90, 90);
            }
          }
          if (targetAz === null) {
            const fb = latestObjectsRef.current.get(activeTarget.id);
            if (fb) {
              targetAz = fb.baseAz;
              targetAlt = fb.baseAlt;
            }
          }
        } else {
          const obj = latestObjectsRef.current.get(activeTarget.id);
          if (obj) {
            targetAz = obj.baseAz;
            targetAlt = obj.baseAlt;
          }
        }

        if (targetAz !== null && targetAlt !== null) {
          const fAz = targetAz,
            fAlt = targetAlt;
          setViewAngle((prev) => {
            let dAz = (fAz - prev.az) % 360;
            if (dAz > 180) dAz -= 360;
            if (dAz < -180) dAz += 360;
            const dAlt = fAlt - prev.alt;
            if (Math.abs(dAz) > 0.05 || Math.abs(dAlt) > 0.05) {
              isMoving = true;
              return {
                az: normalizeAzimuth(prev.az + dAz * 0.08),
                alt: clamp(prev.alt + dAlt * 0.08, -90, 90),
              };
            }
            if (Math.abs(dAz) <= 1e-5 && Math.abs(dAlt) <= 1e-5) return prev;
            isMoving = true;
            return { az: fAz, alt: clamp(fAlt, -90, 90) };
          });
        }
      } else if (isAutoZoomingOutRef.current) {
        updateZoomLevel((prev) => {
          const d = 0.85 - prev;
          if (Math.abs(d) > 0.005) {
            isMoving = true;
            return prev + d * 0.06;
          }
          isAutoZoomingOutRef.current = false;
          return 0.85;
        });
      }

      if (isMoving || activeTarget || isAutoZoomingOutRef.current)
        frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      isActive = false;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [activeTarget?.id, updateZoomLevel]);

  const selectObjectAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = clientX - rect.left,
        my = clientY - rect.top;
      let found: any = null;
      const base = isMobile ? MOBILE_HOVER_RADIUS : DESKTOP_HOVER_RADIUS;
      let minDist = base;

      const check = (x: number, y: number, obj: any) => {
        const d = Math.hypot(x - mx, y - my);
        if (d < minDist) {
          minDist = d;
          found = obj;
        }
      };

      if (filters.satellites)
        for (const s of renderedSatellitesRef.current.values())
          check(s.x, s.y, s);
      if (filters.meteorShowers)
        for (const m of renderedMeteorShowersRef.current.values())
          check(m.x, m.y, m);
      for (const s of renderedStarsRef.current.values()) check(s.x, s.y, s);
      if (filters.minorBodies)
        for (const b of renderedMinorBodiesRef.current.values())
          check(b.x, b.y, b);

      if (filters.constellations) {
        const cr = base * 1.5;
        for (const con of renderedConstellationsRef.current.values()) {
          let d = Math.hypot(con.x - mx, con.y - my);
          for (const seg of con.segments)
            d = Math.min(
              d,
              distToSegment(mx, my, seg.x1, seg.y1, seg.x2, seg.y2),
            );
          if (d < cr && d < minDist) {
            minDist = d;
            found = constellations.find((c) => c.id === con.id);
          }
        }
      }

      if (found) {
        onSelectTarget(found);
        onStarHover({
          id: found.id,
          name: found.name,
          mag: found.mag ?? 0,
          alt: found.baseAlt,
          az: found.baseAz,
          type: typeof found.id === "string" ? "constellation" : found.type,
        });
      } else {
        onClearTarget();
        onStarHover(null);
      }
    },
    [
      isMobile,
      filters,
      constellations,
      onSelectTarget,
      onStarHover,
      onClearTarget,
    ],
  );

  /* ================================================================ */
  /* RENDER EFFECT                                                     */
  /* ================================================================ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width,
      height = rect.height;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      isMobile ? MOBILE_DPR : DESKTOP_DPR,
    );

    const sw = Math.round(width * dpr),
      sh = Math.round(height * dpr);
    if (canvas.width !== sw || canvas.height !== sh) {
      canvas.width = sw;
      canvas.height = sh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2,
      cy = height / 2;
    const fovScale = (Math.max(width, height) / 2.5) * currentZoomLevel;

    const bgGrad = ctx.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.max(width, height),
    );
    bgGrad.addColorStop(0, "#0b1021");
    bgGrad.addColorStop(1, "#030712");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const sunData = basePlanets.find((p) => p.id === 0);
    const sunAlt = sunData ? sunData.baseAlt : -90;
    let dayIntensity = 0;
    if (filters.atmosphere) {
      if (sunAlt > 0) dayIntensity = 1;
      else if (sunAlt > -18) dayIntensity = (sunAlt + 18) / 18;
    }
    if (dayIntensity > 0) {
      ctx.globalAlpha = dayIntensity * 0.6;
      ctx.fillStyle = "#0ea5e9";
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }

    const proj = (bAlt: number, bAz: number) =>
      projectPlanetarium(
        bAlt,
        bAz,
        viewAngle.alt,
        viewAngle.az,
        cx,
        cy,
        fovScale,
      );

    if (filters.atmosphere && sunData && sunAlt > -18 && sunAlt < 10) {
      const sp = proj(sunData.baseAlt, sunData.baseAz);
      const ti =
        sunAlt <= 0 ? (sunAlt + 18) / 18 : Math.max(0, 1 - sunAlt / 10);
      if (sp && ti > 0) {
        ctx.globalAlpha = ti;
        const gr = Math.min(
          300,
          Math.max(width, height) * 0.4 * currentZoomLevel,
        );
        const tg = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, gr);
        tg.addColorStop(0, "rgba(249,115,22,0.95)");
        tg.addColorStop(0.25, "rgba(225,29,72,0.6)");
        tg.addColorStop(0.6, "rgba(76,29,149,0.2)");
        tg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, gr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    let sunScreenX = cx,
      sunScreenY = height + 500;
    if (sunData) {
      const sp = proj(sunData.baseAlt, sunData.baseAz);
      if (sp) {
        sunScreenX = sp.x;
        sunScreenY = sp.y;
      }
    }

    if (filters.atmosphere && sunAlt < -4) {
      const ns = clamp((-sunAlt - 4) / 18, 0, 1);
      if (ns > 0.04) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        const hr = Math.max(width, height) * (0.95 + currentZoomLevel * 0.08);
        const gx = cx + Math.cos((viewAngle.az * Math.PI) / 180) * width * 0.08;
        const gy =
          cy - Math.sin(((viewAngle.alt - 12) * Math.PI) / 180) * height * 0.08;
        const sg = ctx.createLinearGradient(0, 0, 0, height);
        sg.addColorStop(0, `rgba(125,211,252,${0.05 * ns})`);
        sg.addColorStop(0.45, `rgba(96,165,250,${0.035 * ns})`);
        sg.addColorStop(1, `rgba(30,64,175,${0.02 * ns})`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, width, height);
        const hg = ctx.createRadialGradient(gx, gy, 0, gx, gy, hr);
        hg.addColorStop(0, `rgba(147,197,253,${0.18 * ns})`);
        hg.addColorStop(0.35, `rgba(96,165,250,${0.12 * ns})`);
        hg.addColorStop(0.7, `rgba(59,130,246,${0.06 * ns})`);
        hg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(gx, gy, hr, 0, Math.PI * 2);
        ctx.fill();
        const hg2 = ctx.createRadialGradient(
          cx,
          cy * 0.85,
          0,
          cx,
          cy * 0.85,
          hr * 0.7,
        );
        hg2.addColorStop(0, `rgba(186,230,253,${0.08 * ns})`);
        hg2.addColorStop(0.5, `rgba(96,165,250,${0.04 * ns})`);
        hg2.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = hg2;
        ctx.beginPath();
        ctx.arc(cx, cy * 0.85, hr * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    const zoomScale = Math.max(1, 1 + (currentZoomLevel - 1) * 0.2);
    const uiScale = Math.min(zoomScale, 15);
    const planetScale = Math.min(25, 1 + (currentZoomLevel - 1) * 0.8);

    if (dayIntensity < 0.8) {
      ctx.globalAlpha = 1 - dayIntensity;
      for (const cloud of projectedMilkyWay) {
        const p = proj(cloud.baseAlt, cloud.baseAz);
        if (!p) continue;
        const r = cloud.size * zoomScale;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(147,197,253,${cloud.alpha})`);
        g.addColorStop(0.5, `rgba(167,139,250,${cloud.alpha * 0.4})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    const visibleStars = new Map<number, ProjectedStar>();
    const visibleLookup = new Map<string, ProjectedStar>();
    const visibleMeteors = new Map<number, any>();
    const visiblePlanets: ProjectedStar[] = [];

    const projectObj = (obj: RenderableObject) => {
      const p = proj(obj.baseAlt, obj.baseAz);
      if (!p) return;
      const projected: ProjectedStar = {
        ...(obj as ProjectedStar),
        x: p.x,
        y: p.y,
      };
      visibleStars.set(obj.id, projected);
      visibleLookup.set(String(obj.id), projected);
      if (projected.name) visibleLookup.set(projected.name, projected);
      if ((projected as any).messier)
        visibleLookup.set(String((projected as any).messier), projected);
      if (projected.isPlanet) visiblePlanets.push(projected);
    };

    for (const s of baseStars) projectObj(s);
    for (const d of baseDsos) projectObj(d);
    if (filters.planets) for (const p of basePlanets) projectObj(p);

    const satelliteLayouts = new Map<number, SatelliteLayout>();
    const satellitesByParent = new Map<string, ProjectedStar[]>();
    for (const planet of visiblePlanets) {
      const pk = getObjectKey((planet as any).parent);
      if (!pk) continue;
      if (!satellitesByParent.has(pk)) satellitesByParent.set(pk, []);
      satellitesByParent.get(pk)!.push(planet);
    }
    for (const [pk, children] of satellitesByParent.entries()) {
      const parentObj = visibleLookup.get(pk);
      if (!parentObj) continue;
      const ls = buildSatelliteLayout(
        parentObj,
        children,
        zoomScale,
        planetScale,
        isMobile,
      );
      for (const [id, layout] of ls.entries()) {
        satelliteLayouts.set(id, layout);
        const pj = visibleStars.get(id);
        if (pj) {
          pj.x = layout.x;
          pj.y = layout.y;
          visibleStars.set(id, pj);
        }
      }
    }

    renderedStarsRef.current = visibleStars;

    if (dayIntensity < 0.75) {
      ctx.globalAlpha = 1 - dayIntensity * 0.9;
      for (const dso of baseDsos) {
        const p = proj(dso.baseAlt, dso.baseAz);
        if (!p) continue;
        if (currentZoomLevel < 1.5 && dso.mag > 7) continue;
        const size =
          Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
          Math.max(1, currentZoomLevel * 0.5);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.shadowBlur = 20 * zoomScale;
        ctx.shadowColor = dso.color;
        switch (dso.type) {
          case "galaxy":
            ctx.strokeStyle = dso.color;
            ctx.lineWidth = 1.5 * zoomScale;
            ctx.beginPath();
            ctx.ellipse(0, 0, size * 1.8, size, Math.PI / 5, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case "nebula": {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3);
            g.addColorStop(0, `${dso.color}bb`);
            g.addColorStop(1, `${dso.color}00`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, size * 3, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case "cluster":
            ctx.fillStyle = dso.color;
            for (let i = 0; i < 10; i++) {
              const a = (Math.PI * 2 * i) / 10,
                r = size * 1.5;
              ctx.beginPath();
              ctx.arc(
                Math.cos(a) * r * 0.5,
                Math.sin(a) * r * 0.5,
                1.2 * zoomScale,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            break;
          default:
            ctx.fillStyle = dso.color;
            ctx.beginPath();
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (currentZoomLevel > 2.2) {
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = `${10 * zoomScale}px monospace`;
          ctx.textAlign = "center";
          ctx.fillText(dso.messier || dso.name, 0, -size * 3);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    const visibleMinorBodies = new Map<number, any>();
    if (
      filters.minorBodies &&
      dayIntensity < 0.85 &&
      baseMinorBodies.length > 0
    ) {
      ctx.save();
      ctx.globalAlpha = 1 - dayIntensity * 0.9;
      for (const body of baseMinorBodies) {
        if (body.baseAlt < -2) continue;
        const p = proj(body.baseAlt, body.baseAz);
        if (!p) continue;
        visibleMinorBodies.set(body.id, { ...body, x: p.x, y: p.y });
        ctx.save();
        ctx.translate(p.x, p.y);
        const bs = Math.max(1.5, (8 - Math.min(body.mag, 8)) * 0.5) * zoomScale;
        if (body.type === "Comet") {
          const dx = p.x - sunScreenX,
            dy = p.y - sunScreenY;
          const angle =
            Math.hypot(dx, dy) === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
          const tl = (body.tailLength || 60) * zoomScale * 0.8;
          const tg = ctx.createLinearGradient(
            0,
            0,
            Math.cos(angle) * tl,
            Math.sin(angle) * tl,
          );
          tg.addColorStop(0, body.color || "rgba(204,251,241,0.8)");
          tg.addColorStop(0.15, "rgba(204,251,241,0.3)");
          tg.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.moveTo(
            Math.cos(angle + Math.PI / 2) * bs,
            Math.sin(angle + Math.PI / 2) * bs,
          );
          ctx.lineTo(Math.cos(angle) * tl, Math.sin(angle) * tl);
          ctx.lineTo(
            Math.cos(angle - Math.PI / 2) * bs,
            Math.sin(angle - Math.PI / 2) * bs,
          );
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 12 * zoomScale;
          ctx.shadowColor = body.color || "#ccfbf1";
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(0, 0, bs * 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          ctx.fillStyle = body.color || "#d1d5db";
          ctx.beginPath();
          ctx.arc(0, 0, bs, 0, Math.PI * 2);
          ctx.fill();
        }
        if (currentZoomLevel > 2.5) {
          ctx.fillStyle = body.type === "Comet" ? "#ccfbf1" : "#e4e4e7";
          ctx.font = `${10 * uiScale}px monospace`;
          ctx.textAlign = "center";
          ctx.shadowBlur = 4;
          ctx.shadowColor = "black";
          ctx.fillText(body.name, 0, -bs - 8 * uiScale);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    renderedMinorBodiesRef.current = visibleMinorBodies;

    const visibleSatellites = new Map<number, any>();
    if (filters.satellites && baseSatellites.length > 0) {
      ctx.save();
      const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
      for (const sat of baseSatellites) {
        const tracked = activeTarget?.id === sat.id;
        if (sat.baseAlt < 0 && !tracked) continue;
        const p = proj(sat.baseAlt, sat.baseAz);
        if (!p) continue;
        visibleSatellites.set(sat.id, { ...sat, x: p.x, y: p.y });
        if (sat.baseAlt < 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        const sc = sat.color || "#10b981";
        ctx.shadowBlur = 10 * zoomScale;
        ctx.shadowColor = sc;
        ctx.strokeStyle = sc;
        ctx.lineWidth = 1.2;
        ctx.globalAlpha = 0.6 * pulse;
        const rd = 8 * zoomScale;
        ctx.strokeRect(-rd / 2, -rd / 2, rd, rd);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, 1.8 * zoomScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = sc;
        ctx.font = `bold ${9 * uiScale}px monospace`;
        ctx.textAlign = "center";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "black";
        ctx.fillText(sat.name, 0, -rd - 4 * uiScale);
        ctx.restore();
      }
      ctx.restore();
    }
    renderedSatellitesRef.current = visibleSatellites;

    if (filters.meteorShowers && baseMeteorShowers.length > 0) {
      ctx.save();
      for (const ms of baseMeteorShowers) {
        const tracked = activeTarget?.id === ms.id;
        if (ms.baseAlt < 0 && !tracked) continue;
        const p = proj(ms.baseAlt, ms.baseAz);
        if (!p) continue;
        visibleMeteors.set(ms.id, { ...ms, x: p.x, y: p.y });
        if (ms.baseAlt < 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        const mc = ms.color || "#fef08a";
        ctx.rotate((Date.now() / 2000) % (Math.PI * 2));
        ctx.strokeStyle = mc;
        ctx.lineWidth = 1.5 * zoomScale;
        ctx.globalAlpha = ms.isActive ? 0.8 : 0.3;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(0, -4 * zoomScale);
          ctx.lineTo(0, -12 * zoomScale);
          ctx.stroke();
          ctx.rotate(Math.PI / 2);
        }
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, 2 * zoomScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.fillStyle = mc;
        ctx.font = `bold ${10 * uiScale}px monospace`;
        ctx.textAlign = "center";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "black";
        ctx.fillText(ms.name.toUpperCase(), 0, 22 * zoomScale);
        ctx.restore();
      }
      ctx.restore();
    }
    renderedMeteorShowersRef.current = visibleMeteors;

    if (activeShootingStars.length > 0) {
      ctx.save();
      const next: ShootingStar[] = [];
      for (const s of activeShootingStars) {
        if (s.opacity <= 0) continue;
        const ex = s.x - Math.cos(s.angle) * s.length;
        const ey = s.y - Math.sin(s.angle) * s.length;
        const g = ctx.createLinearGradient(s.x, s.y, ex, ey);
        g.addColorStop(0, `rgba(255,255,255,${s.opacity})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 2 * dpr;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        next.push({
          ...s,
          x: s.x + Math.cos(s.angle) * s.speed,
          y: s.y + Math.sin(s.angle) * s.speed,
          opacity: s.opacity - 0.015,
        });
      }
      ctx.restore();
      if (next.length > 0)
        requestAnimationFrame(() => setActiveShootingStars(next));
    }

    const drawProjectedPath = (
      nodes: Array<{ baseAlt: number; baseAz: number }>,
      color: string,
      lineWidth: number,
      dashPattern: number[] = [],
      maxSegAngle = 45,
      outSegs?: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashPattern);
      let prevNode: { baseAlt: number; baseAz: number } | null = null;
      let prevPt: { x: number; y: number } | null = null;
      for (const node of nodes) {
        if (node.baseAlt < -90) {
          prevNode = null;
          prevPt = null;
          continue;
        }
        const p = proj(node.baseAlt, node.baseAz);
        if (!p) {
          prevNode = null;
          prevPt = null;
          continue;
        }
        if (prevPt && prevNode) {
          let draw = true;
          if (maxSegAngle < Infinity) {
            const a1 = (prevNode.baseAlt * Math.PI) / 180,
              a2 = (node.baseAlt * Math.PI) / 180;
            const dAz = ((node.baseAz - prevNode.baseAz) * Math.PI) / 180;
            const cosC =
              Math.sin(a1) * Math.sin(a2) +
              Math.cos(a1) * Math.cos(a2) * Math.cos(dAz);
            if ((Math.acos(clamp(cosC, -1, 1)) * 180) / Math.PI > maxSegAngle)
              draw = false;
          }
          if (Math.hypot(p.x - prevPt.x, p.y - prevPt.y) > width * 0.6)
            draw = false;
          if (draw) {
            ctx.beginPath();
            ctx.moveTo(prevPt.x, prevPt.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            outSegs?.push({ x1: prevPt.x, y1: prevPt.y, x2: p.x, y2: p.y });
          }
        }
        prevNode = node;
        prevPt = { x: p.x, y: p.y };
      }
    };

    const visibleConstellations = new Map<
      string,
      {
        id: string;
        name: string;
        x: number;
        y: number;
        baseAlt: number;
        baseAz: number;
        segments: Array<{ x1: number; y1: number; x2: number; y2: number }>;
      }
    >();

    if (
      filters.constellations &&
      dayIntensity < 0.9 &&
      projectedConstellations.length > 0
    ) {
      ctx.save();
      ctx.globalAlpha = 1 - dayIntensity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const SEG_DEG = 120;
      const DOR = (isMobile ? 2.5 : 3.5) * zoomScale;
      const DIR = (isMobile ? 1.2 : 1.8) * zoomScale;
      const DGB = (isMobile ? 6 : 10) * zoomScale;

      for (const con of projectedConstellations) {
        const isAct = activeTarget?.id === con.id;
        const LC = isAct ? "rgba(34,197,94,0.95)" : "rgba(125,211,252,0.75)";
        const LW =
          (isAct ? (isMobile ? 1.5 : 2.0) : isMobile ? 0.9 : 1.3) * zoomScale;
        const GC = isAct ? "rgba(34,197,94,0.3)" : "rgba(125,211,252,0.2)";
        const GW =
          (isAct ? (isMobile ? 5.0 : 8.0) : isMobile ? 3.5 : 5.5) * zoomScale;

        ctx.globalCompositeOperation = "screen";
        for (const seg of con.lines)
          drawProjectedPath(seg, GC, GW, [], SEG_DEG);

        ctx.globalCompositeOperation = "source-over";
        const curSegs: Array<{
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        }> = [];
        for (const seg of con.lines)
          drawProjectedPath(seg, LC, LW, [], SEG_DEG, curSegs);

        const nodeSet = new Map<string, { x: number; y: number }>();
        for (const seg of con.lines)
          for (const node of seg) {
            if (node.baseAlt < -90) continue;
            const p = proj(node.baseAlt, node.baseAz);
            if (!p) continue;
            const k = `${Math.round(p.x)},${Math.round(p.y)}`;
            if (!nodeSet.has(k)) nodeSet.set(k, { x: p.x, y: p.y });
          }

        for (const { x, y } of nodeSet.values()) {
          ctx.save();
          ctx.shadowBlur = DGB;
          ctx.shadowColor = isAct
            ? "rgba(74,222,128,0.9)"
            : "rgba(147,223,255,0.9)";
          const og = ctx.createRadialGradient(x, y, 0, x, y, DOR);
          og.addColorStop(
            0,
            isAct ? "rgba(220,252,231,1)" : "rgba(210,245,255,1)",
          );
          og.addColorStop(
            0.5,
            isAct ? "rgba(74,222,128,0.75)" : "rgba(125,211,252,0.75)",
          );
          og.addColorStop(1, "rgba(56,189,248,0)");
          ctx.fillStyle = og;
          ctx.beginPath();
          ctx.arc(x, y, DOR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = DGB * 0.5;
          ctx.fillStyle = isAct ? "rgba(240,253,244,1)" : "rgba(220,248,255,1)";
          ctx.beginPath();
          ctx.arc(x, y, DIR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        if (con.name) {
          let sx = 0,
            sy = 0,
            cnt = 0;
          for (const { x, y } of nodeSet.values()) {
            if (
              x >= -width &&
              x <= width * 2 &&
              y >= -height &&
              y <= height * 2
            ) {
              sx += x;
              sy += y;
              cnt++;
            }
          }
          let lx = 0,
            ly = 0,
            ok = false;
          if (cnt > 0) {
            lx = sx / cnt;
            ly = sy / cnt;
            ok = true;
          } else if (curSegs.length > 0) {
            lx = (curSegs[0].x1 + curSegs[0].x2) / 2;
            ly = (curSegs[0].y1 + curSegs[0].y2) / 2;
            ok = true;
          } else {
            const cp = proj(con.center.baseAlt, con.center.baseAz);
            if (cp) {
              lx = cp.x;
              ly = cp.y;
              ok = true;
            }
          }
          if (ok) {
            visibleConstellations.set(con.id, {
              id: con.id,
              name: con.name,
              x: lx,
              y: ly,
              baseAlt: con.center.baseAlt,
              baseAz: con.center.baseAz,
              segments: curSegs,
            });
            ctx.font = `bold ${(isMobile ? 8 : 10) * zoomScale}px 'Courier New',monospace`;
            ctx.shadowBlur = 6;
            ctx.shadowColor = "rgba(0,0,0,0.9)";
            ctx.fillStyle = isAct
              ? "rgba(74,222,128,0.95)"
              : "rgba(148,163,184,0.75)";
            ctx.textAlign = "center";
            ctx.fillText(con.name.toUpperCase(), lx, ly);
            ctx.shadowBlur = 0;
          }
        }
      }
      ctx.restore();
    }
    renderedConstellationsRef.current = visibleConstellations;

    if (filters.gridHorizontal) {
      for (let az = 0; az < 360; az += 30) {
        const ns = [];
        for (let a = 0; a <= 90; a += 3) ns.push({ baseAlt: a, baseAz: az });
        drawProjectedPath(ns, "rgba(56,189,248,0.15)", 1 * zoomScale, [2, 4]);
      }
      for (let a = 15; a <= 75; a += 15) {
        const ns = [];
        for (let az = 0; az <= 360; az += 3)
          ns.push({ baseAlt: a, baseAz: az % 360 });
        drawProjectedPath(ns, "rgba(56,189,248,0.2)", 1 * zoomScale, [2, 4]);
      }
    }
    if (filters.gridEquatorial) {
      const { raLines, decLines, equatorNodes } = equatorialGridNodes;
      for (const ln of raLines)
        drawProjectedPath(ln, "rgba(245,158,11,0.18)", 1 * zoomScale, [3, 5]);
      for (const ln of decLines)
        drawProjectedPath(ln, "rgba(245,158,11,0.18)", 1 * zoomScale, [3, 5]);
      if (equatorNodes.length) {
        ctx.save();
        ctx.shadowBlur = 6 * zoomScale;
        ctx.shadowColor = "rgba(245,158,11,0.8)";
        drawProjectedPath(
          equatorNodes,
          "rgba(245,158,11,0.6)",
          1.5 * zoomScale,
          [],
        );
        ctx.restore();
      }
    }

    ctx.setLineDash([]);

    const MAG_BASE = filters.faintStars ? MAX_MAG : 3.5;
    let adjMag = MAG_BASE;
    if (currentZoomLevel > 3.0) adjMag += (currentZoomLevel - 3.0) * 0.4;
    const MAG_LIMIT = adjMag - dayIntensity * (adjMag + 2);
    const nowMs = Date.now();

    for (const star of visibleStars.values()) {
      if (star.isPlanet) {
        const isSat = Boolean(star.parent);
        const layout = satelliteLayouts.get(star.id);
        const rx = layout?.x ?? star.x;
        const ry = layout?.y ?? star.y;

        ctx.globalAlpha = 1;
        const rPx = (star.radiusPx || 4) * planetScale;

        if (isSat && layout) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = "rgba(255,255,255,0.5)";
          ctx.lineWidth = 0.5 * uiScale;
          ctx.beginPath();
          ctx.moveTo(layout.leaderX1, layout.leaderY1);
          ctx.lineTo(layout.leaderX2, layout.leaderY2);
          ctx.stroke();
          ctx.restore();
        }

        if (star.id === 0) {
          ctx.shadowBlur = 50 * uiScale;
          ctx.shadowColor = "#f59e0b";
          ctx.fillStyle = "rgba(251,191,36,0.4)";
          ctx.beginPath();
          ctx.arc(rx, ry, rPx * 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#fffbeb";
          ctx.beginPath();
          ctx.arc(rx, ry, rPx * 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          const drawR = isSat
            ? Math.max(1.5 * uiScale, rPx * 0.25)
            : isMobile
              ? rPx * 1.2
              : rPx;
          ctx.shadowBlur = (isSat ? 6 : 15) * uiScale;
          ctx.shadowColor = star.colorStr || "#ffffff";
          ctx.fillStyle = star.colorStr || "#ffffff";
          ctx.beginPath();
          ctx.arc(rx, ry, drawR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          const showLabel =
            (!isSat && (currentZoomLevel > 3.0 || star.id === 0)) ||
            (isSat && currentZoomLevel > 4.5);
          if (showLabel) {
            const lx = rx,
              ly = ry + drawR + (isSat ? 10 : 14) * uiScale;
            ctx.save();
            ctx.font = `${(isSat ? 8 : 10) * uiScale}px monospace`;
            ctx.textAlign = "center";
            ctx.fillStyle = isSat ? "rgba(203,213,225,0.9)" : "white";
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";
            ctx.fillText(star.name || "", lx, ly);
            ctx.restore();
          }
        }
        continue;
      }

      if (star.mag > MAG_LIMIT) continue;

      const magOffset =
        star.isVariable && star.variablePeriod && star.variableAmplitude
          ? getVariableMagOffset(
              star.variablePeriod,
              star.variableAmplitude,
              nowMs,
            )
          : 0;
      const effectiveMag = star.mag + magOffset;

      if (effectiveMag > MAG_LIMIT + 0.5) continue;

      const normMag = Math.max(0, (MAX_MAG - effectiveMag) / MAX_MAG);
      const radiusPx =
        Math.max(isMobile ? 0.6 : 0.4, normMag * (isMobile ? 3.0 : 2.6) + 0.2) *
        uiScale;

      const primaryColor = getStarColor(star.bv);
      const starAlpha = Math.min(
        1,
        Math.max(0.1, (adjMag - effectiveMag) / 5.5),
      );
      ctx.globalAlpha = starAlpha;

      if (star.isDouble && currentZoomLevel > DOUBLE_SPLIT_START) {
        const rawProg =
          (currentZoomLevel - DOUBLE_SPLIT_START) /
          (DOUBLE_SPLIT_FULL - DOUBLE_SPLIT_START);
        const splitProg = clamp(rawProg, 0, 1);
        const eased = easeInOut(splitProg);
        const maxSplit = (isMobile ? 7 : 11) * uiScale;
        const splitDist = eased * maxSplit;

        const paRad = ((star.positionAngle ?? 45) * Math.PI) / 180;
        const dx = Math.sin(paRad) * splitDist * 0.5;
        const dy = -Math.cos(paRad) * splitDist * 0.5;

        const primaryR = radiusPx * Math.max(0.65, 1 - splitProg * 0.35);
        ctx.shadowBlur =
          effectiveMag < 2.5 && dayIntensity < 0.5
            ? (3 - effectiveMag) * 3 * uiScale
            : 0;
        ctx.shadowColor = primaryColor;
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(star.x - dx, star.y - dy, primaryR, 0, Math.PI * 2);
        ctx.fill();

        const secMag = star.secondaryMag ?? star.mag + 1.5;
        const secNorm = Math.max(0, (MAX_MAG - secMag) / MAX_MAG);
        const secR =
          Math.max(
            isMobile ? 0.3 : 0.2,
            secNorm * (isMobile ? 2.5 : 2.2) + 0.1,
          ) *
          uiScale *
          Math.min(1, splitProg * 1.8);

        const secBv = star.secondaryBv ?? (star.bv ?? 0) + 1.2;
        const secondaryCol = getStarColor(secBv);

        ctx.shadowBlur = 0;
        ctx.fillStyle = secondaryCol;
        ctx.beginPath();
        ctx.arc(star.x + dx, star.y + dy, secR, 0, Math.PI * 2);
        ctx.fill();

        if (splitProg > 0.05 && splitProg < 0.6) {
          ctx.globalAlpha = starAlpha * (0.6 - splitProg) * 0.25;
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 0.4 * uiScale;
          ctx.beginPath();
          ctx.moveTo(star.x - dx, star.y - dy);
          ctx.lineTo(star.x + dx, star.y + dy);
          ctx.stroke();
          ctx.globalAlpha = starAlpha;
        }
      } else {
        if (effectiveMag < 2.5 && dayIntensity < 0.5) {
          ctx.shadowBlur = (3 - effectiveMag) * 4 * uiScale;
          ctx.shadowColor = primaryColor;
        } else {
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.arc(star.x, star.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (
          star.isDouble &&
          currentZoomLevel >= 1.5 &&
          currentZoomLevel <= DOUBLE_SPLIT_START
        ) {
          const secBv = star.secondaryBv ?? (star.bv ?? 0) + 1.2;
          const secCol = getStarColor(secBv);
          const paRad = ((star.positionAngle ?? 45) * Math.PI) / 180;
          const hintDist = radiusPx + 1.2 * uiScale;
          ctx.globalAlpha = starAlpha * 0.25;
          ctx.fillStyle = secCol;
          ctx.beginPath();
          ctx.arc(
            star.x + Math.sin(paRad) * hintDist,
            star.y - Math.cos(paRad) * hintDist,
            Math.max(0.4, radiusPx * 0.45),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          ctx.globalAlpha = starAlpha;
        }

        if (star.isVariable && currentZoomLevel > 1.5) {
          const periodMs = (star.variablePeriod || 7) * 86_400_000;
          const phase = (nowMs % periodMs) / periodMs;
          const pulse = (Math.sin(phase * Math.PI * 2) + 1) / 2;
          ctx.globalAlpha = starAlpha * 0.35 * pulse;
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 0.7 * uiScale;
          ctx.beginPath();
          ctx.arc(
            star.x,
            star.y,
            radiusPx + (1.5 + 2.5 * pulse) * uiScale,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
          ctx.globalAlpha = starAlpha;
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.strokeStyle = "rgba(56,189,248,0.3)";
    ctx.lineWidth = 1.5 * zoomScale;
    ctx.setLineDash([4 * zoomScale, 6 * zoomScale]);
    let fl = true;
    for (let az = 0; az <= 360; az += 2) {
      const p = proj(0, az);
      if (p) {
        if (fl) {
          ctx.moveTo(p.x, p.y);
          fl = false;
        } else ctx.lineTo(p.x, p.y);
      } else fl = true;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(56,189,248,0.8)";
    ctx.font = `bold ${isMobile ? 10 * zoomScale : 12 * zoomScale}px 'Courier New',monospace`;
    for (const pt of CARDINAL_POINTS) {
      const p = proj(0, pt.az);
      if (p?.visible) ctx.fillText(pt.label, p.x, p.y + 16 * zoomScale);
    }

    if (activeTarget) {
      const isCon = typeof activeTarget.id === "string";
      const fb = latestObjectsRef.current.get(activeTarget.id);
      let themeColor = "rgba(34,197,94,";
      if (fb) {
        const t = (fb as any).type;
        if (t === "Comet" || t === "Asteroid") themeColor = "rgba(45,212,191,";
        else if (t === "Satellite") themeColor = "rgba(16,185,129,";
        else if (t === "MeteorShower") themeColor = "rgba(250,204,21,";
      }

      if (isCon) {
        const tCon = projectedConstellations.find(
          (c) => c.id === activeTarget.id,
        );
        if (tCon) {
          // --- RENDER CONSTELLATION BOUNDARIES (IAU Area) ---
          if (tCon.boundaries && tCon.boundaries.length > 0) {
            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            // Warna Merah Bata Redup (Brick Red)
            ctx.strokeStyle = "rgba(153, 27, 27, 0.4)";
            ctx.lineWidth = 1.2 * zoomScale;
            ctx.setLineDash([5 * zoomScale, 5 * zoomScale]);

            for (const poly of tCon.boundaries) {
              drawProjectedPath(
                poly,
                "rgba(153, 27, 27, 0.4)",
                1.2 * zoomScale,
                [5, 5],
                120,
              );
            }
            ctx.restore();
          }

          if (tCon.lines?.length) {
            let minX = Infinity,
              maxX = -Infinity,
              minY = Infinity,
              maxY = -Infinity,
              hasVis = false;
            for (const seg of tCon.lines)
              for (const n of seg) {
                if (n.baseAlt > -5) {
                  const p = proj(n.baseAlt, n.baseAz);
                  if (p?.visible) {
                    hasVis = true;
                    minX = Math.min(minX, p.x);
                    maxX = Math.max(maxX, p.x);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y);
                  }
                }
              }
            if (hasVis) {
              const pad = 35 * zoomScale,
                bl = 30 * zoomScale;
              minX -= pad;
              maxX += pad;
              minY -= pad;
              maxY += pad;
              const tp = (Math.sin(Date.now() / 300) + 1) / 2;
              ctx.save();
              ctx.strokeStyle = `rgba(34,197,94,${0.4 + tp * 0.5})`;
              ctx.lineWidth = 2;
              ctx.shadowBlur = 8;
              ctx.shadowColor = "rgba(34,197,94,0.8)";
              ctx.beginPath();
              ctx.moveTo(minX, minY + bl);
              ctx.lineTo(minX, minY);
              ctx.lineTo(minX + bl, minY);
              ctx.moveTo(maxX - bl, minY);
              ctx.lineTo(maxX, minY);
              ctx.lineTo(maxX, minY + bl);
              ctx.moveTo(maxX, maxY - bl);
              ctx.lineTo(maxX, maxY);
              ctx.lineTo(maxX - bl, maxY);
              ctx.moveTo(minX + bl, maxY);
              ctx.lineTo(minX, maxY);
              ctx.lineTo(minX, maxY - bl);
              ctx.stroke();
              ctx.restore();
            }
          }
        }
      } else {
        let tc: { x: number; y: number } | undefined = visibleStars.get(
          activeTarget.id,
        );
        if (!tc) tc = visibleMinorBodies.get(activeTarget.id);
        if (!tc) tc = visibleSatellites.get(activeTarget.id);
        if (!tc) tc = visibleMeteors.get(activeTarget.id);

        if (tc) {
          const tOff = Date.now() / 400;
          ctx.save();
          ctx.translate(tc.x, tc.y);
          const cl = 35 * zoomScale,
            ig = 15 * zoomScale;
          ctx.setLineDash([]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = `${themeColor}0.6)`;
          ctx.beginPath();
          ctx.moveTo(-cl, 0);
          ctx.lineTo(-ig, 0);
          ctx.moveTo(cl, 0);
          ctx.lineTo(ig, 0);
          ctx.moveTo(0, -cl);
          ctx.lineTo(0, -ig);
          ctx.moveTo(0, cl);
          ctx.lineTo(0, ig);
          ctx.stroke();
          ctx.rotate(tOff);
          ctx.strokeStyle = `${themeColor}0.9)`;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.arc(0, 0, 24 * zoomScale, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }, [
    basePlanets,
    baseStars,
    filters,
    isMobile,
    viewAngle,
    activeTarget,
    currentZoomLevel,
    projectedMilkyWay,
    baseDsos,
    baseMinorBodies,
    baseSatellites,
    baseMeteorShowers,
    equatorialGridNodes,
    projectedConstellations,
    activeShootingStars,
  ]);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (
        pointerDownRef.current &&
        !didPointerMoveRef.current &&
        Math.hypot(
          e.clientX - pointerDownRef.current.x,
          e.clientY - pointerDownRef.current.y,
        ) > CLICK_MOVE_THRESHOLD
      )
        didPointerMoveRef.current = true;

      if (
        activePointers.current.size === 2 &&
        initialPinchDist.current !== null
      ) {
        const pts = Array.from(activePointers.current.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        updateZoomLevel(
          () => initialZoom.current * (d / initialPinchDist.current!),
        );
        return;
      }
      if (activePointers.current.size === 1 && isDraggingRef.current) {
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        const sens =
          (isMobile ? VIEW_SENSITIVITY * 0.8 : VIEW_SENSITIVITY) /
          zoomLevelRef.current;
        if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
          didPointerMoveRef.current = true;
          if (activeTarget) onClearTarget();
        }
        setViewAngle((prev) => ({
          az: normalizeAzimuth(prev.az - dx * sens),
          alt: clamp(prev.alt + dy * sens, -90, 90),
        }));
      }
    },
    [isMobile, updateZoomLevel, activeTarget, onClearTarget],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      isAutoZoomingOutRef.current = false;
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
      didPointerMoveRef.current = false;
      if (activePointers.current.size === 1) {
        isDraggingRef.current = true;
        setIsDragging(true);
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
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
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      const wasClick =
        activePointers.current.size === 1 &&
        !didPointerMoveRef.current &&
        pointerDownRef.current !== null;
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size < 2) initialPinchDist.current = null;
      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        const r = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: r.x, y: r.y };
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      if (wasClick) selectObjectAtPoint(e.clientX, e.clientY);
      pointerDownRef.current = null;
      didPointerMoveRef.current = false;
    },
    [selectObjectAtPoint],
  );

  const handlePointerCancelOrLeave = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size < 2) initialPinchDist.current = null;
      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        const r = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: r.x, y: r.y };
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
