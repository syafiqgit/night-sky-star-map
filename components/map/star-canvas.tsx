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
  parent?: string; // Tambahkan properti parent
}

type RenderableObject = Pick<ProjectedStar, "id" | "baseAlt" | "baseAz"> &
  Partial<ProjectedStar>;

export interface PopularConstellation {
  id: string;
  name: string;
  center: [number, number];
  lines: Array<Array<[number, number]>>;
}

export interface StarCanvasProps {
  stars: Star[];
  constellations?: PopularConstellation[];
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
    gridHorizontal?: boolean;
    gridEquatorial?: boolean;
  };
  activeTarget: any | null;
  onSelectTarget: (target: any) => void;
  onClearTarget: () => void;
  zoomLevel?: number;
  onZoomChange?: (newZoom: number) => void;
}

const MAX_MAG = 6.5;
const VIEW_SENSITIVITY = 0.15;
const MOBILE_BREAKPOINT = 768;
const MOBILE_DPR = 1.5;
const DESKTOP_DPR = 2;
const MOBILE_HOVER_RADIUS = 28;
const DESKTOP_HOVER_RADIUS = 16;
const CLICK_MOVE_THRESHOLD = 6;
const MAX_FOV_DEG = 185;
const MIN_FOV_DEG = 0.000278; // Batas Stellarium
const MIN_ZOOM_LEVEL = (2.5 * 180) / (Math.PI * MAX_FOV_DEG);
// Perhitungan otomatis untuk mencapai FOV 0.000278
const MAX_ZOOM_LEVEL = (MAX_FOV_DEG / MIN_FOV_DEG) * MIN_ZOOM_LEVEL;

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

function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const C = x2 - x1;
  const D = y2 - y1;
  const lenSq = C * C + D * D;

  if (lenSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = Math.max(0, Math.min(1, ((px - x1) * C + (py - y1) * D) / lenSq));

  const projX = x1 + t * C;
  const projY = y1 + t * D;

  return Math.hypot(px - projX, py - projY);
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
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
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
  isMobile: boolean,
): Map<number, SatelliteLayout> {
  const layouts = new Map<number, SatelliteLayout>();
  if (children.length === 0) return layouts;

  const sortedChildren = [...children].sort((a, b) => {
    const aKey = `${a.name ?? ""}-${a.id}`;
    const bKey = `${b.name ?? ""}-${b.id}`;
    return aKey.localeCompare(bKey);
  });

  const parentRadius = Math.max(
    24,
    (parent.radiusPx ?? 4) * (isMobile ? 7 : 8) * zoomScale,
  );
  const baseAngle =
    ((stableHash(getObjectKey(parent.id)) % 360) * Math.PI) / 180;
  const slotCount = Math.max(1, Math.min(8, sortedChildren.length));

  sortedChildren.forEach((child, index) => {
    const ring = Math.floor(index / slotCount);
    const slot = index % slotCount;
    const spread = (slot / slotCount) * Math.PI * 2;
    const angle = baseAngle + spread + ring * 0.28;

    // --- PERUBAHAN: Jarak diperlebar dari 16 menjadi 45, ring dari 18 menjadi 35 ---
    const distance =
      parentRadius + 45 * zoomScale + ring * (35 * zoomScale) + slot * 1.25;

    const x = parent.x + Math.cos(angle) * distance;
    const y = parent.y + Math.sin(angle) * distance;

    layouts.set(child.id, {
      x,
      y,
      labelX: 0, // Tidak digunakan lagi
      labelY: 0, // Tidak digunakan lagi
      leaderX1: parent.x,
      leaderY1: parent.y,
      leaderX2: x,
      leaderY2: y,
    });
  });

  return layouts;
}

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

  const latestObjectsRef = useRef<Map<any, RenderableObject>>(new Map());

  const initialSafeZoom = useMemo(() => {
    return clamp(externalZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
  }, [externalZoomLevel]);

  const [internalZoomLevel, setInternalZoomLevel] = useState(initialSafeZoom);
  const currentZoomLevel = onZoomChange ? initialSafeZoom : internalZoomLevel;

  const zoomLevelRef = useRef<number>(currentZoomLevel);
  zoomLevelRef.current = currentZoomLevel;

  const onZoomChangeRef = useRef(onZoomChange);
  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    const clamped = clamp(externalZoomLevel, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
    // Hanya update jika perubahannya signifikan untuk memutus loop
    if (Math.abs(clamped - internalZoomLevel) > 0.000001) {
      setInternalZoomLevel(clamped);
    }
  }, [externalZoomLevel, internalZoomLevel]);

  const updateZoomLevel = useCallback((updater: (prev: number) => number) => {
    const nextZoom = updater(zoomLevelRef.current);
    const clampedZoom = clamp(nextZoom, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);

    if (onZoomChangeRef.current) {
      onZoomChangeRef.current(clampedZoom);
    } else {
      setInternalZoomLevel(clampedZoom);
    }
  }, []); // Dependency kosongependency kosong karena menggunakan Ref

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      isAutoZoomingOutRef.current = false;
      if (activeTarget) onClearTarget();

      updateZoomLevel((prev) => {
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        return prev * zoomFactor;
      });
    };

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [activeTarget, onClearTarget, updateZoomLevel]);

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

  const safeObserver = useMemo(
    () => ({
      lat: observer.lat,
      lon: observer.lon,
      latitude: observer.lat,
      longitude: observer.lon,
    }),
    [observer.lat, observer.lon],
  );

  const baseStars = useMemo(() => {
    return stars.map((star) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: star.ra, dec: star.dec },
        safeObserver as any,
        time,
      );

      return { ...star, baseAlt: altitude, baseAz: azimuth };
    });
  }, [safeObserver, stars, time]);

  const basePlanets = useMemo(() => {
    // MODIFIKASI: Urutkan agar satelit digambar lebih dulu (di layer bawah planet induknya)
    return getSolarSystemObjects(time, solarSystem)
      .sort((a: any, b: any) => (a.parent ? -1 : 1))
      .map((planet: any) => {
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
          parent: planet.parent, // Pastikan data parent diteruskan
        };
      });
  }, [safeObserver, time, solarSystem]);

  const baseDsos = useMemo(() => {
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
  }, [dsos, safeObserver, time]);

  const projectedMilkyWay = useMemo(() => {
    return baseMilkyWay.map((cloud) => {
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra: cloud.ra, dec: cloud.dec },
        safeObserver as any,
        time,
      );

      return { ...cloud, baseAlt: altitude, baseAz: azimuth };
    });
  }, [baseMilkyWay, safeObserver, time]);

  const projectedConstellations = useMemo(() => {
    if (
      !filters.constellations ||
      !constellations ||
      constellations.length === 0
    ) {
      return [];
    }

    return constellations.map((con) => {
      const raCenter = con.center[0];
      const decCenter = con.center[1];

      const { altitude: cAlt, azimuth: cAz } = equatorialToHorizontal(
        { ra: raCenter, dec: decCenter },
        safeObserver as any,
        time,
      );

      const projectedLines =
        con.lines?.map((segment) => {
          return segment.map((point) => {
            const raNode = point[0];
            const decNode = point[1];

            const { altitude, azimuth } = equatorialToHorizontal(
              { ra: raNode, dec: decNode },
              safeObserver as any,
              time,
            );
            return { baseAlt: altitude, baseAz: azimuth };
          });
        }) ?? [];

      return {
        id: con.id,
        name: con.name,
        center: { baseAlt: cAlt, baseAz: cAz },
        lines: projectedLines,
      };
    });
  }, [filters.constellations, constellations, safeObserver, time]);

  const equatorialGridNodes = useMemo(() => {
    if (!filters.gridEquatorial) {
      return { raLines: [], decLines: [], equatorNodes: [] };
    }

    const raLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const decLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const equatorNodes: Array<{ baseAlt: number; baseAz: number }> = [];

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

    for (let dec = -75; dec <= 75; dec += 15) {
      if (dec === 0) continue;
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
    const objectMap = new Map<any, RenderableObject>();

    for (const star of baseStars) objectMap.set(star.id, star);
    for (const planet of basePlanets) objectMap.set(planet.id, planet);
    for (const dso of baseDsos) objectMap.set(dso.id, dso);

    for (const con of projectedConstellations) {
      objectMap.set(con.id, {
        id: con.id as any,
        baseAlt: con.center.baseAlt,
        baseAz: con.center.baseAz,
      });
    }

    latestObjectsRef.current = objectMap;
  }, [baseStars, basePlanets, baseDsos, projectedConstellations]);

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

        const isConstellationTarget = typeof activeTarget.id === "string";
        const targetZoomLimit = isConstellationTarget ? 1.8 : 4.5;

        updateZoomLevel((prev) => {
          const diffZ = targetZoomLimit - prev;
          if (Math.abs(diffZ) > 0.005) {
            isMoving = true;
            return prev + diffZ * 0.08;
          }
          return targetZoomLimit;
        });

        let targetAz: number | null = null;
        let targetAlt: number | null = null;

        if (isConstellationTarget) {
          const tCon = projectedConstellations.find(
            (c) => c.id === activeTarget.id,
          );

          if (tCon && tCon.lines && tCon.lines.length > 0) {
            let sumSinAz = 0;
            let sumCosAz = 0;
            let sumAlt = 0;
            let count = 0;

            for (const segment of tCon.lines) {
              for (const node of segment) {
                const azRad = node.baseAz * (Math.PI / 180);
                sumSinAz += Math.sin(azRad);
                sumCosAz += Math.cos(azRad);
                sumAlt += node.baseAlt;
                count++;
              }
            }

            if (count > 0) {
              const avgAzRad = Math.atan2(sumSinAz / count, sumCosAz / count);
              targetAz = normalizeAzimuth(avgAzRad * (180 / Math.PI));
              targetAlt = clamp(sumAlt / count, -90, 90);
            }
          }

          if (targetAz === null || targetAlt === null) {
            const fallbackObj = latestObjectsRef.current.get(activeTarget.id);
            if (fallbackObj) {
              targetAz = fallbackObj.baseAz;
              targetAlt = fallbackObj.baseAlt;
            }
          }
        } else {
          const targetObj = latestObjectsRef.current.get(activeTarget.id);
          if (targetObj) {
            targetAz = targetObj.baseAz;
            targetAlt = targetObj.baseAlt;
          }
        }

        if (targetAz !== null && targetAlt !== null) {
          const finalAz = targetAz;
          const finalAlt = targetAlt;

          setViewAngle((prev) => {
            let diffAz = (finalAz - prev.az) % 360;
            if (diffAz > 180) diffAz -= 360;
            if (diffAz < -180) diffAz += 360;

            const diffAlt = finalAlt - prev.alt;

            if (Math.abs(diffAz) > 0.05 || Math.abs(diffAlt) > 0.05) {
              isMoving = true;
              return {
                az: normalizeAzimuth(prev.az + diffAz * 0.08),
                alt: clamp(prev.alt + diffAlt * 0.08, -90, 90),
              };
            }

            isMoving = true;
            return {
              az: finalAz,
              alt: clamp(finalAlt, -90, 90),
            };
          });
        }
      } else if (isAutoZoomingOutRef.current) {
        updateZoomLevel((prev) => {
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
  }, [activeTarget, updateZoomLevel]);

  const selectObjectAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      let foundTarget: any = null;
      const baseRadius = isMobile ? MOBILE_HOVER_RADIUS : DESKTOP_HOVER_RADIUS;
      let minimumDistance = baseRadius;

      for (const star of renderedStarsRef.current.values()) {
        const distance = Math.hypot(star.x - mouseX, star.y - mouseY);
        if (distance < minimumDistance) {
          minimumDistance = distance;
          foundTarget = star;
        }
      }

      if (filters.constellations) {
        const constellationRadius = baseRadius * 1.5;
        for (const con of renderedConstellationsRef.current.values()) {
          let minDistToCon = Math.hypot(con.x - mouseX, con.y - mouseY);
          if (con.segments) {
            for (const seg of con.segments) {
              const dSeg = distToSegment(
                mouseX,
                mouseY,
                seg.x1,
                seg.y1,
                seg.x2,
                seg.y2,
              );
              if (dSeg < minDistToCon) minDistToCon = dSeg;
            }
          }
          if (
            minDistToCon < constellationRadius &&
            minDistToCon < minimumDistance
          ) {
            minimumDistance = minDistToCon;
            foundTarget = constellations.find((c) => c.id === con.id);
          }
        }
      }

      if (foundTarget) {
        onSelectTarget(foundTarget);
        onStarHover({
          id: foundTarget.id,
          name: foundTarget.name,
          mag: foundTarget.mag || 0,
          alt: foundTarget.baseAlt,
          az: foundTarget.baseAz,
          type:
            typeof foundTarget.id === "string" ? "constellation" : undefined,
        });
      } else {
        onClearTarget();
        onStarHover(null);
      }
    },
    [
      isMobile,
      filters.constellations,
      constellations,
      onSelectTarget,
      onStarHover,
      onClearTarget,
    ],
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
    const fovScale = (Math.max(width, height) / 2.5) * currentZoomLevel;

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
          Math.max(width, height) * 0.4 * currentZoomLevel,
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
        const hazeRadius =
          Math.max(width, height) * (0.95 + currentZoomLevel * 0.08);
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

    const zoomScale = Math.max(1, 1 + (currentZoomLevel - 1) * 0.2);
    // uiScale mencegah label dan garis menjadi raksasa saat zoom 500.000x
    const uiScale = Math.min(zoomScale, 15);
    const planetScale = 1 + (currentZoomLevel - 1) * 0.8;

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
    const visibleLookup = new Map<string, ProjectedStar>();
    const visiblePlanets: ProjectedStar[] = [];

    const projectVisibleObject = (obj: RenderableObject) => {
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
      if ((projected as any).messier) {
        visibleLookup.set(String((projected as any).messier), projected);
      }
      if (projected.isPlanet) visiblePlanets.push(projected);
    };

    for (const star of baseStars) projectVisibleObject(star);
    for (const dso of baseDsos) projectVisibleObject(dso);
    if (filters.planets) {
      for (const planet of basePlanets) projectVisibleObject(planet);
    }

    const satelliteLayouts = new Map<number, SatelliteLayout>();
    const satellitesByParent = new Map<string, ProjectedStar[]>();

    for (const planet of visiblePlanets) {
      const parentKey = getObjectKey((planet as any).parent);
      if (!parentKey) continue;

      if (!satellitesByParent.has(parentKey)) {
        satellitesByParent.set(parentKey, []);
      }
      satellitesByParent.get(parentKey)!.push(planet);
    }

    for (const [parentKey, children] of satellitesByParent.entries()) {
      const parentObj = visibleLookup.get(parentKey);
      if (!parentObj) continue;

      const layouts = buildSatelliteLayout(
        parentObj,
        children,
        zoomScale,
        isMobile,
      );

      for (const [id, layout] of layouts.entries()) {
        satelliteLayouts.set(id, layout);

        const projected = visibleStars.get(id);
        if (projected) {
          projected.x = layout.x;
          projected.y = layout.y;
          visibleStars.set(id, projected);
        }
      }
    }

    renderedStarsRef.current = visibleStars;

    if (dayIntensity < 0.75) {
      context.globalAlpha = 1 - dayIntensity * 0.9;
      for (const dso of baseDsos) {
        const p = proj(dso.baseAlt, dso.baseAz);
        if (!p) continue;
        if (currentZoomLevel < 1.5 && dso.mag > 7) continue;
        const size =
          Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
          Math.max(1, currentZoomLevel * 0.5);
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
        if (currentZoomLevel > 2.2) {
          context.fillStyle = "rgba(255,255,255,0.8)";
          context.font = `${10 * zoomScale}px monospace`;
          context.textAlign = "center";
          context.fillText(dso.messier || dso.name, 0, -size * 3);
        }
        context.restore();
      }
      context.globalAlpha = 1;
    }

    const drawProjectedPath = (
      nodes: Array<{ baseAlt: number; baseAz: number }>,
      color: string,
      lineWidth: number,
      dashPattern: number[] = [],
      maxSegmentAngleDeg: number = 45,
      outSegments?: Array<{ x1: number; y1: number; x2: number; y2: number }>,
    ) => {
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.setLineDash(dashPattern);
      let prevNode: { baseAlt: number; baseAz: number } | null = null;
      let prevPoint: { x: number; y: number } | null = null;
      for (const node of nodes) {
        if (node.baseAlt < -90) {
          prevNode = null;
          prevPoint = null;
          continue;
        }
        const p = proj(node.baseAlt, node.baseAz);
        if (!p) {
          prevNode = null;
          prevPoint = null;
          continue;
        }
        if (prevPoint !== null && prevNode !== null) {
          let shouldDraw = true;
          if (maxSegmentAngleDeg < Infinity) {
            const alt1Rad = prevNode.baseAlt * (Math.PI / 180);
            const alt2Rad = node.baseAlt * (Math.PI / 180);
            const deltaAzRad =
              (node.baseAz - prevNode.baseAz) * (Math.PI / 180);
            const cosC =
              Math.sin(alt1Rad) * Math.sin(alt2Rad) +
              Math.cos(alt1Rad) * Math.cos(alt2Rad) * Math.cos(deltaAzRad);
            const clampedCosC = Math.max(-1, Math.min(1, cosC));
            const arcAngleDeg = Math.acos(clampedCosC) * (180 / Math.PI);
            if (arcAngleDeg > maxSegmentAngleDeg) shouldDraw = false;
          }
          const screenDist = Math.hypot(p.x - prevPoint.x, p.y - prevPoint.y);
          if (screenDist > width * 0.6) shouldDraw = false;
          if (shouldDraw) {
            context.beginPath();
            context.moveTo(prevPoint.x, prevPoint.y);
            context.lineTo(p.x, p.y);
            context.stroke();
            if (outSegments)
              outSegments.push({
                x1: prevPoint.x,
                y1: prevPoint.y,
                x2: p.x,
                y2: p.y,
              });
          }
        }
        prevNode = node;
        prevPoint = { x: p.x, y: p.y };
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
      context.save();
      context.globalAlpha = 1 - dayIntensity;
      context.lineCap = "round";
      context.lineJoin = "round";
      const SAFE_CONSTELLATION_SEGMENT_DEG = 120;
      const DOT_RADIUS_OUTER = (isMobile ? 2.5 : 3.5) * zoomScale;
      const DOT_RADIUS_INNER = (isMobile ? 1.2 : 1.8) * zoomScale;
      const DOT_GLOW_BLUR = (isMobile ? 6 : 10) * zoomScale;

      for (const con of projectedConstellations) {
        const isActiveCon = activeTarget && activeTarget.id === con.id;
        const LINE_COLOR = isActiveCon
          ? "rgba(34, 197, 94, 0.95)"
          : "rgba(125, 211, 252, 0.75)";
        const LINE_WIDTH =
          (isActiveCon ? (isMobile ? 1.5 : 2.0) : isMobile ? 0.9 : 1.3) *
          zoomScale;
        const GLOW_COLOR = isActiveCon
          ? "rgba(34, 197, 94, 0.3)"
          : "rgba(125, 211, 252, 0.2)";
        const GLOW_WIDTH =
          (isActiveCon ? (isMobile ? 5.0 : 8.0) : isMobile ? 3.5 : 5.5) *
          zoomScale;

        context.globalCompositeOperation = "screen";
        context.lineWidth = GLOW_WIDTH;
        context.strokeStyle = GLOW_COLOR;
        context.setLineDash([]);
        for (const segmentNodes of con.lines)
          drawProjectedPath(
            segmentNodes,
            GLOW_COLOR,
            GLOW_WIDTH,
            [],
            SAFE_CONSTELLATION_SEGMENT_DEG,
          );

        context.globalCompositeOperation = "source-over";
        const currentSegments: Array<{
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        }> = [];
        for (const segmentNodes of con.lines)
          drawProjectedPath(
            segmentNodes,
            LINE_COLOR,
            LINE_WIDTH,
            [],
            SAFE_CONSTELLATION_SEGMENT_DEG,
            currentSegments,
          );

        const nodeSet = new Map<string, { x: number; y: number }>();
        for (const segmentNodes of con.lines) {
          for (const node of segmentNodes) {
            if (node.baseAlt < -90) continue;
            const p = proj(node.baseAlt, node.baseAz);
            if (!p) continue;
            const key = `${Math.round(p.x)},${Math.round(p.y)}`;
            if (!nodeSet.has(key)) nodeSet.set(key, { x: p.x, y: p.y });
          }
        }

        for (const { x, y } of nodeSet.values()) {
          context.save();
          context.shadowBlur = DOT_GLOW_BLUR;
          context.shadowColor = isActiveCon
            ? "rgba(74, 222, 128, 0.9)"
            : "rgba(147, 223, 255, 0.9)";
          const outerGrad = context.createRadialGradient(
            x,
            y,
            0,
            x,
            y,
            DOT_RADIUS_OUTER,
          );
          outerGrad.addColorStop(
            0,
            isActiveCon
              ? "rgba(220, 252, 231, 1.0)"
              : "rgba(210, 245, 255, 1.0)",
          );
          outerGrad.addColorStop(
            0.5,
            isActiveCon
              ? "rgba(74, 222, 128, 0.75)"
              : "rgba(125, 211, 252, 0.75)",
          );
          outerGrad.addColorStop(1, "rgba(56,  189, 248, 0.0)");
          context.fillStyle = outerGrad;
          context.beginPath();
          context.arc(x, y, DOT_RADIUS_OUTER, 0, Math.PI * 2);
          context.fill();
          context.shadowBlur = DOT_GLOW_BLUR * 0.5;
          context.fillStyle = isActiveCon
            ? "rgba(240, 253, 244, 1.0)"
            : "rgba(220, 248, 255, 1.0)";
          context.beginPath();
          context.arc(x, y, DOT_RADIUS_INNER, 0, Math.PI * 2);
          context.fill();
          context.restore();
        }

        if (con.name) {
          let sumX = 0,
            sumY = 0,
            visibleCount = 0;
          for (const point of nodeSet.values()) {
            if (
              point.x >= -width &&
              point.x <= width * 2 &&
              point.y >= -height &&
              point.y <= height * 2
            ) {
              sumX += point.x;
              sumY += point.y;
              visibleCount++;
            }
          }
          let labelX = 0,
            labelY = 0,
            hasValidLabel = false;
          if (visibleCount > 0) {
            labelX = sumX / visibleCount;
            labelY = sumY / visibleCount;
            hasValidLabel = true;
          } else if (currentSegments.length > 0) {
            const firstSeg = currentSegments[0];
            labelX = (firstSeg.x1 + firstSeg.x2) / 2;
            labelY = (firstSeg.y1 + firstSeg.y2) / 2;
            hasValidLabel = true;
          }

          if (hasValidLabel) {
            visibleConstellations.set(con.id, {
              id: con.id,
              name: con.name,
              x: labelX,
              y: labelY,
              baseAlt: con.center.baseAlt,
              baseAz: con.center.baseAz,
              segments: currentSegments,
            });
            const fontSize = (isMobile ? 8 : 10) * zoomScale;
            context.font = `bold ${fontSize}px 'Courier New', monospace`;
            context.shadowBlur = 6;
            context.shadowColor = "rgba(0,0,0,0.9)";
            context.fillStyle = isActiveCon
              ? "rgba(74, 222, 128, 0.95)"
              : "rgba(148, 163, 184, 0.75)";
            context.textAlign = "center";
            context.fillText(con.name.toUpperCase(), labelX, labelY);
            context.shadowBlur = 0;
          }
        }
      }
      context.restore();
    }

    renderedConstellationsRef.current = visibleConstellations;

    if (filters.gridHorizontal) {
      for (let az = 0; az < 360; az += 30) {
        const azNodes = [];
        for (let alt = 0; alt <= 90; alt += 3)
          azNodes.push({ baseAlt: alt, baseAz: az });
        drawProjectedPath(
          azNodes,
          "rgba(56, 189, 248, 0.15)",
          1 * zoomScale,
          [2, 4],
        );
      }
      for (let alt = 15; alt <= 75; alt += 15) {
        const altNodes = [];
        for (let az = 0; az <= 360; az += 3)
          altNodes.push({ baseAlt: alt, baseAz: az % 360 });
        drawProjectedPath(
          altNodes,
          "rgba(56, 189, 248, 0.2)",
          1 * zoomScale,
          [2, 4],
        );
      }
    }

    if (filters.gridEquatorial) {
      const { raLines, decLines, equatorNodes } = equatorialGridNodes;
      for (const line of raLines)
        drawProjectedPath(
          line,
          "rgba(245, 158, 11, 0.18)",
          1 * zoomScale,
          [3, 5],
        );
      for (const line of decLines)
        drawProjectedPath(
          line,
          "rgba(245, 158, 11, 0.18)",
          1 * zoomScale,
          [3, 5],
        );
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

    context.setLineDash([]);
    const MAG_LIMIT_BASE = filters.faintStars ? MAX_MAG : 3.5;
    let adjustedMagLimit = MAG_LIMIT_BASE;
    if (currentZoomLevel > 3.0)
      adjustedMagLimit += (currentZoomLevel - 3.0) * 0.5;
    const CURRENT_MAG_LIMIT =
      adjustedMagLimit - dayIntensity * (adjustedMagLimit + 2);

    for (const star of visibleStars.values()) {
      if (!star.isPlanet) {
        if (star.mag > CURRENT_MAG_LIMIT) continue;
        const normalizedMagnitude = Math.max(0, (MAX_MAG - star.mag) / MAX_MAG);
        // Gunakan uiScale agar bintang tidak menutupi layar saat zoom dalam
        const radiusPx =
          Math.max(
            isMobile ? 0.6 : 0.4,
            normalizedMagnitude * (isMobile ? 3.0 : 2.6) + 0.2,
          ) * uiScale;
        const starColor = getStarColor(star.bv);
        context.globalAlpha = Math.min(
          1,
          Math.max(0.1, (adjustedMagLimit - star.mag) / 5.5),
        );
        context.fillStyle = starColor;
        context.beginPath();
        context.arc(star.x, star.y, radiusPx, 0, Math.PI * 2);
        context.fill();
        continue;
      }

      const isSatellite = Boolean((star as any).parent) && star.name !== "Luna";
      const satelliteLayout = satelliteLayouts.get(star.id);

      // Gunakan koordinat dari layout offset jika tersedia, jika tidak pakai koordinat asli
      const renderX = satelliteLayout?.x ?? star.x;
      const renderY = satelliteLayout?.y ?? star.y;

      context.globalAlpha = 1;
      // Radius planet membesar sesuai zoom fisik (planetScale), bukan uiScale
      const radiusPx = (star.radiusPx || 4) * planetScale;

      // Gambar Leader Line untuk Satelit
      if (isSatellite && satelliteLayout) {
        context.save();
        context.globalAlpha = 0.3;
        context.strokeStyle = "rgba(255, 255, 255, 0.5)";
        context.lineWidth = 0.5 * uiScale;
        context.beginPath();
        context.moveTo(satelliteLayout.leaderX1, satelliteLayout.leaderY1);
        context.lineTo(satelliteLayout.leaderX2, satelliteLayout.leaderY2);
        context.stroke();
        context.restore();
      }

      if (star.id === 0) {
        // Rendering Matahari tetap sama menggunakan renderX, renderY
        context.shadowBlur = 50 * uiScale;
        context.shadowColor = "#f59e0b";
        context.fillStyle = "rgba(251, 191, 36, 0.4)";
        context.beginPath();
        context.arc(renderX, renderY, radiusPx * 4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#fffbeb";
        context.beginPath();
        context.arc(renderX, renderY, radiusPx * 1.5, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;
      } else {
        const drawRadius = isMobile ? radiusPx * 1.2 : radiusPx;
        context.shadowBlur = (isSatellite ? 7 : 15) * uiScale;
        context.shadowColor = star.colorStr || "#ffffff";
        context.fillStyle = star.colorStr || "#ffffff";
        context.beginPath();
        context.arc(renderX, renderY, drawRadius, 0, Math.PI * 2);
        context.fill();
        context.shadowBlur = 0;

        // Label Nama (Hanya muncul jika zoom cukup atau sedang di-track)
        if (!isSatellite && (currentZoomLevel > 3.0 || star.id === 0)) {
          // Hanya gambar label jika BUKAN satelit
          const labelX = renderX;
          const labelY = renderY + drawRadius + 12 * uiScale;

          context.save();
          context.font = `${10 * uiScale}px monospace`;
          context.textAlign = "center";
          context.fillStyle = "white";
          context.shadowBlur = 4;
          context.shadowColor = "black";
          context.fillText(star.name || "", labelX, labelY);
          context.restore();
        }
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
        } else context.lineTo(p.x, p.y);
      } else firstLine = true;
    }
    context.stroke();
    context.setLineDash([]);
    context.textAlign = "center";
    context.fillStyle = "rgba(56, 189, 248, 0.8)";
    context.font = `bold ${isMobile ? 10 * zoomScale : 12 * zoomScale}px 'Courier New', monospace`;

    for (const point of CARDINAL_POINTS) {
      const p = proj(0, point.az);
      if (p && p.visible)
        context.fillText(point.label, p.x, p.y + 16 * zoomScale);
    }

    if (activeTarget) {
      const isConstellationTarget = typeof activeTarget.id === "string";
      if (isConstellationTarget) {
        const tCon = projectedConstellations.find(
          (c) => c.id === activeTarget.id,
        );
        if (tCon && tCon.lines && tCon.lines.length > 0) {
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity,
            hasVisibleNodes = false;
          for (const segment of tCon.lines) {
            for (const node of segment) {
              if (node.baseAlt > -5) {
                const p = proj(node.baseAlt, node.baseAz);
                if (p && p.visible) {
                  hasVisibleNodes = true;
                  if (p.x < minX) minX = p.x;
                  if (p.x > maxX) maxX = p.x;
                  if (p.y < minY) minY = p.y;
                  if (p.y > maxY) maxY = p.y;
                }
              }
            }
          }
          if (hasVisibleNodes) {
            const padding = 35 * zoomScale;
            minX -= padding;
            maxX += padding;
            minY -= padding;
            maxY += padding;
            const timePulsing = (Math.sin(Date.now() / 300) + 1) / 2;
            const bracketLen = 30 * zoomScale;
            const strokeColor = `rgba(34, 197, 94, ${0.4 + timePulsing * 0.5})`;
            context.save();
            context.strokeStyle = strokeColor;
            context.lineWidth = 2.0;
            context.shadowBlur = 8;
            context.shadowColor = "rgba(34, 197, 94, 0.8)";
            context.beginPath();
            context.moveTo(minX, minY + bracketLen);
            context.lineTo(minX, minY);
            context.lineTo(minX + bracketLen, minY);
            context.moveTo(maxX - bracketLen, minY);
            context.lineTo(maxX, minY);
            context.lineTo(maxX, minY + bracketLen);
            context.moveTo(maxX, maxY - bracketLen);
            context.lineTo(maxX, maxY);
            context.lineTo(maxX - bracketLen, maxY);
            context.moveTo(minX + bracketLen, maxY);
            context.lineTo(minX, maxY);
            context.lineTo(minX, maxY - bracketLen);
            context.stroke();
            context.restore();
          }
        }
      } else {
        const tStar = visibleStars.get(activeTarget.id);
        if (tStar) {
          const timeOff = Date.now() / 400;
          context.save();
          context.translate(tStar.x, tStar.y);
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
    equatorialGridNodes,
    projectedConstellations,
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
        updateZoomLevel(() => initialZoom.current * scale);
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
          if (activeTarget) onClearTarget();
        }
        setViewAngle((prev) => ({
          az: normalizeAzimuth(prev.az - deltaX * sensitivity),
          alt: clamp(prev.alt + deltaY * sensitivity, -90, 90),
        }));
        return;
      }
    },
    [isMobile, updateZoomLevel, activeTarget, onClearTarget],
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
    },
    [zoomLevelRef],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const target = event.currentTarget;
      try {
        if (target.hasPointerCapture(event.pointerId))
          target.releasePointerCapture(event.pointerId);
      } catch {}
      const wasClick =
        activePointers.current.size === 1 &&
        !didPointerMoveRef.current &&
        pointerDownRef.current !== null;
      activePointers.current.delete(event.pointerId);
      if (activePointers.current.size < 2) initialPinchDist.current = null;
      if (activePointers.current.size === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
      } else if (activePointers.current.size === 1) {
        const remaining = Array.from(activePointers.current.values())[0];
        lastPointerRef.current = { x: remaining.x, y: remaining.y };
        isDraggingRef.current = true;
        setIsDragging(true);
      }
      if (wasClick) selectObjectAtPoint(event.clientX, event.clientY);
      pointerDownRef.current = null;
      didPointerMoveRef.current = false;
    },
    [selectObjectAtPoint],
  );

  const handlePointerCancelOrLeave = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      try {
        const target = event.currentTarget;
        if (target.hasPointerCapture(event.pointerId))
          target.releasePointerCapture(event.pointerId);
      } catch {}
      activePointers.current.delete(event.pointerId);
      if (activePointers.current.size < 2) initialPinchDist.current = null;
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
