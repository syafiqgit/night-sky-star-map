"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as satellite from "satellite.js";
import { equatorialToHorizontal } from "@/lib/astro/coordinates";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";

/* ---------------------------------------------------------------- */
/* Image Cache Helper                                               */
/* ---------------------------------------------------------------- */

const dsoImageCache = new Map<string, HTMLImageElement>();

function getCachedImage(url: string): HTMLImageElement | null {
  if (dsoImageCache.has(url)) return dsoImageCache.get(url)!;
  const img = new Image();
  img.src = url;
  img.crossOrigin = "anonymous";
  img.onload = () => dsoImageCache.set(url, img);
  return null;
}

/* ---------------------------------------------------------------- */
/* Types                                                            */
/* ---------------------------------------------------------------- */

export interface FOVConfig {
  enabled: boolean;
  type: "sensor" | "eyepiece";
  focalLength: number;
  sensorWidth: number;
  sensorHeight: number;
  eyepieceFocalLength?: number;
  eyepieceAfov?: number;
  color?: string;
  rotation?: number;
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
  image?: string;
  sizeArcmin?: number;
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
    fovConfig?: FOVConfig;
    bortleScale?: number;
  };
  activeTarget: any | null;
  onSelectTarget: (target: any) => void;
  onClearTarget: () => void;
  zoomLevel?: number;
  onZoomChange?: (newZoom: number) => void;
}

/* ---------------------------------------------------------------- */
/* Constants                                                        */
/* ---------------------------------------------------------------- */

const MAX_MAG_BASE = 6.5;
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
/* Helpers                                                          */
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
/* Main component                                                   */
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
  const renderedConstellationsRef = useRef<Map<string, any>>(new Map());
  const renderedMinorBodiesRef = useRef<Map<number, any>>(new Map());
  const renderedSatellitesRef = useRef<Map<number, any>>(new Map());
  const renderedMeteorShowersRef = useRef<Map<number, any>>(new Map());

  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const zoomRef = useRef<number>(externalZoomLevel);
  const targetZoomRef = useRef<number>(externalZoomLevel);
  const viewAzRef = useRef<number>(observer.lat < 0 ? 0 : 180);
  const viewAltRef = useRef<number>(
    clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45),
  );

  const activeTargetRef = useRef<any | null>(activeTarget);
  const prevActiveTargetIdRef = useRef<any | null>(null);
  const projectedConstellationsRef = useRef<any[]>([]);
  const latestObjectsRef = useRef<Map<any, RenderableObject>>(new Map());

  const currentEclipseFactorRef = useRef<number>(0);

  const lastPointerRef = useRef({ x: 0, y: 0 });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const didPointerMoveRef = useRef(false);
  const isDraggingRef = useRef(false);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const initialPinchDist = useRef<number | null>(null);
  const initialZoom = useRef<number>(1);
  const prevLocationRef = useRef({ lat: observer.lat, lon: observer.lon });

  const onZoomChangeRef = useRef(onZoomChange);
  const onSelectTargetRef = useRef(onSelectTarget);
  const onClearTargetRef = useRef(onClearTarget);
  const onStarHoverRef = useRef(onStarHover);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
    onSelectTargetRef.current = onSelectTarget;
    onClearTargetRef.current = onClearTarget;
    onStarHoverRef.current = onStarHover;
  }, [onZoomChange, onSelectTarget, onClearTarget, onStarHover]);

  useEffect(() => {
    const clamped = clamp(externalZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
    zoomRef.current = clamped;
    targetZoomRef.current = clamped;
  }, []);

  const lastNotifiedZoomRef = useRef<number>(externalZoomLevel);
  const lastNotifyTimeRef = useRef<number>(0);

  const notifyZoomChangeThrottled = useCallback((newZoom: number) => {
    if (!onZoomChangeRef.current) return;
    const now = Date.now();
    const isSettled = Math.abs(targetZoomRef.current - newZoom) < 1e-3;

    if (now - lastNotifyTimeRef.current > 150 || isSettled) {
      if (Math.abs(lastNotifiedZoomRef.current - newZoom) > 1e-3) {
        lastNotifiedZoomRef.current = newZoom;
        lastNotifyTimeRef.current = now;
        setTimeout(() => {
          onZoomChangeRef.current?.(newZoom);
        }, 0);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTargetRef.current !== null && activeTarget === null) {
      targetZoomRef.current = 0.85;
    }
    activeTargetRef.current = activeTarget;
    prevActiveTargetIdRef.current = activeTarget?.id ?? null;
  }, [activeTarget]);

  useEffect(() => {
    const latChanged =
      Math.abs(observer.lat - prevLocationRef.current.lat) > 0.0001;
    const lonChanged =
      Math.abs(observer.lon - prevLocationRef.current.lon) > 0.0001;
    if (latChanged || lonChanged) {
      if (latChanged) {
        viewAzRef.current = observer.lat < 0 ? 0 : 180;
        viewAltRef.current = clamp(35 - Math.abs(observer.lat) * 0.3, 15, 45);
      }
      prevLocationRef.current = { lat: observer.lat, lon: observer.lon };
    }
  }, [observer.lat, observer.lon]);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = (e?: MediaQueryListEvent) =>
      setIsMobile(e?.matches ?? mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const safeObserver = useMemo(
    () => ({
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    }),
    [observer.lat, observer.lon],
  );

  const baseMilkyWay = useMemo(() => buildMilkyWayDust(), []);

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

  const basePlanets = useMemo(() => {
    const ephemerisList = getSolarSystemObjects(time, solarSystem);

    const combinedIds = Array.from(
      new Set([
        ...ephemerisList.map((p: any) => String(p.id)),
        ...solarSystem.map((s: any) => String(s.id)),
      ]),
    );

    return combinedIds
      .map((idStr) => {
        const planet: any =
          ephemerisList.find((p: any) => String(p.id) === idStr) || {};
        const orig: any =
          solarSystem.find((s: any) => String(s.id) === idStr) || {};

        const idVal = orig.id !== undefined ? orig.id : planet.id;
        const nameVal = orig.name || planet.name || "";
        const parentVal = orig.parent || planet.parent;
        const radiusVal =
          orig.rPx ?? orig.radiusPx ?? planet.rPx ?? planet.radiusPx ?? 4;
        const colorVal = orig.color || planet.color || "#ffffff";

        let raVal = planet.ra ?? orig.ra;
        let decVal = planet.dec ?? orig.dec;

        if (
          (String(idVal) === "-1" ||
            String(idVal) === "10" ||
            nameVal?.includes("Luna") ||
            nameVal?.includes("Moon") ||
            nameVal?.includes("Bulan")) &&
          (raVal === undefined || isNaN(raVal))
        ) {
          const sun: any =
            ephemerisList.find(
              (p: any) =>
                String(p.id) === "0" ||
                p.name?.includes("Sun") ||
                p.name?.includes("Sol"),
            ) ||
            solarSystem.find(
              (p: any) =>
                String(p.id) === "0" ||
                p.name?.includes("Sun") ||
                p.name?.includes("Sol"),
            );

          const sunRa = sun?.ra ?? 142.5;
          const sunDec = sun?.dec ?? 15.2;

          const isEclipse = time.toISOString().startsWith("2026-08-12");

          if (isEclipse) {
            const currentHours = time.getUTCHours() + time.getUTCMinutes() / 60;
            const eclipsePeakHour = 17.75;
            const hourOffset = currentHours - eclipsePeakHour;

            raVal = sunRa + hourOffset * 0.5;
            decVal = sunDec + hourOffset * 0.1;
          } else {
            const epoch = new Date("2026-01-01T00:00:00Z").getTime();
            const days = (time.getTime() - epoch) / 86400000;
            const phaseAngle = ((days % 29.530588) / 29.530588) * 360;

            raVal = (sunRa + phaseAngle) % 360;
            decVal = sunDec + Math.sin((phaseAngle * Math.PI) / 180) * 5;
          }
        }

        const finalRa = raVal !== undefined && !isNaN(raVal) ? raVal : 0;
        const finalDec = decVal !== undefined && !isNaN(decVal) ? decVal : 0;

        const { altitude, azimuth } = equatorialToHorizontal(
          { ra: finalRa, dec: finalDec },
          safeObserver as any,
          time,
        );

        return {
          ...orig,
          ...planet,
          id: idVal,
          name: nameVal,
          parent: parentVal,
          radiusPx: radiusVal,
          colorStr: colorVal,
          isPlanet: true,
          ra: finalRa,
          dec: finalDec,
          baseAlt: altitude,
          baseAz: azimuth,
        };
      })
      .sort((a: any, b: any) => (a.parent ? -1 : 1));
  }, [safeObserver, time, solarSystem]);

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
    const map = new Map<any, RenderableObject>();
    for (const s of baseStars) map.set(s.id, s);
    for (const p of basePlanets) {
      map.set(p.id, p);
      if (typeof p.id === "number") map.set(String(p.id), p);
      if (typeof p.id === "string") map.set(Number(p.id), p);
    }
    for (const d of baseDsos) map.set(d.id, d);
    for (const b of baseMinorBodies) map.set(b.id, b);
    for (const s of baseSatellites) map.set(s.id, s);
    for (const m of baseMeteorShowers) map.set(m.id, m);
    for (const c of projectedConstellations) {
      map.set(c.id, {
        id: c.id as any,
        baseAlt: c.center.baseAlt,
        baseAz: c.center.baseAz,
      });
    }
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

  /* ================================================================ */
  /* SATU SIKLUS ANIMASI UTAMA                                        */
  /* ================================================================ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frameId = 0;
    let isActive = true;

    const animate = () => {
      if (!isActive) return;
      const now = Date.now();

      if (activeTargetRef.current) {
        const isCon = typeof activeTargetRef.current.id === "string";
        const desiredZoom = isCon ? 1.8 : 4.5;
        targetZoomRef.current = desiredZoom;

        let tAz: number | null = null;
        let tAlt: number | null = null;

        if (isCon) {
          const tCon = projectedConstellationsRef.current.find(
            (c) => c.id === activeTargetRef.current.id,
          );
          if (tCon?.lines?.length) {
            let sumSin = 0,
              sumCos = 0,
              sumAlt = 0,
              count = 0;
            for (const seg of tCon.lines) {
              for (const n of seg) {
                sumSin += Math.sin((n.baseAz * Math.PI) / 180);
                sumCos += Math.cos((n.baseAz * Math.PI) / 180);
                sumAlt += n.baseAlt;
                count++;
              }
            }
            if (count > 0) {
              tAz = normalizeAzimuth(
                (Math.atan2(sumSin / count, sumCos / count) * 180) / Math.PI,
              );
              tAlt = clamp(sumAlt / count, -90, 90);
            }
          }
        }

        if (tAz === null || tAlt === null || isNaN(tAlt)) {
          let targetObj = latestObjectsRef.current.get(
            activeTargetRef.current.id,
          );
          if (!targetObj)
            targetObj = latestObjectsRef.current.get(
              String(activeTargetRef.current.id),
            );
          if (!targetObj)
            targetObj = latestObjectsRef.current.get(
              Number(activeTargetRef.current.id),
            );

          if (targetObj && !isNaN(targetObj.baseAlt)) {
            tAz = targetObj.baseAz;
            tAlt = targetObj.baseAlt;
          } else if (
            activeTargetRef.current.ra !== undefined &&
            activeTargetRef.current.dec !== undefined
          ) {
            const { altitude, azimuth } = equatorialToHorizontal(
              {
                ra: activeTargetRef.current.ra,
                dec: activeTargetRef.current.dec,
              },
              { latitude: observer.lat, longitude: observer.lon } as any,
              time,
            );
            if (!isNaN(altitude)) {
              tAz = azimuth;
              tAlt = altitude;
            }
          }
        }

        if (tAz !== null && tAlt !== null && !isNaN(tAlt)) {
          let dAz = (tAz - viewAzRef.current) % 360;
          if (dAz > 180) dAz -= 360;
          if (dAz < -180) dAz += 360;

          viewAzRef.current = normalizeAzimuth(viewAzRef.current + dAz * 0.08);
          viewAltRef.current = clamp(
            viewAltRef.current + (tAlt - viewAltRef.current) * 0.08,
            -90,
            90,
          );
        }
      }

      if (Math.abs(targetZoomRef.current - zoomRef.current) > 1e-5) {
        zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.1;
        notifyZoomChangeThrottled(zoomRef.current);
      }

      const rectW = canvas.clientWidth;
      const rectH = canvas.clientHeight;
      if (rectW === 0 || rectH === 0) {
        frameId = requestAnimationFrame(animate);
        return;
      }

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        isMobile ? MOBILE_DPR : DESKTOP_DPR,
      );
      const sw = Math.round(rectW * dpr);
      const sh = Math.round(rectH * dpr);
      if (canvas.width !== sw || canvas.height !== sh) {
        canvas.width = sw;
        canvas.height = sh;
      }

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        frameId = requestAnimationFrame(animate);
        return;
      }

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rectW;
      const height = rectH;
      const cx = width / 2;
      const cy = height / 2;
      const fovScale = (Math.max(width, height) / 2.5) * zoomRef.current;
      const zoomScale = Math.max(1, 1 + (zoomRef.current - 1) * 0.2);
      const uiScale = Math.min(zoomScale, 15);
      const planetScale = Math.min(25, 1 + (zoomRef.current - 1) * 0.8);

      const proj = (bAlt: number, bAz: number) =>
        projectPlanetarium(
          bAlt,
          bAz,
          viewAltRef.current,
          viewAzRef.current,
          cx,
          cy,
          fovScale,
        );

      const sunData = basePlanets.find(
        (p) =>
          String(p.id) === "0" ||
          p.name?.includes("Sun") ||
          p.name?.includes("Matahari") ||
          p.name?.includes("Sol"),
      );

      const moonData = basePlanets.find(
        (p) =>
          p.name?.includes("Moon") ||
          p.name?.includes("Bulan") ||
          p.name?.includes("Luna") ||
          String(p.id) === "10" ||
          String(p.id) === "301" ||
          String(p.id) === "11" ||
          String(p.id) === "-1",
      );

      let pSun: { x: number; y: number; visible: boolean } | null = null;
      let pMoon: { x: number; y: number; visible: boolean } | null = null;
      let targetEclipseFactor = 0;
      let sunRadiusPx = 0;
      let moonRadiusPx = 0;

      if (sunData && !isNaN(sunData.baseAlt)) {
        pSun = proj(sunData.baseAlt, sunData.baseAz);
        sunRadiusPx = (sunData.radiusPx || 8) * planetScale;
      }
      if (moonData && !isNaN(moonData.baseAlt)) {
        pMoon = proj(moonData.baseAlt, moonData.baseAz);
        moonRadiusPx = (moonData.radiusPx || 8) * planetScale;
      }

      if (pSun && pMoon) {
        const dist = Math.hypot(pSun.x - pMoon.x, pSun.y - pMoon.y);
        const totalRadius = sunRadiusPx + moonRadiusPx;
        if (dist < totalRadius) {
          targetEclipseFactor = clamp(1 - dist / totalRadius, 0, 1);
        }
      }

      currentEclipseFactorRef.current +=
        (targetEclipseFactor - currentEclipseFactorRef.current) * 0.05;
      const eclipseFactor = currentEclipseFactorRef.current;

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

      const sunAlt = sunData && !isNaN(sunData.baseAlt) ? sunData.baseAlt : -90;
      let dayIntensity = 0;
      if (filters.atmosphere && sunAlt > -18) {
        dayIntensity = sunAlt > 0 ? 1 : (sunAlt + 18) / 18;
        if (eclipseFactor > 0) {
          dayIntensity *= Math.max(0.02, 1 - Math.pow(eclipseFactor, 0.35));
        }
      }

      if (dayIntensity > 0) {
        ctx.globalAlpha = dayIntensity * 0.6;
        ctx.fillStyle = "#0ea5e9";
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }

      if (filters.atmosphere && sunData && sunAlt > -18 && sunAlt < 10) {
        const sp = pSun;
        const ti =
          sunAlt <= 0 ? (sunAlt + 18) / 18 : Math.max(0, 1 - sunAlt / 10);
        const effectiveTi = ti * (1 - eclipseFactor * 0.85);

        if (sp && effectiveTi > 0) {
          ctx.globalAlpha = effectiveTi;
          const gr = Math.min(
            300,
            Math.max(width, height) * 0.4 * zoomRef.current,
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
      if (pSun) {
        sunScreenX = pSun.x;
        sunScreenY = pSun.y;
      }

      const bortle = filters.bortleScale || 1;

      if (filters.atmosphere && sunAlt < -4) {
        const ns = clamp((-sunAlt - 4) / 18, 0, 1);
        if (ns > 0.04) {
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          const hr = Math.max(width, height) * (0.95 + zoomRef.current * 0.08);
          const gx =
            cx + Math.cos((viewAzRef.current * Math.PI) / 180) * width * 0.08;
          const gy =
            cy -
            Math.sin(((viewAltRef.current - 12) * Math.PI) / 180) *
              height *
              0.08;

          const sg = ctx.createLinearGradient(0, 0, 0, height);
          sg.addColorStop(0, `rgba(125,211,252,${0.05 * ns})`);
          sg.addColorStop(0.45, `rgba(96,165,250,${0.035 * ns})`);
          sg.addColorStop(1, `rgba(30,64,175,${0.02 * ns})`);
          ctx.fillStyle = sg;
          ctx.fillRect(0, 0, width, height);

          if (bortle > 1) {
            const pollutionIntensity = (bortle - 1) / 8;
            const glowOpacity = pollutionIntensity * 0.22 * ns;

            const pg = ctx.createLinearGradient(0, height, 0, 0);
            pg.addColorStop(0, `rgba(251, 146, 60, ${glowOpacity})`);
            pg.addColorStop(0.5, `rgba(148, 163, 184, ${glowOpacity * 0.3})`);
            pg.addColorStop(1, `rgba(0, 0, 0, 0)`);
            ctx.fillStyle = pg;
            ctx.fillRect(0, 0, width, height);
          }

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

      if (dayIntensity < 0.8) {
        const mwBortleFactor = clamp(1 - (bortle - 1) / 7, 0, 1);
        ctx.globalAlpha = (1 - dayIntensity) * mwBortleFactor;

        for (const cloud of projectedMilkyWay) {
          if (isNaN(cloud.baseAlt)) continue;
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
      const visibleMinorBodies = new Map<number, any>();
      const visibleSatellites = new Map<number, any>();
      const visibleConstellations = new Map<string, any>();
      const visiblePlanets: ProjectedStar[] = [];

      const projectObj = (obj: RenderableObject) => {
        if (isNaN(obj.baseAlt)) return;
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

        if (
          planet.name?.includes("Moon") ||
          planet.name?.includes("Bulan") ||
          planet.name?.includes("Luna") ||
          String(planet.id) === "10" ||
          String(planet.id) === "-1"
        )
          continue;

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

      /* ================================================================ */
      /* ✨ INTEGRASI DATA ASTROFOTOGRAFI (DSO IMAGES OVERLAY)            */
      /* ================================================================ */
      if (dayIntensity < 0.75) {
        const dsoOpacity = clamp(1 - (bortle - 1) / 8, 0.1, 1);
        ctx.globalAlpha = (1 - dayIntensity * 0.9) * dsoOpacity;

        const pixelsPerDegree = (fovScale * Math.PI) / 180;

        for (const dso of baseDsos) {
          if (isNaN(dso.baseAlt)) continue;
          const p = proj(dso.baseAlt, dso.baseAz);
          if (!p) continue;

          const dsoMagLimit = 8.5 - bortle * 0.5;
          if (zoomRef.current < 1.5 && dso.mag > dsoMagLimit) continue;

          const dsoImg = dso.image ? getCachedImage(dso.image) : null;

          if (dsoImg && zoomRef.current > 1.2) {
            const sizeArcmin = dso.sizeArcmin || 45;
            const imgSizePx = (sizeArcmin / 60) * pixelsPerDegree;

            ctx.save();
            ctx.translate(p.x, p.y);

            const imgFadeProg = clamp((zoomRef.current - 1.2) * 2, 0, 1);
            ctx.globalAlpha = ctx.globalAlpha * imgFadeProg;

            ctx.globalCompositeOperation = "screen";
            ctx.drawImage(
              dsoImg,
              -imgSizePx / 2,
              -imgSizePx / 2,
              imgSizePx,
              imgSizePx,
            );
            ctx.restore();

            if (imgFadeProg > 0.8) continue;
          }

          const size =
            Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
            Math.max(1, zoomRef.current * 0.5);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.shadowBlur = 20 * zoomScale;
          ctx.shadowColor = dso.color;
          switch (dso.type?.toLowerCase()) {
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
          if (zoomRef.current > 2.2) {
            ctx.fillStyle = "rgba(255,255,255,0.8)";
            ctx.font = `${10 * zoomScale}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText(dso.messier || dso.name, 0, -size * 3);
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }

      if (
        filters.minorBodies &&
        dayIntensity < 0.85 &&
        baseMinorBodies.length > 0
      ) {
        ctx.save();
        ctx.globalAlpha = 1 - dayIntensity * 0.9;
        for (const body of baseMinorBodies) {
          if (isNaN(body.baseAlt) || body.baseAlt < -2) continue;
          const p = proj(body.baseAlt, body.baseAz);
          if (!p) continue;
          visibleMinorBodies.set(body.id, { ...body, x: p.x, y: p.y });
          ctx.save();
          ctx.translate(p.x, p.y);
          const bs =
            Math.max(1.5, (8 - Math.min(body.mag, 8)) * 0.5) * zoomScale;
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
          if (zoomRef.current > 2.5) {
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

      if (filters.satellites && baseSatellites.length > 0) {
        ctx.save();
        const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
        for (const sat of baseSatellites) {
          const tracked = activeTargetRef.current?.id === sat.id;
          if (isNaN(sat.baseAlt) || (sat.baseAlt < 0 && !tracked)) continue;
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

      if (filters.meteorShowers && baseMeteorShowers.length > 0) {
        ctx.save();
        for (const ms of baseMeteorShowers) {
          const tracked = activeTargetRef.current?.id === ms.id;
          if (isNaN(ms.baseAlt)) continue;
          const p = proj(ms.baseAlt, ms.baseAz);
          if (!p) continue;

          visibleMeteors.set(ms.id, { ...ms, x: p.x, y: p.y });
          if (ms.baseAlt < 0 && !tracked) continue;

          ctx.save();
          ctx.translate(p.x, p.y);
          const mc = ms.color || "#fef08a";
          ctx.rotate((Date.now() / 2000) % (Math.PI * 2));
          ctx.strokeStyle = mc;
          ctx.lineWidth = 1.5 * zoomScale;
          ctx.globalAlpha = ms.isActive ? 0.9 : 0.25;
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
          ctx.globalAlpha = ms.isActive ? 1 : 0.4;
          ctx.font = `bold ${10 * uiScale}px monospace`;
          ctx.textAlign = "center";
          ctx.shadowBlur = ms.isActive ? 6 : 0;
          ctx.shadowColor = mc;
          ctx.fillText(ms.name.toUpperCase(), 0, 22 * zoomScale);
          ctx.restore();
        }
        ctx.restore();
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
          if (isNaN(node.baseAlt) || node.baseAlt < -90) {
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
          const isAct = activeTargetRef.current?.id === con.id;
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
          for (const seg of con.lines) {
            for (const node of seg) {
              if (isNaN(node.baseAlt) || node.baseAlt < -90) continue;
              const p = proj(node.baseAlt, node.baseAz);
              if (!p) continue;
              const k = `${Math.round(p.x)},${Math.round(p.y)}`;
              if (!nodeSet.has(k)) nodeSet.set(k, { x: p.x, y: p.y });
            }
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
            ctx.fillStyle = isAct
              ? "rgba(240,253,244,1)"
              : "rgba(220,248,255,1)";
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

      /* ================================================================ */
      /* Batas Magnitude & Render Bintang                                 */
      /* ================================================================ */
      const bortleMagLimit = 8.0 - bortle * 0.42;

      const MAG_BASE = filters.faintStars
        ? bortleMagLimit
        : Math.min(3.5, bortleMagLimit);
      let adjMag = MAG_BASE;
      if (zoomRef.current > 3.0) adjMag += (zoomRef.current - 3.0) * 0.4;
      const MAG_LIMIT = adjMag - dayIntensity * (adjMag + 2);

      for (const star of visibleStars.values()) {
        if (star.isPlanet || star.mag > MAG_LIMIT) continue;

        const magOffset =
          star.isVariable && star.variablePeriod && star.variableAmplitude
            ? getVariableMagOffset(
                star.variablePeriod,
                star.variableAmplitude,
                now,
              )
            : 0;
        const effectiveMag = star.mag + magOffset;

        if (effectiveMag > MAG_LIMIT + 0.5) continue;

        const normMag = Math.max(
          0,
          (MAX_MAG_BASE - effectiveMag) / MAX_MAG_BASE,
        );
        const radiusPx =
          Math.max(
            isMobile ? 0.6 : 0.4,
            normMag * (isMobile ? 3.0 : 2.6) + 0.2,
          ) * uiScale;

        const primaryColor = getStarColor(star.bv);
        const starAlpha = Math.min(
          1,
          Math.max(0.1, (adjMag - effectiveMag) / 5.5),
        );
        ctx.globalAlpha = starAlpha;

        if (star.isDouble && zoomRef.current > DOUBLE_SPLIT_START) {
          const rawProg =
            (zoomRef.current - DOUBLE_SPLIT_START) /
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
          const secNorm = Math.max(0, (MAX_MAG_BASE - secMag) / MAX_MAG_BASE);
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
          ctx.shadowBlur =
            effectiveMag < 2.5 && dayIntensity < 0.5
              ? (3 - effectiveMag) * 4 * uiScale
              : 0;
          ctx.shadowColor = primaryColor;
          ctx.fillStyle = primaryColor;
          ctx.beginPath();
          ctx.arc(star.x, star.y, radiusPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          if (
            star.isDouble &&
            zoomRef.current >= 1.5 &&
            zoomRef.current <= DOUBLE_SPLIT_START
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

          if (star.isVariable && zoomRef.current > 1.5) {
            const periodMs = (star.variablePeriod || 7) * 86_400_000;
            const phase = (now % periodMs) / periodMs;
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

      if (filters.planets) {
        ctx.globalAlpha = 1;

        const otherPlanets = visiblePlanets.filter(
          (p) =>
            String(p.id) !== "0" &&
            !p.name?.includes("Sun") &&
            !p.name?.includes("Matahari") &&
            !p.name?.includes("Sol") &&
            !p.name?.includes("Moon") &&
            !p.name?.includes("Bulan") &&
            !p.name?.includes("Luna") &&
            String(p.id) !== "10" &&
            String(p.id) !== "301" &&
            String(p.id) !== "-1",
        );

        if (pSun && sunData) {
          ctx.save();
          if (eclipseFactor > 0.85) {
            const coronaRadius = sunRadiusPx * (3.5 + eclipseFactor * 5);
            const coronaGlow = ctx.createRadialGradient(
              pSun.x,
              pSun.y,
              sunRadiusPx * 0.7,
              pSun.x,
              pSun.y,
              coronaRadius,
            );
            coronaGlow.addColorStop(0, "rgba(255, 255, 255, 0.95)");
            coronaGlow.addColorStop(0.15, "rgba(254, 240, 138, 0.5)");
            coronaGlow.addColorStop(0.4, "rgba(224, 242, 254, 0.15)");
            coronaGlow.addColorStop(1, "rgba(255, 255, 255, 0)");

            ctx.fillStyle = coronaGlow;
            ctx.beginPath();
            ctx.arc(pSun.x, pSun.y, coronaRadius, 0, Math.PI * 2);
            ctx.fill();

            if (eclipseFactor < 0.995 && pMoon) {
              const angle = Math.atan2(pSun.y - pMoon.y, pSun.x - pMoon.x);
              const flareX = pSun.x + Math.cos(angle) * (sunRadiusPx * 0.95);
              const flareY = pSun.y + Math.sin(angle) * (sunRadiusPx * 0.95);

              ctx.shadowBlur = 40 * uiScale;
              ctx.shadowColor = "#ffffff";
              ctx.fillStyle = "#ffffff";
              ctx.beginPath();
              ctx.arc(flareX, flareY, sunRadiusPx * 0.45, 0, Math.PI * 2);
              ctx.fill();
              ctx.shadowBlur = 0;
            }
          } else {
            ctx.shadowBlur = 40 * uiScale;
            ctx.shadowColor = "#f59e0b";
            ctx.fillStyle = sunData.colorStr || "#facc15";
            ctx.beginPath();
            ctx.arc(pSun.x, pSun.y, sunRadiusPx, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = "#fffbeb";
            ctx.beginPath();
            ctx.arc(pSun.x, pSun.y, sunRadiusPx * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
          ctx.restore();
        }

        otherPlanets.forEach((planet) => {
          const isSat = Boolean(planet.parent);
          const layout = satelliteLayouts.get(planet.id);
          const rx = layout?.x ?? planet.x;
          const ry = layout?.y ?? planet.y;
          const rPx = (planet.radiusPx || 4) * planetScale;

          let isTransiting = false;
          if (pSun && (planet.name === "Mercury" || planet.name === "Venus")) {
            if (Math.hypot(rx - pSun.x, ry - pSun.y) < sunRadiusPx)
              isTransiting = true;
          }

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

          const drawR = isSat
            ? Math.max(1.5 * uiScale, rPx * 0.25)
            : isTransiting
              ? rPx * 0.6
              : isMobile
                ? rPx * 1.2
                : rPx;

          ctx.shadowBlur = isTransiting ? 0 : (isSat ? 6 : 15) * uiScale;
          ctx.shadowColor = planet.colorStr || "#ffffff";
          ctx.fillStyle = isTransiting
            ? "#000000"
            : planet.colorStr || "#ffffff";
          ctx.beginPath();
          ctx.arc(rx, ry, drawR, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;

          if (
            (!isTransiting && !isSat && zoomRef.current > 3.0) ||
            (isSat && zoomRef.current > 4.5)
          ) {
            ctx.save();
            ctx.font = `${(isSat ? 8 : 10) * uiScale}px monospace`;
            ctx.textAlign = "center";
            ctx.fillStyle = isSat ? "rgba(203,213,225,0.9)" : "white";
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";
            ctx.fillText(
              planet.name || "",
              rx,
              ry + drawR + (isSat ? 10 : 14) * uiScale,
            );
            ctx.restore();
          }
        });

        if (pMoon && moonData) {
          visibleStars.set(moonData.id, {
            ...moonData,
            x: pMoon.x,
            y: pMoon.y,
          });

          ctx.save();
          ctx.fillStyle =
            eclipseFactor > 0.1 ? "#020617" : moonData.colorStr || "#e2e8f0";

          if (eclipseFactor > 0.85) {
            ctx.shadowBlur = 4;
            ctx.shadowColor = "#000000";
          }

          ctx.beginPath();
          ctx.arc(pMoon.x, pMoon.y, moonRadiusPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (zoomRef.current > 3.0) {
            ctx.fillStyle = eclipseFactor > 0.85 ? "#94a3b8" : "white";
            ctx.font = `${10 * uiScale}px monospace`;
            ctx.textAlign = "center";
            ctx.fillText(
              moonData.name || "Luna",
              pMoon.x,
              pMoon.y + moonRadiusPx + 14 * uiScale,
            );
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

      if (activeTargetRef.current) {
        const isCon = typeof activeTargetRef.current.id === "string";
        let fb: any = latestObjectsRef.current.get(activeTargetRef.current.id);
        if (!fb)
          fb = latestObjectsRef.current.get(String(activeTargetRef.current.id));
        if (!fb)
          fb = latestObjectsRef.current.get(Number(activeTargetRef.current.id));

        let themeColor = "rgba(34,197,94,";
        if (fb) {
          const t = (fb as any).type;
          if (t === "Comet" || t === "Asteroid")
            themeColor = "rgba(45,212,191,";
          else if (t === "Satellite") themeColor = "rgba(16,185,129,";
          else if (t === "MeteorShower") themeColor = "rgba(250,204,21,";
        } else if (activeTargetRef.current.type === "CelestialEvent") {
          themeColor = "rgba(249,115,22,";
        }

        if (isCon) {
          const tCon = projectedConstellations.find(
            (c) => c.id === activeTargetRef.current.id,
          );
          if (tCon) {
            if (tCon.boundaries && tCon.boundaries.length > 0) {
              ctx.save();
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.strokeStyle = "rgba(153, 27, 27, 0.4)";
              ctx.lineWidth = 1.2 * zoomScale;
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
              for (const seg of tCon.lines) {
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
            activeTargetRef.current.id,
          );
          if (!tc) tc = visibleStars.get(Number(activeTargetRef.current.id));
          if (!tc) tc = visibleMinorBodies.get(activeTargetRef.current.id);
          if (!tc) tc = visibleSatellites.get(activeTargetRef.current.id);
          if (!tc) tc = visibleMeteors.get(activeTargetRef.current.id);

          if (
            !tc &&
            pMoon &&
            (String(activeTargetRef.current.id) === "-1" ||
              activeTargetRef.current.name?.includes("Luna") ||
              activeTargetRef.current.name?.includes("Bulan"))
          ) {
            tc = { x: pMoon.x, y: pMoon.y };
          }

          if (tc) {
            const tOff = Date.now() / 400;
            ctx.save();
            ctx.translate(tc.x, tc.y);
            const cl = 35 * zoomScale,
              ig = 15 * zoomScale;
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

      if (filters.fovConfig && filters.fovConfig.enabled) {
        const {
          type,
          focalLength,
          sensorWidth,
          sensorHeight,
          eyepieceFocalLength = 25,
          eyepieceAfov = 52,
          color = "rgba(239, 68, 68, 0.85)",
          rotation = 0,
        } = filters.fovConfig;

        ctx.save();
        ctx.translate(cx, cy);
        const pixelsPerDegree = (fovScale * Math.PI) / 180;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8 * zoomScale;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;

        if (type === "sensor" && focalLength > 0) {
          const fovWDeg = (sensorWidth / focalLength) * (180 / Math.PI);
          const fovHDeg = (sensorHeight / focalLength) * (180 / Math.PI);
          const fovWPx = fovWDeg * pixelsPerDegree;
          const fovHPx = fovHDeg * pixelsPerDegree;

          if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);

          ctx.strokeRect(-fovWPx / 2, -fovHPx / 2, fovWPx, fovHPx);
          ctx.save();
          ctx.strokeStyle = color.replace(/[\d.]+\)$/g, "0.3)");
          ctx.lineWidth = 1;
          ctx.setLineDash([4 * zoomScale, 4 * zoomScale]);
          ctx.beginPath();
          ctx.moveTo(-fovWPx / 2, 0);
          ctx.lineTo(fovWPx / 2, 0);
          ctx.moveTo(0, -fovHPx / 2);
          ctx.lineTo(0, fovHPx / 2);
          ctx.stroke();
          ctx.restore();

          if (zoomRef.current > 1.2) {
            ctx.fillStyle = color;
            ctx.font = `bold ${10 * uiScale}px monospace`;
            ctx.textAlign = "center";
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";
            ctx.fillText(
              `${fovWDeg.toFixed(2)}° × ${fovHDeg.toFixed(2)}°`,
              0,
              -fovHPx / 2 - 8 * uiScale,
            );
          }
        } else if (
          type === "eyepiece" &&
          focalLength > 0 &&
          eyepieceFocalLength > 0
        ) {
          const magnification = focalLength / eyepieceFocalLength;
          const trueFovDeg = eyepieceAfov / magnification;
          const radiusPx = (trueFovDeg / 2) * pixelsPerDegree;

          ctx.beginPath();
          ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
          ctx.stroke();

          ctx.save();
          ctx.strokeStyle = color.replace(/[\d.]+\)$/g, "0.25)");
          ctx.lineWidth = 1;
          ctx.setLineDash([3 * zoomScale, 3 * zoomScale]);
          ctx.beginPath();
          ctx.arc(0, 0, radiusPx * 0.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          if (zoomRef.current > 1.2) {
            ctx.fillStyle = color;
            ctx.font = `bold ${10 * uiScale}px monospace`;
            ctx.textAlign = "center";
            ctx.shadowBlur = 4;
            ctx.shadowColor = "black";
            ctx.fillText(
              `FOV: ${trueFovDeg.toFixed(2)}° (${magnification.toFixed(0)}x)`,
              0,
              -radiusPx - 8 * uiScale,
            );
          }
        }
        ctx.restore();
      }

      renderedStarsRef.current = visibleStars;
      renderedMinorBodiesRef.current = visibleMinorBodies;
      renderedSatellitesRef.current = visibleSatellites;
      renderedMeteorShowersRef.current = visibleMeteors;
      renderedConstellationsRef.current = visibleConstellations;

      ctx.restore();
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => {
      isActive = false;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [
    basePlanets,
    baseStars,
    baseDsos,
    baseMinorBodies,
    baseSatellites,
    baseMeteorShowers,
    projectedMilkyWay,
    projectedConstellations,
    equatorialGridNodes,
    filters,
    isMobile,
    notifyZoomChangeThrottled,
  ]);

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (
        pointerDownRef.current &&
        !didPointerMoveRef.current &&
        Math.hypot(
          e.clientX - pointerDownRef.current.x,
          e.clientY - pointerDownRef.current.y,
        ) > CLICK_MOVE_THRESHOLD
      ) {
        didPointerMoveRef.current = true;
      }

      if (
        activePointers.current.size === 2 &&
        initialPinchDist.current !== null
      ) {
        const pts = Array.from(activePointers.current.values());
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const newZoom = clamp(
          initialZoom.current * (d / initialPinchDist.current),
          MIN_ZOOM_LEVEL,
          MAX_ZOOM_LEVEL,
        );
        zoomRef.current = newZoom;
        targetZoomRef.current = newZoom;
        notifyZoomChangeThrottled(newZoom);
        return;
      }

      if (activePointers.current.size === 1 && isDraggingRef.current) {
        const dx = e.clientX - lastPointerRef.current.x;
        const dy = e.clientY - lastPointerRef.current.y;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };

        const sens =
          (isMobile ? VIEW_SENSITIVITY * 0.8 : VIEW_SENSITIVITY) /
          zoomRef.current;

        if (Math.hypot(dx, dy) > CLICK_MOVE_THRESHOLD) {
          didPointerMoveRef.current = true;
          if (activeTargetRef.current) onClearTargetRef.current?.();
        }

        viewAzRef.current = normalizeAzimuth(viewAzRef.current - dx * sens);
        viewAltRef.current = clamp(viewAltRef.current + dy * sens, -90, 90);
      }
    },
    [isMobile, notifyZoomChangeThrottled],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
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
        initialZoom.current = zoomRef.current;
      }
    },
    [],
  );

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
          for (const seg of con.segments) {
            d = Math.min(
              d,
              distToSegment(mx, my, seg.x1, seg.y1, seg.x2, seg.y2),
            );
          }
          if (d < cr && d < minDist) {
            minDist = d;
            found = constellations?.find((c) => c.id === con.id);
          }
        }
      }

      if (found) {
        onSelectTargetRef.current?.(found);
        onStarHoverRef.current?.({
          id: found.id,
          name: found.name,
          mag: found.mag ?? 0,
          alt: found.baseAlt,
          az: found.baseAz,
          type: typeof found.id === "string" ? "constellation" : found.type,
        });
      } else {
        onClearTargetRef.current?.();
        onStarHoverRef.current?.(null);
      }
    },
    [isMobile, filters, constellations],
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (activeTargetRef.current) onClearTargetRef.current?.();
      const factor = e.deltaY > 0 ? 0.85 : 1.15;
      targetZoomRef.current = clamp(
        targetZoomRef.current * factor,
        MIN_ZOOM_LEVEL,
        MAX_ZOOM_LEVEL,
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

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
