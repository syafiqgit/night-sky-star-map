"use client";

import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { useGesture } from "@use-gesture/react";
import {
  Application,
  Container,
  Sprite,
  Graphics,
  Texture,
  ParticleContainer,
  Particle,
  Assets,
} from "pixi.js";
import * as satellite from "satellite.js";
import { geoPath, geoStereographic } from "d3-geo";
import chroma from "chroma-js";
import { equatorialToHorizontal } from "@/lib/astro/coordinates";
import { getSolarSystemObjects } from "@/lib/astro/ephemeris";
import {
  Equator,
  Ecliptic,
  GeoVector,
  MakeTime,
  Observer as AstroObserver,
} from "astronomy-engine";

/* ---------------------------------------------------------------- */
/* DSO Image / Texture Cache                                        */
/* ---------------------------------------------------------------- */

const dsoImageCache = new Map<string, HTMLImageElement>();
const dsoTextureCache = new Map<string, Texture>();
const dsoTextureLoading = new Set<string>();

function getCachedImage(url: string): HTMLImageElement | null {
  if (dsoImageCache.has(url)) return dsoImageCache.get(url)!;
  const img = new Image();
  img.src = url;
  img.crossOrigin = "anonymous";
  img.onload = () => dsoImageCache.set(url, img);
  return null;
}

function getCachedTexture(url: string): void {
  if (dsoTextureCache.has(url) || dsoTextureLoading.has(url)) return;
  dsoTextureLoading.add(url);
  Assets.load<Texture>(url)
    .then((tex) => {
      dsoTextureCache.set(url, tex);
      dsoTextureLoading.delete(url);
    })
    .catch(() => {
      dsoTextureLoading.delete(url);
    });
}

/* ---------------------------------------------------------------- */
/* Types (identical to original)                                    */
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
  phase?: number;
  phaseAngle?: number;
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
/* Constants (identical to original)                                */
/* ---------------------------------------------------------------- */

const MAX_MAG_BASE = 6.5;
const BRIGHT_MAG_LIMIT = -1.5; // brightest star (Sirius ≈ -1.46)
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
/* Chroma-js Star Color Scale (identical to original)              */
/* ---------------------------------------------------------------- */

const starColorScale = chroma
  .scale(["#e0f2fe", "#ffffff", "#fef08a", "#fed7aa", "#fca5a5"])
  .domain([-0.2, 0.2, 0.7, 1.2, 1.8])
  .mode("lab");

function getStarColor(bv?: number): string {
  if (bv === undefined) return "#ffffff";
  return starColorScale(clamp(bv, -0.2, 1.8)).hex();
}

/* ---------------------------------------------------------------- */
/* Helpers (identical to original)                                  */
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
/* PixiJS Helpers                                                   */
/* ---------------------------------------------------------------- */

/** Convert hex color string to PixiJS tint number */
function hexToPixiColor(hex: string): number {
  const m = hex.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
  const raw = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return parseInt(raw, 16);
}

/** Generate a soft radial-gradient star texture (shared by all star particles) */
function generateStarTexture(): HTMLCanvasElement {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.4)");
  grad.addColorStop(0.85, "rgba(255,255,255,0.1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/* ---------------------------------------------------------------- */
/* Offscreen Canvas Layer Renderer                                  */
/*                                                                  */
/* Renders everything that uses d3-geo paths or Canvas 2D gradients */
/* into an HTMLCanvasElement, which is then uploaded to the GPU as  */
/* a PixiJS Texture every frame.                                    */
/* ---------------------------------------------------------------- */

interface OffscreenLayerParams {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  // View state
  viewAz: number;
  viewAlt: number;
  zoomLevel: number;
  currentScale: number;
  geoProj: ReturnType<typeof geoStereographic>;
  proj: (
    bAlt: number,
    bAz: number,
  ) => { x: number; y: number; visible: boolean } | null;
  // Scene data
  filters: StarCanvasProps["filters"];
  isMobile: boolean;
  now: number;
  dayIntensity: number;
  trueSunAlt: number;
  eclipseFactor: number;
  pSun: { x: number; y: number; visible: boolean } | null;
  pMoon: { x: number; y: number; visible: boolean } | null;
  sunRadiusPx: number;
  moonRadiusPx: number;
  projectedMilkyWay: Array<{
    baseAlt: number;
    baseAz: number;
    size: number;
    alpha: number;
  }>;
  constellationGeoJSONs: any[];
  equatorialGridNodes: {
    raLines: Array<Array<{ baseAlt: number; baseAz: number }>>;
    decLines: Array<Array<{ baseAlt: number; baseAz: number }>>;
    equatorNodes: Array<{ baseAlt: number; baseAz: number }>;
    eclipticNodes: Array<{ baseAlt: number; baseAz: number }>;
  };
  zoomScale: number;
  uiScale: number;
  // Active target (point object reticle only — constellation highlight done separately)
  activeTargetPos: { x: number; y: number } | null;
  activeTargetIsConstellation: boolean;
  activeTargetId: any | null;
  visibleConstellations: Map<string, any>;
  // FOV
  cx: number;
  cy: number;
  pixelsPerDegree: number;
}

function renderOffscreenLayer(p: OffscreenLayerParams): void {
  const ctx = p.canvas.getContext("2d");
  if (!ctx) return;

  const {
    width,
    height,
    cx,
    cy,
    filters,
    isMobile,
    now,
    dayIntensity,
    trueSunAlt,
    eclipseFactor,
    pSun,
    projectedMilkyWay,
    constellationGeoJSONs,
    equatorialGridNodes,
    zoomScale,
    uiScale,
    geoProj,
    proj,
    activeTargetPos,
    activeTargetIsConstellation,
    activeTargetId,
    pixelsPerDegree,
    zoomLevel,
  } = p;

  // Rebuild pathGenerator bound to THIS canvas context so d3-geo draws correctly
  const pathGenerator = geoPath(geoProj, ctx);

  ctx.save();

  /* ── Background ──────────────────────────────────────────────── */
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

  /* ── Daytime atmosphere ───────────────────────────────────────── */
  if (dayIntensity > 0) {
    ctx.globalAlpha = dayIntensity * 0.6;
    ctx.fillStyle = "#0ea5e9";
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  /* ── Twilight / sunset glow ──────────────────────────────────── */
  if (filters.atmosphere && pSun && trueSunAlt > -18 && trueSunAlt < 10) {
    const ti =
      trueSunAlt <= 0
        ? (trueSunAlt + 18) / 18
        : Math.max(0, 1 - trueSunAlt / 10);
    const effectiveTi = ti * (1 - eclipseFactor * 0.85);
    if (effectiveTi > 0) {
      ctx.globalAlpha = effectiveTi;
      const gr = Math.min(300, Math.max(width, height) * 0.4 * zoomLevel);
      const tg = ctx.createRadialGradient(
        pSun.x,
        pSun.y,
        0,
        pSun.x,
        pSun.y,
        gr,
      );
      tg.addColorStop(0, "rgba(249,115,22,0.95)");
      tg.addColorStop(0.25, "rgba(225,29,72,0.6)");
      tg.addColorStop(0.6, "rgba(76,29,149,0.2)");
      tg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.arc(pSun.x, pSun.y, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ── Nighttime atmosphere (screen blend) ─────────────────────── */
  const bortle = filters.bortleScale || 1;
  if (filters.atmosphere && trueSunAlt < -4) {
    const ns = clamp((-trueSunAlt - 4) / 18, 0, 1);
    if (ns > 0.04) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const hr = Math.max(width, height) * (0.95 + zoomLevel * 0.08);
      const gx = cx + Math.cos((p.viewAz * Math.PI) / 180) * width * 0.08;
      const gy =
        cy - Math.sin(((p.viewAlt - 12) * Math.PI) / 180) * height * 0.08;

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
        pg.addColorStop(0, `rgba(251,146,60,${glowOpacity})`);
        pg.addColorStop(0.5, `rgba(148,163,184,${glowOpacity * 0.3})`);
        pg.addColorStop(1, "rgba(0,0,0,0)");
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
    }
  }

  /* ── Milky Way dust ──────────────────────────────────────────── */
  if (dayIntensity < 0.8) {
    const mwBortleFactor = clamp(1 - (bortle - 1) / 7, 0, 1);
    ctx.globalAlpha = (1 - dayIntensity) * mwBortleFactor;
    for (const cloud of projectedMilkyWay) {
      if (isNaN(cloud.baseAlt)) continue;
      const pp = proj(cloud.baseAlt, cloud.baseAz);
      if (!pp?.visible) continue;
      const r = cloud.size * zoomScale;
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(pp.x, pp.y, 0, pp.x, pp.y, r);
      g.addColorStop(0, `rgba(147,197,253,${cloud.alpha})`);
      g.addColorStop(0.5, `rgba(167,139,250,${cloud.alpha * 0.4})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── Constellation lines (d3-geo geoPath) ────────────────────── */
  if (
    filters.constellations &&
    dayIntensity < 0.9 &&
    constellationGeoJSONs.length > 0
  ) {
    ctx.save();
    ctx.globalAlpha = 1 - dayIntensity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const DOR = (isMobile ? 2.5 : 3.5) * zoomScale;
    const DIR = (isMobile ? 1.2 : 1.8) * zoomScale;
    const DGB = (isMobile ? 6 : 10) * zoomScale;

    for (const conObj of constellationGeoJSONs) {
      const isAct = activeTargetId === conObj.id;
      const LC = isAct ? "rgba(34,197,94,0.95)" : "rgba(125,211,252,0.75)";
      const LW =
        (isAct ? (isMobile ? 1.5 : 2.0) : isMobile ? 0.9 : 1.3) * zoomScale;
      const GC = isAct ? "rgba(34,197,94,0.3)" : "rgba(125,211,252,0.2)";
      const GW =
        (isAct ? (isMobile ? 5.0 : 8.0) : isMobile ? 3.5 : 5.5) * zoomScale;

      if (conObj.geoBoundaries) {
        ctx.save();
        ctx.strokeStyle = "rgba(153,27,27,0.4)";
        ctx.lineWidth = 1.2 * zoomScale;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        pathGenerator(conObj.geoBoundaries);
        ctx.stroke();
        ctx.restore();
      }

      ctx.globalCompositeOperation = "screen";
      ctx.strokeStyle = GC;
      ctx.lineWidth = GW;
      ctx.beginPath();
      pathGenerator(conObj.geoLines);
      ctx.stroke();

      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = LC;
      ctx.lineWidth = LW;
      ctx.beginPath();
      pathGenerator(conObj.geoLines);
      ctx.stroke();

      // Node dots at constellation line vertices
      const nodeSet = new Map<string, { x: number; y: number }>();
      conObj.geoLines.geometry.coordinates.forEach((line: any[]) => {
        line.forEach((coord) => {
          const pt = geoProj(coord as [number, number]);
          if (pt) {
            const k = `${Math.round(pt[0])},${Math.round(pt[1])}`;
            if (!nodeSet.has(k)) nodeSet.set(k, { x: pt[0], y: pt[1] });
          }
        });
      });

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

      // Constellation label
      if (conObj.name) {
        const centerPt = geoProj([conObj.centerAz, conObj.centerAlt]);
        if (centerPt) {
          ctx.font = `bold ${(isMobile ? 8 : 10) * zoomScale}px 'Courier New',monospace`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.fillStyle = isAct
            ? "rgba(74,222,128,0.95)"
            : "rgba(148,163,184,0.75)";
          ctx.textAlign = "center";
          ctx.fillText(conObj.name.toUpperCase(), centerPt[0], centerPt[1]);
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();
  }

  /* ── Grid helpers ────────────────────────────────────────────── */
  const drawGeoLineString = (
    nodes: Array<{ baseAlt: number; baseAz: number }>,
    color: string,
    lineWidth: number,
    dashPattern: number[] = [],
  ) => {
    const geo: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: nodes.map((n) => [n.baseAz, n.baseAlt]),
      },
    };
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash(dashPattern);
    ctx.beginPath();
    pathGenerator(geo);
    ctx.stroke();
    ctx.restore();
  };

  /* ── Horizontal grid ─────────────────────────────────────────── */
  if (filters.gridHorizontal) {
    for (let az = 0; az < 360; az += 30) {
      const ns = [];
      for (let a = 0; a <= 90; a += 3) ns.push({ baseAlt: a, baseAz: az });
      drawGeoLineString(ns, "rgba(56,189,248,0.15)", 1 * zoomScale, [2, 4]);
    }
    for (let a = 15; a <= 75; a += 15) {
      const ns = [];
      for (let az = 0; az <= 360; az += 3)
        ns.push({ baseAlt: a, baseAz: az % 360 });
      drawGeoLineString(ns, "rgba(56,189,248,0.2)", 1 * zoomScale, [2, 4]);
    }
  }

  /* ── Equatorial grid ─────────────────────────────────────────── */
  if (filters.gridEquatorial) {
    const { raLines, decLines, equatorNodes, eclipticNodes } =
      equatorialGridNodes;
    for (const ln of raLines)
      drawGeoLineString(ln, "rgba(245,158,11,0.18)", 1 * zoomScale, [3, 5]);
    for (const ln of decLines)
      drawGeoLineString(ln, "rgba(245,158,11,0.18)", 1 * zoomScale, [3, 5]);

    if (equatorNodes.length) {
      ctx.save();
      ctx.shadowBlur = 6 * zoomScale;
      ctx.shadowColor = "rgba(245,158,11,0.8)";
      drawGeoLineString(
        equatorNodes,
        "rgba(245,158,11,0.6)",
        1.5 * zoomScale,
        [],
      );
      ctx.restore();
    }
    if (eclipticNodes.length) {
      ctx.save();
      ctx.shadowBlur = 8 * zoomScale;
      ctx.shadowColor = "rgba(234,179,8,0.9)";
      drawGeoLineString(
        eclipticNodes,
        "rgba(250,204,21,0.75)",
        1.8 * zoomScale,
        [8 * zoomScale, 4 * zoomScale],
      );
      const midNode = eclipticNodes[Math.floor(eclipticNodes.length / 2)];
      if (midNode) {
        const pp = proj(midNode.baseAlt, midNode.baseAz);
        if (pp?.visible) {
          ctx.fillStyle = "#facc15";
          ctx.font = `bold ${10 * zoomScale}px monospace`;
          ctx.fillText("ECLIPTIC", pp.x, pp.y - 10 * zoomScale);
        }
      }
      ctx.restore();
    }
  }

  ctx.setLineDash([]);

  /* ── Horizon line ────────────────────────────────────────────── */
  drawGeoLineString(
    Array.from({ length: 181 }, (_, i) => ({ baseAlt: 0, baseAz: i * 2 })),
    "rgba(56,189,248,0.3)",
    1.5 * zoomScale,
    [4 * zoomScale, 6 * zoomScale],
  );
  ctx.setLineDash([]);

  /* ── Cardinal labels ─────────────────────────────────────────── */
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(56,189,248,0.8)";
  ctx.font = `bold ${isMobile ? 10 * zoomScale : 12 * zoomScale}px 'Courier New',monospace`;
  for (const pt of CARDINAL_POINTS) {
    const pp = proj(0, pt.az);
    if (pp?.visible) ctx.fillText(pt.label, pp.x, pp.y + 16 * zoomScale);
  }

  /* ── FOV overlay ─────────────────────────────────────────────── */
  const fovConfig = filters.fovConfig;
  if (fovConfig?.enabled) {
    const {
      type,
      focalLength,
      sensorWidth,
      sensorHeight,
      eyepieceFocalLength = 25,
      eyepieceAfov = 52,
      color = "rgba(239,68,68,0.85)",
      rotation = 0,
    } = fovConfig;

    ctx.save();
    ctx.translate(cx, cy);
    const fovBaseColor = chroma(color);
    ctx.strokeStyle = fovBaseColor.css();
    ctx.lineWidth = 1.8 * zoomScale;
    ctx.shadowBlur = 8;
    ctx.shadowColor = fovBaseColor.css();

    if (type === "sensor" && focalLength > 0) {
      const fovWDeg = (sensorWidth / focalLength) * (180 / Math.PI);
      const fovHDeg = (sensorHeight / focalLength) * (180 / Math.PI);
      const fovWPx = fovWDeg * pixelsPerDegree;
      const fovHPx = fovHDeg * pixelsPerDegree;
      if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
      ctx.strokeRect(-fovWPx / 2, -fovHPx / 2, fovWPx, fovHPx);
      ctx.save();
      ctx.strokeStyle = fovBaseColor.alpha(0.3).css();
      ctx.lineWidth = 1;
      ctx.setLineDash([4 * zoomScale, 4 * zoomScale]);
      ctx.beginPath();
      ctx.moveTo(-fovWPx / 2, 0);
      ctx.lineTo(fovWPx / 2, 0);
      ctx.moveTo(0, -fovHPx / 2);
      ctx.lineTo(0, fovHPx / 2);
      ctx.stroke();
      ctx.restore();
      if (zoomLevel > 1.2) {
        ctx.fillStyle = fovBaseColor.css();
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
      const radiusPx2 = (trueFovDeg / 2) * pixelsPerDegree;
      ctx.beginPath();
      ctx.arc(0, 0, radiusPx2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.save();
      ctx.strokeStyle = fovBaseColor.alpha(0.25).css();
      ctx.lineWidth = 1;
      ctx.setLineDash([3 * zoomScale, 3 * zoomScale]);
      ctx.beginPath();
      ctx.arc(0, 0, radiusPx2 * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (zoomLevel > 1.2) {
        ctx.fillStyle = fovBaseColor.css();
        ctx.font = `bold ${10 * uiScale}px monospace`;
        ctx.textAlign = "center";
        ctx.shadowBlur = 4;
        ctx.shadowColor = "black";
        ctx.fillText(
          `FOV: ${trueFovDeg.toFixed(2)}° (${magnification.toFixed(0)}x)`,
          0,
          -radiusPx2 - 8 * uiScale,
        );
      }
    }
    ctx.restore();
  }

  /* ── Active target reticle (point object) ────────────────────── */
  if (activeTargetPos && !activeTargetIsConstellation) {
    const { x: tx, y: ty } = activeTargetPos;
    const tOff = now / 400;
    ctx.save();
    ctx.translate(tx, ty);
    const cl = 35 * zoomScale,
      ig = 15 * zoomScale;
    // Determine reticle color based on object type (we use green as default here;
    // the PixiJS layer overrides with object-type-specific color in Graphics)
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(34,197,94,0.6)";
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
    ctx.strokeStyle = "rgba(34,197,94,0.9)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, 24 * zoomScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/* ---------------------------------------------------------------- */
/* Main Component                                                   */
/* ---------------------------------------------------------------- */

export default function StarCanvasPixi({
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
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const offCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offTextureRef = useRef<Texture | null>(null);
  const offSpriteRef = useRef<Sprite | null>(null);
  const starPcRef = useRef<ParticleContainer | null>(null);
  const objContRef = useRef<Container | null>(null);
  const starParticlesRef = useRef<Map<number, Particle>>(new Map());
  const starTexRef = useRef<Texture | null>(null);
  const pixiInitRef = useRef(false);

  // Rendered object maps for raycasting (mirrors original renderedStarsRef etc.)
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
  const prevLocationRef = useRef({ lat: observer.lat, lon: observer.lon });

  const onZoomChangeRef = useRef(onZoomChange);
  const onSelectTargetRef = useRef(onSelectTarget);
  const onClearTargetRef = useRef(onClearTarget);
  const onStarHoverRef = useRef(onStarHover);

  // Refs for all props/memos consumed inside the ticker closure
  // Without these, the ticker sees stale values from mount time only.
  const filtersRef = useRef(filters);
  const baseStarsRef = useRef<any[]>([]);
  const basePlanetsRef = useRef<any[]>([]);
  const baseDsosRef = useRef<any[]>([]);
  const baseMinorBodiesRef = useRef<any[]>([]);
  const baseSatellitesRef = useRef<any[]>([]);
  const baseMeteorShowersRef = useRef<any[]>([]);
  const projectedMilkyWayRef = useRef<any[]>([]);
  const constellationGeoJSONsRef = useRef<any[]>([]);
  const equatorialGridNodesRef = useRef<any>({
    raLines: [],
    decLines: [],
    equatorNodes: [],
    eclipticNodes: [],
  });

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
    onSelectTargetRef.current = onSelectTarget;
    onClearTargetRef.current = onClearTarget;
    onStarHoverRef.current = onStarHover;
  }, [onZoomChange, onSelectTarget, onClearTarget, onStarHover]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

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
      height: 0,
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
    const ephemerisList = getSolarSystemObjects(time, solarSystem, {
      lat: safeObserver.lat,
      lon: safeObserver.lon,
    });

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
          // Fallback: compute Moon position directly via astronomy-engine
          // instead of the old manual phase-angle approximation.
          try {
            const astroTime = MakeTime(time);
            const moonEq = Equator(
              "Moon" as any,
              astroTime,
              new AstroObserver(safeObserver.lat, safeObserver.lon, 0),
              true,
              true,
            );
            raVal = moonEq.ra * 15; // hours → degrees
            decVal = moonEq.dec;
          } catch {
            // absolute last resort — place near ecliptic
            raVal = 0;
            decVal = 0;
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
          phase: planet.phase,
          phaseAngle: planet.phaseAngle,
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

  const cachedSatRecs = useMemo(() => {
    if (!satellites || !satellites.length) return [];
    return satellites.map((sat) => {
      try {
        const t1 = sat.tle1?.trim();
        const t2 = sat.tle2?.trim();
        if (t1 && t2) {
          const satrec = satellite.twoline2satrec(t1, t2);
          return { sat, satrec };
        }
      } catch (e) {}
      return { sat, satrec: null };
    });
  }, [satellites]);

  const baseSatellites = useMemo(() => {
    if (!filters.satellites || !cachedSatRecs.length) return [];
    const observerGd = {
      longitude: observer.lon * (Math.PI / 180),
      latitude: observer.lat * (Math.PI / 180),
      height: 0.05,
    };
    const gmst = satellite.gstime(time);
    return cachedSatRecs.map(({ sat, satrec }) => {
      if (!satrec) return { ...sat, baseAlt: -999, baseAz: 0 };
      try {
        const pv = satellite.propagate(satrec, time);
        if (pv && typeof pv.position === "object" && pv.position !== null) {
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
  }, [filters.satellites, cachedSatRecs, observer.lat, observer.lon, time]);

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

  const constellationGeoJSONs = useMemo(() => {
    if (!filters.constellations || !constellations.length) return [];
    return constellations.map((con) => {
      const geoLines: GeoJSON.Feature<GeoJSON.MultiLineString> = {
        type: "Feature",
        properties: { id: con.id, name: con.name, type: "lines" },
        geometry: {
          type: "MultiLineString",
          coordinates:
            con.lines?.map((segment) =>
              segment.map((pt) => {
                const { altitude, azimuth } = equatorialToHorizontal(
                  { ra: pt[0], dec: pt[1] },
                  safeObserver as any,
                  time,
                );
                return [azimuth, altitude];
              }),
            ) ?? [],
        },
      };

      const geoBoundaries: GeoJSON.Feature<GeoJSON.MultiPolygon> | null =
        con.boundaries && con.boundaries.length > 0
          ? {
              type: "Feature",
              properties: { id: con.id, name: con.name, type: "boundary" },
              geometry: {
                type: "MultiPolygon",
                coordinates: con.boundaries.map((poly) => [
                  poly.map((pt) => {
                    const { altitude, azimuth } = equatorialToHorizontal(
                      { ra: pt[0], dec: pt[1] },
                      safeObserver as any,
                      time,
                    );
                    return [azimuth, altitude];
                  }),
                ]),
              },
            }
          : null;

      const { altitude: cAlt, azimuth: cAz } = equatorialToHorizontal(
        { ra: con.center[0], dec: con.center[1] },
        safeObserver as any,
        time,
      );

      return {
        id: con.id,
        name: con.name,
        centerAlt: cAlt,
        centerAz: cAz,
        geoLines,
        geoBoundaries,
        center: { baseAlt: cAlt, baseAz: cAz },
        lines:
          con.lines?.map((seg) =>
            seg.map((pt) => {
              const { altitude, azimuth } = equatorialToHorizontal(
                { ra: pt[0], dec: pt[1] },
                safeObserver as any,
                time,
              );
              return { baseAlt: altitude, baseAz: azimuth };
            }),
          ) ?? [],
      };
    });
  }, [filters.constellations, constellations, safeObserver, time]);

  const projectedConstellations = useMemo(
    () =>
      constellationGeoJSONs.map((c) => ({
        id: c.id,
        name: c.name,
        center: c.center,
        lines: c.lines,
      })),
    [constellationGeoJSONs],
  );

  useEffect(() => {
    projectedConstellationsRef.current = projectedConstellations;
  }, [projectedConstellations]);

  const equatorialGridNodes = useMemo(() => {
    if (!filters.gridEquatorial)
      return { raLines: [], decLines: [], equatorNodes: [], eclipticNodes: [] };

    const raLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const decLines: Array<Array<{ baseAlt: number; baseAz: number }>> = [];
    const equatorNodes: Array<{ baseAlt: number; baseAz: number }> = [];
    const eclipticNodes: Array<{ baseAlt: number; baseAz: number }> = [];

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

    // Derive true obliquity of the ecliptic from astronomy-engine.
    // Strategy: Sun always lies on the ecliptic (elat≈0). Its geocentric
    // RA/Dec and ecliptic longitude satisfy: sin(dec) = sin(obl)*sin(elon).
    // Solving for obl gives the true obliquity — accurate to <1 arcsec.
    // Guard: formula is singular when elon≈0°/180° (equinox), so fall back
    // to the IAU 2006 linear approximation in that case.
    let obliquityRad = (23.4393 * Math.PI) / 180; // IAU 2006 fallback (J2000)
    try {
      const astroTime = MakeTime(time);
      const sunVec = GeoVector("Sun" as any, astroTime, false);
      const sunEcl = Ecliptic(sunVec); // elon in degrees
      const sunEq = Equator(
        "Sun" as any,
        astroTime,
        new AstroObserver(safeObserver.lat, safeObserver.lon, 0),
        false,
        true,
      );
      const elonRad = (sunEcl.elon * Math.PI) / 180;
      const decRad = (sunEq.dec * Math.PI) / 180;
      if (Math.abs(Math.sin(elonRad)) > 0.15) {
        // avoid equinox singularity
        const sinObl = Math.sin(decRad) / Math.sin(elonRad);
        if (Math.abs(sinObl) <= 1) obliquityRad = Math.asin(sinObl);
      }
    } catch {
      /* keep IAU fallback */
    }

    // Sample ecliptic plane at 3° intervals and project to alt/az.
    // Rotation: ecliptic lon → equatorial (RA, Dec) via standard formula.
    for (let lon = 0; lon <= 360; lon += 3) {
      const lonRad = (lon * Math.PI) / 180;
      const sinDec = Math.sin(obliquityRad) * Math.sin(lonRad);
      const dec = (Math.asin(sinDec) * 180) / Math.PI;
      let ra =
        (Math.atan2(
          Math.cos(obliquityRad) * Math.sin(lonRad),
          Math.cos(lonRad),
        ) *
          180) /
        Math.PI;
      if (ra < 0) ra += 360;
      const { altitude, azimuth } = equatorialToHorizontal(
        { ra, dec },
        safeObserver as any,
        time,
      );
      eclipticNodes.push({ baseAlt: altitude, baseAz: azimuth });
    }

    return { raLines, decLines, equatorNodes, eclipticNodes };
  }, [filters.gridEquatorial, safeObserver, time]);

  // latestObjectsRef — same as original
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

  // Keep ticker refs in sync with latest memo/prop values.
  // The ticker closure captures these refs at mount time — updating .current
  // is the only way to pass fresh data into a running ticker without
  // tearing it down and rebuilding it every render.
  useEffect(() => {
    baseStarsRef.current = baseStars;
  }, [baseStars]);
  useEffect(() => {
    basePlanetsRef.current = basePlanets;
  }, [basePlanets]);
  useEffect(() => {
    baseDsosRef.current = baseDsos;
  }, [baseDsos]);
  useEffect(() => {
    baseMinorBodiesRef.current = baseMinorBodies;
  }, [baseMinorBodies]);
  useEffect(() => {
    baseSatellitesRef.current = baseSatellites;
  }, [baseSatellites]);
  useEffect(() => {
    baseMeteorShowersRef.current = baseMeteorShowers;
  }, [baseMeteorShowers]);
  useEffect(() => {
    projectedMilkyWayRef.current = projectedMilkyWay;
  }, [projectedMilkyWay]);
  useEffect(() => {
    constellationGeoJSONsRef.current = constellationGeoJSONs;
  }, [constellationGeoJSONs]);
  useEffect(() => {
    equatorialGridNodesRef.current = equatorialGridNodes;
  }, [equatorialGridNodes]);

  /* ============================================================== */
  /* PixiJS Application lifecycle + main animation ticker           */
  /* ============================================================== */
  useEffect(() => {
    if (!containerRef.current || pixiInitRef.current) return;
    pixiInitRef.current = true;
    let destroyed = false;

    (async () => {
      const el = containerRef.current!;
      const rectW = el.clientWidth || 800;
      const rectH = el.clientHeight || 600;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        isMobile ? MOBILE_DPR : DESKTOP_DPR,
      );

      const app = new Application();
      await app.init({
        width: rectW,
        height: rectH,
        background: 0x030712,
        antialias: true,
        resolution: dpr,
        autoDensity: true,
      });
      if (destroyed) {
        app.destroy(true);
        return;
      }
      appRef.current = app;

      const canvas = app.canvas as HTMLCanvasElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      el.appendChild(canvas);

      // Offscreen canvas for d3-geo layer
      const offCanvas = document.createElement("canvas");
      offCanvas.width = rectW;
      offCanvas.height = rectH;
      offCanvasRef.current = offCanvas;

      const offTex = Texture.from(offCanvas);
      offTextureRef.current = offTex;

      const offSprite = new Sprite(offTex);
      offSprite.width = rectW;
      offSprite.height = rectH;
      offSpriteRef.current = offSprite;
      app.stage.addChild(offSprite);

      // Star texture (shared)
      const starCanvas = generateStarTexture();
      const starTex = Texture.from(starCanvas);
      starTexRef.current = starTex;

      // ParticleContainer for stars
      // PixiJS v8: ParticleContainer constructor accepts options object
      const starPc = new ParticleContainer();
      starPcRef.current = starPc;
      app.stage.addChild(starPc);

      // Generic container for planets, DSOs, satellites, etc.
      const objCont = new Container();
      objContRef.current = objCont;
      app.stage.addChild(objCont);

      /* ── Main ticker ─────────────────────────────────────────── */
      app.ticker.add(() => {
        if (destroyed) return;

        // Read latest values from refs — these update every React render
        // while this closure was captured only once at mount.
        const filters = filtersRef.current;
        const baseStars = baseStarsRef.current;
        const basePlanets = basePlanetsRef.current;
        const baseDsos = baseDsosRef.current;
        const baseMinorBodies = baseMinorBodiesRef.current;
        const baseSatellites = baseSatellitesRef.current;
        const baseMeteorShowers = baseMeteorShowersRef.current;
        const projectedMilkyWay = projectedMilkyWayRef.current;
        const constellationGeoJSONs = constellationGeoJSONsRef.current;
        const equatorialGridNodes = equatorialGridNodesRef.current;

        const now = Date.now();
        const W = offCanvas.width;
        const H = offCanvas.height;
        const cx = W / 2;
        const cy = H / 2;

        /* ── Zoom animation (same lerp as original) ─────────────── */
        if (Math.abs(targetZoomRef.current - zoomRef.current) > 1e-5) {
          zoomRef.current += (targetZoomRef.current - zoomRef.current) * 0.1;
          notifyZoomChangeThrottled(zoomRef.current);
        }

        /* ── Active target camera tracking ──────────────────────── */
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
            }
          }

          if (tAz !== null && tAlt !== null && !isNaN(tAlt)) {
            let dAz = (tAz - viewAzRef.current) % 360;
            if (dAz > 180) dAz -= 360;
            if (dAz < -180) dAz += 360;
            viewAzRef.current = normalizeAzimuth(
              viewAzRef.current + dAz * 0.08,
            );
            viewAltRef.current = clamp(
              viewAltRef.current + (tAlt - viewAltRef.current) * 0.08,
              -90,
              90,
            );
          }
        }

        const baseFovRadius = Math.max(W, H) / 2.5;
        const currentScale = baseFovRadius * zoomRef.current;

        const geoProj = geoStereographic()
          .scale(currentScale)
          .translate([cx, cy])
          .rotate([-viewAzRef.current, -viewAltRef.current, 0])
          .clipAngle(90);

        // pathGenerator is rebuilt inside renderOffscreenLayer with the offscreen ctx.

        const proj = (bAlt: number, bAz: number) => {
          const pt = geoProj([bAz, bAlt]);
          if (!pt) return null;
          if (pt[0] < -W || pt[0] > W * 2 || pt[1] < -H || pt[1] > H * 2) {
            return { x: pt[0], y: pt[1], visible: false };
          }
          return { x: pt[0], y: pt[1], visible: true };
        };

        const zoomScale = Math.max(1, 1 + (zoomRef.current - 1) * 0.2);
        const uiScale = Math.min(zoomScale, 15);
        const planetScale = Math.min(25, 1 + (zoomRef.current - 1) * 0.8);
        const pixelsPerDegree = (currentScale * Math.PI) / 180;

        const sunData = basePlanets.find(
          (p) => p.name === "Sol" || p.name === "Sun",
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
        const trueSunAlt =
          sunData && !isNaN(sunData.baseAlt) ? sunData.baseAlt : -90;

        let pSun: { x: number; y: number; visible: boolean } | null = null;
        let pMoon: { x: number; y: number; visible: boolean } | null = null;
        let sunRadiusPx = 0;
        let moonRadiusPx = 0;
        let targetEclipseFactor = 0;

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

        let dayIntensity = 0;
        if (filters.atmosphere && trueSunAlt > -18) {
          dayIntensity = trueSunAlt > 0 ? 1 : (trueSunAlt + 18) / 18;
          if (eclipseFactor > 0) {
            dayIntensity *= Math.max(0.02, 1 - Math.pow(eclipseFactor, 0.35));
          }
        }

        /* ── Projection helpers ──────────────────────────────────── */
        const visibleStars = new Map<number, ProjectedStar>();
        const visibleLookup = new Map<string, ProjectedStar>();
        const visibleMeteors = new Map<number, any>();
        const visibleMinorBodies = new Map<number, any>();
        const visibleSatellites = new Map<number, any>();
        const visibleConstellations = new Map<string, any>();
        const visiblePlanets: ProjectedStar[] = [];

        const projectObj = (obj: RenderableObject) => {
          if (isNaN(obj.baseAlt)) return;
          const pp = proj(obj.baseAlt, obj.baseAz);
          if (!pp?.visible) return;
          const projected: ProjectedStar = {
            ...(obj as ProjectedStar),
            x: pp.x,
            y: pp.y,
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

        /* ── Satellite orbit layout (same as original) ───────────── */
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

        /* ── Determine active target screen position ─────────────── */
        let activeTargetPos: { x: number; y: number } | null = null;
        let activeTargetIsConstellation = false;

        if (activeTargetRef.current) {
          const isCon = typeof activeTargetRef.current.id === "string";
          if (isCon) {
            activeTargetIsConstellation = true;
          } else {
            let tc: { x: number; y: number } | undefined =
              visibleStars.get(activeTargetRef.current.id) ||
              visibleStars.get(Number(activeTargetRef.current.id)) ||
              visibleMinorBodies.get(activeTargetRef.current.id) ||
              visibleSatellites.get(activeTargetRef.current.id) ||
              visibleMeteors.get(activeTargetRef.current.id);
            if (
              !tc &&
              pMoon &&
              (String(activeTargetRef.current.id) === "-1" ||
                activeTargetRef.current.name?.includes("Luna") ||
                activeTargetRef.current.name?.includes("Bulan"))
            ) {
              tc = { x: pMoon.x, y: pMoon.y };
            }
            if (tc) activeTargetPos = { x: tc.x, y: tc.y };
          }
        }

        /* ────────────────────────────────────────────────────────── */
        /* Render offscreen Canvas 2D layer (background + grids +    */
        /* constellation lines + atmosphere + milky way + horizon)   */
        /* ────────────────────────────────────────────────────────── */
        renderOffscreenLayer({
          canvas: offCanvas,
          width: W,
          height: H,
          cx,
          cy,
          viewAz: viewAzRef.current,
          viewAlt: viewAltRef.current,
          zoomLevel: zoomRef.current,
          currentScale,
          geoProj,
          proj,
          filters,
          isMobile,
          now,
          dayIntensity,
          trueSunAlt,
          eclipseFactor,
          pSun,
          pMoon,
          sunRadiusPx,
          moonRadiusPx,
          projectedMilkyWay,
          constellationGeoJSONs,
          equatorialGridNodes,
          zoomScale,
          uiScale,
          activeTargetPos,
          activeTargetIsConstellation,
          activeTargetId: activeTargetRef.current?.id ?? null,
          visibleConstellations,
          pixelsPerDegree,
        });

        // Upload offscreen canvas pixels to GPU
        if (offTextureRef.current?.source) {
          offTextureRef.current.source.update();
        }

        /* ────────────────────────────────────────────────────────── */
        /* DSO rendering (Canvas 2D path on offscreen — same as      */
        /* original, using the already-open 2D context)             */
        /* ────────────────────────────────────────────────────────── */
        const offCtx2d = offCanvas.getContext("2d");
        if (offCtx2d && dayIntensity < 0.75) {
          const bortle = filters.bortleScale || 1;
          const dsoOpacity = clamp(1 - (bortle - 1) / 8, 0.1, 1);
          offCtx2d.globalAlpha = (1 - dayIntensity * 0.9) * dsoOpacity;

          for (const dso of baseDsos) {
            if (isNaN(dso.baseAlt)) continue;
            const pp = proj(dso.baseAlt, dso.baseAz);
            if (!pp?.visible) continue;

            const dsoMagLimit = 8.5 - bortle * 0.5;
            if (zoomRef.current < 1.5 && dso.mag > dsoMagLimit) continue;

            // DSO image overlay via HTMLImageElement → offscreen canvas
            const dsoImg = dso.image ? getCachedImage(dso.image) : null;
            if (dsoImg && zoomRef.current > 1.2) {
              const sizeArcmin = dso.sizeArcmin || 45;
              const imgSizePx = (sizeArcmin / 60) * pixelsPerDegree;
              offCtx2d.save();
              offCtx2d.translate(pp.x, pp.y);
              const imgFadeProg = clamp((zoomRef.current - 1.2) * 2, 0, 1);
              offCtx2d.globalAlpha = offCtx2d.globalAlpha * imgFadeProg;
              offCtx2d.globalCompositeOperation = "screen";
              offCtx2d.drawImage(
                dsoImg,
                -imgSizePx / 2,
                -imgSizePx / 2,
                imgSizePx,
                imgSizePx,
              );
              offCtx2d.restore();
              if (imgFadeProg > 0.8) continue;
            }

            const size =
              Math.max(2, (8 - Math.min(dso.mag, 8)) * 0.7) *
              Math.max(1, zoomRef.current * 0.5);
            offCtx2d.save();
            offCtx2d.translate(pp.x, pp.y);
            offCtx2d.shadowBlur = 20 * zoomScale;
            offCtx2d.shadowColor = dso.color;
            switch (dso.type?.toLowerCase()) {
              case "galaxy":
                offCtx2d.strokeStyle = dso.color;
                offCtx2d.lineWidth = 1.5 * zoomScale;
                offCtx2d.beginPath();
                offCtx2d.ellipse(
                  0,
                  0,
                  size * 1.8,
                  size,
                  Math.PI / 5,
                  0,
                  Math.PI * 2,
                );
                offCtx2d.stroke();
                break;
              case "nebula": {
                const nc = chroma(dso.color);
                const g = offCtx2d.createRadialGradient(
                  0,
                  0,
                  0,
                  0,
                  0,
                  size * 3,
                );
                g.addColorStop(0, nc.alpha(0.73).css());
                g.addColorStop(1, nc.alpha(0).css());
                offCtx2d.fillStyle = g;
                offCtx2d.beginPath();
                offCtx2d.arc(0, 0, size * 3, 0, Math.PI * 2);
                offCtx2d.fill();
                break;
              }
              case "cluster":
                offCtx2d.fillStyle = dso.color;
                for (let i = 0; i < 10; i++) {
                  const a = (Math.PI * 2 * i) / 10,
                    r = size * 1.5;
                  offCtx2d.beginPath();
                  offCtx2d.arc(
                    Math.cos(a) * r * 0.5,
                    Math.sin(a) * r * 0.5,
                    1.2 * zoomScale,
                    0,
                    Math.PI * 2,
                  );
                  offCtx2d.fill();
                }
                break;
              default:
                offCtx2d.fillStyle = dso.color;
                offCtx2d.beginPath();
                offCtx2d.arc(0, 0, size, 0, Math.PI * 2);
                offCtx2d.fill();
            }
            offCtx2d.shadowBlur = 0;
            if (zoomRef.current > 2.2) {
              offCtx2d.fillStyle = "rgba(255,255,255,0.8)";
              offCtx2d.font = `${10 * zoomScale}px monospace`;
              offCtx2d.textAlign = "center";
              offCtx2d.fillText(dso.messier || dso.name, 0, -size * 3);
            }
            offCtx2d.restore();
          }
          offCtx2d.globalAlpha = 1;

          // Upload again after DSO drawing
          if (offTextureRef.current?.source) {
            offTextureRef.current.source.update();
          }
        }

        /* ────────────────────────────────────────────────────────── */
        /* PixiJS: update star ParticleContainer                    */
        /* ────────────────────────────────────────────────────────── */
        const starPc = starPcRef.current;
        const starTex = starTexRef.current;
        if (starPc && starTex) {
          const particles = starParticlesRef.current;
          const visibleIds = new Set<number>();
          const bortle = filters.bortleScale || 1;
          const bortleMagLimit = 8.0 - bortle * 0.42;
          const MAG_BASE = filters.faintStars
            ? bortleMagLimit
            : Math.min(3.5, bortleMagLimit);
          let adjMag = MAG_BASE;
          if (zoomRef.current > 3.0) adjMag += (zoomRef.current - 3.0) * 0.4;
          const MAG_LIMIT = adjMag - dayIntensity * (adjMag + 2);

          for (const star of visibleStars.values()) {
            if ((star as any).isPlanet) continue;
            if (star.mag > MAG_LIMIT) continue;

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

            const magRange = adjMag - BRIGHT_MAG_LIMIT;
            const normMag = Math.max(0, (adjMag - effectiveMag) / magRange);
            const radiusPx =
              Math.max(
                isMobile ? 0.6 : 0.4,
                normMag * (isMobile ? 3.0 : 2.6) + 0.2,
              ) * uiScale;
            const starAlpha = Math.min(
              1,
              Math.max(0.1, (adjMag - effectiveMag) / magRange),
            );

            // Double stars with split: render via PixiJS Graphics in objCont, skip particle
            if (star.isDouble && zoomRef.current > DOUBLE_SPLIT_START) {
              continue; // handled below in objCont pass
            }

            visibleIds.add(star.id);

            let particle = particles.get(star.id);
            if (!particle) {
              particle = new Particle({
                texture: starTex,
                x: star.x,
                y: star.y,
              });
              particle.anchorX = 0.5;
              particle.anchorY = 0.5;
              starPc.addParticle(particle);
              particles.set(star.id, particle);
            }

            particle.x = star.x;
            particle.y = star.y;
            particle.alpha = starAlpha;
            // Texture is 32px wide, center-to-edge = 16px → scale = radiusPx / 16
            const sc = radiusPx / 16;
            particle.scaleX = sc;
            particle.scaleY = sc;
            particle.tint = hexToPixiColor(getStarColor(star.bv));
          }

          // Remove stale particles fully — setting alpha=0 is unreliable
          // in PixiJS v8 ParticleContainer when filter state changes.
          // Collect stale ids first — mutating a Map while iterating it is UB.
          const staleIds: number[] = [];
          for (const [id] of particles) {
            if (!visibleIds.has(id)) staleIds.push(id);
          }
          for (const id of staleIds) {
            const p = particles.get(id)!;
            starPc.removeParticle(p);
            particles.delete(id);
          }
        }

        /* ────────────────────────────────────────────────────────── */
        /* PixiJS: Object Container (planets, moon, sun, comets,    */
        /* satellites, meteor showers, double stars, variable rings, */
        /* active reticle)                                           */
        /* ────────────────────────────────────────────────────────── */
        const objCont = objContRef.current;
        if (!objCont) return;
        objCont.removeChildren();

        const bortle = filters.bortleScale || 1;

        /* ── Minor bodies (comets & asteroids) ───────────────────── */
        let sunScreenX = cx,
          sunScreenY = H + 500;
        if (pSun) {
          sunScreenX = pSun.x;
          sunScreenY = pSun.y;
        }

        if (
          filters.minorBodies &&
          dayIntensity < 0.85 &&
          baseMinorBodies.length > 0
        ) {
          for (const body of baseMinorBodies) {
            if (isNaN(body.baseAlt) || body.baseAlt < -2) continue;
            const pp = proj(body.baseAlt, body.baseAz);
            if (!pp?.visible) continue;
            visibleMinorBodies.set(body.id, { ...body, x: pp.x, y: pp.y });

            const gfx = new Graphics();
            const bs =
              Math.max(1.5, (8 - Math.min(body.mag, 8)) * 0.5) * zoomScale;

            if (body.type === "Comet") {
              const dx = pp.x - sunScreenX,
                dy = pp.y - sunScreenY;
              const angle =
                Math.hypot(dx, dy) === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
              const tl = (body.tailLength || 60) * zoomScale * 0.8;
              const baseTailColor = body.color
                ? chroma(body.color)
                : chroma("#ccfbf1");
              // Comet tail as polygon
              const tx = Math.cos(angle) * tl;
              const ty2 = Math.sin(angle) * tl;
              const perpX = Math.cos(angle + Math.PI / 2) * bs;
              const perpY = Math.sin(angle + Math.PI / 2) * bs;
              gfx
                .poly([
                  { x: pp.x + perpX, y: pp.y + perpY },
                  { x: pp.x + tx, y: pp.y + ty2 },
                  { x: pp.x - perpX, y: pp.y - perpY },
                ])
                .fill({
                  color: hexToPixiColor(baseTailColor.hex()),
                  alpha: 0.6,
                });
              // Nucleus
              gfx.circle(pp.x, pp.y, bs * 1.2).fill({ color: 0xffffff });
            } else {
              gfx.circle(pp.x, pp.y, bs).fill({
                color: hexToPixiColor(body.color || "#d1d5db"),
              });
            }
            objCont.addChild(gfx);
          }
        }

        /* ── Satellites ───────────────────────────────────────────── */
        if (filters.satellites && baseSatellites.length > 0) {
          const pulse = Math.sin(Date.now() / 150) * 0.3 + 0.7;
          for (const sat of baseSatellites) {
            if (isNaN(sat.baseAlt)) continue;
            const pp = proj(sat.baseAlt, sat.baseAz);
            if (!pp) continue;
            visibleSatellites.set(sat.id, { ...sat, x: pp.x, y: pp.y });
            const isBelowHorizon = sat.baseAlt < 0;
            const sc = sat.color || "#10b981";
            const gfx = new Graphics();
            const rd = 8 * zoomScale;
            const alpha = (isBelowHorizon ? 0.6 : 1) * pulse;
            gfx.rect(pp.x - rd / 2, pp.y - rd / 2, rd, rd).stroke({
              color: hexToPixiColor(sc),
              width: 1.2,
              alpha: isBelowHorizon ? 0.25 : 0.6 * pulse,
            });
            gfx
              .circle(pp.x, pp.y, 1.8 * zoomScale)
              .fill({ color: 0xffffff, alpha: isBelowHorizon ? 0.4 : 1 });
            objCont.addChild(gfx);
          }
        }

        /* ── Meteor showers ───────────────────────────────────────── */
        if (filters.meteorShowers && baseMeteorShowers.length > 0) {
          for (const ms of baseMeteorShowers) {
            const tracked = activeTargetRef.current?.id === ms.id;
            if (isNaN(ms.baseAlt)) continue;
            const pp = proj(ms.baseAlt, ms.baseAz);
            if (!pp?.visible) continue;
            visibleMeteors.set(ms.id, { ...ms, x: pp.x, y: pp.y });
            if (ms.baseAlt < 0 && !tracked) continue;

            const gfx = new Graphics();
            const mc = hexToPixiColor(ms.color || "#fef08a");
            const rot = (Date.now() / 2000) % (Math.PI * 2);
            const msAlpha = ms.isActive ? 0.9 : 0.25;

            for (let i = 0; i < 4; i++) {
              const a = rot + (i * Math.PI) / 2;
              gfx
                .moveTo(
                  pp.x + Math.cos(a) * 4 * zoomScale,
                  pp.y + Math.sin(a) * 4 * zoomScale,
                )
                .lineTo(
                  pp.x + Math.cos(a) * 12 * zoomScale,
                  pp.y + Math.sin(a) * 12 * zoomScale,
                )
                .stroke({ color: mc, width: 1.5 * zoomScale, alpha: msAlpha });
            }
            gfx
              .circle(pp.x, pp.y, 2 * zoomScale)
              .fill({ color: 0xffffff, alpha: msAlpha });
            objCont.addChild(gfx);
          }
        }

        /* ── Planets (Sun, Moon, others) ──────────────────────────── */
        if (filters.planets) {
          // Sun
          if (pSun && sunData) {
            const gfx = new Graphics();
            if (eclipseFactor > 0.85) {
              const coronaRadius = sunRadiusPx * (3.5 + eclipseFactor * 5);
              for (let i = 4; i >= 1; i--) {
                gfx
                  .circle(pSun.x, pSun.y, coronaRadius * (i / 4))
                  .fill({ color: 0xffffff, alpha: 0.12 / i });
              }
              if (eclipseFactor < 0.995 && pMoon) {
                const fAngle = Math.atan2(pSun.y - pMoon.y, pSun.x - pMoon.x);
                gfx
                  .circle(
                    pSun.x + Math.cos(fAngle) * sunRadiusPx * 0.95,
                    pSun.y + Math.sin(fAngle) * sunRadiusPx * 0.95,
                    sunRadiusPx * 0.45,
                  )
                  .fill({ color: 0xffffff });
              }
            } else {
              gfx
                .circle(pSun.x, pSun.y, sunRadiusPx)
                .fill({ color: hexToPixiColor(sunData.colorStr || "#facc15") });
              gfx
                .circle(pSun.x, pSun.y, sunRadiusPx * 0.4)
                .fill({ color: 0xfffbeb });
            }
            objCont.addChild(gfx);
          }

          // Other planets
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

          for (const planet of otherPlanets) {
            const isSat = Boolean(planet.parent);
            const layout = satelliteLayouts.get(planet.id);
            const rx = layout?.x ?? planet.x;
            const ry = layout?.y ?? planet.y;
            const rPx = (planet.radiusPx || 4) * planetScale;

            const gfx = new Graphics();

            let isTransiting = false;
            if (
              pSun &&
              (planet.name === "Mercury" || planet.name === "Venus")
            ) {
              if (Math.hypot(rx - pSun.x, ry - pSun.y) < sunRadiusPx)
                isTransiting = true;
            }

            if (isSat && layout) {
              gfx
                .moveTo(layout.leaderX1, layout.leaderY1)
                .lineTo(layout.leaderX2, layout.leaderY2)
                .stroke({ color: 0xffffff, width: 0.5 * uiScale, alpha: 0.3 });
            }

            const drawR = isSat
              ? Math.max(1.5 * uiScale, rPx * 0.25)
              : isTransiting
                ? rPx * 0.6
                : isMobile
                  ? rPx * 1.2
                  : rPx;

            if (isTransiting) {
              gfx.circle(rx, ry, drawR).fill({ color: 0x000000 });
            } else if (
              !isTransiting &&
              planet.phase !== undefined &&
              zoomRef.current > 3.0
            ) {
              // Phase rendering: lit circle then dark overlay offset
              gfx
                .circle(rx, ry, drawR)
                .fill({ color: hexToPixiColor(planet.colorStr || "#ffffff") });
              const phaseRot = (planet.phaseAngle || 0) * (Math.PI / 180);
              gfx
                .circle(
                  rx + Math.cos(phaseRot) * drawR * 0.4,
                  ry + Math.sin(phaseRot) * drawR * 0.4,
                  drawR,
                )
                .fill({ color: 0x0b1021, alpha: 0.85 });
            } else {
              gfx
                .circle(rx, ry, drawR)
                .fill({ color: hexToPixiColor(planet.colorStr || "#ffffff") });
            }
            objCont.addChild(gfx);
          }

          // Moon
          if (pMoon && moonData) {
            visibleStars.set(moonData.id, {
              ...moonData,
              x: pMoon.x,
              y: pMoon.y,
            });
            const gfx = new Graphics();
            const baseColor = hexToPixiColor(moonData.colorStr || "#e2e8f0");
            gfx
              .circle(pMoon.x, pMoon.y, moonRadiusPx)
              .fill({ color: eclipseFactor > 0.1 ? 0x020617 : baseColor });

            if (
              eclipseFactor < 0.05 &&
              moonData.phase !== undefined &&
              zoomRef.current > 1.8
            ) {
              const rot = (moonData.phaseAngle || 0) * (Math.PI / 180);
              const phaseShift = (1 - moonData.phase) * moonRadiusPx * 1.5;
              gfx
                .circle(
                  pMoon.x + Math.cos(rot) * phaseShift,
                  pMoon.y + Math.sin(rot) * phaseShift,
                  moonRadiusPx * 1.05,
                )
                .fill({ color: 0x0b1021, alpha: 0.92 });
            }
            objCont.addChild(gfx);
          }
        }

        /* ── Stars: double-star split (PixiJS Graphics) ──────────── */
        {
          const MAG_BASE_loc = filters.faintStars
            ? 8.0 - bortle * 0.42
            : Math.min(3.5, 8.0 - bortle * 0.42);
          let adjMagLoc = MAG_BASE_loc;
          if (zoomRef.current > 3.0) adjMagLoc += (zoomRef.current - 3.0) * 0.4;
          const MAG_LIMIT_loc = adjMagLoc - dayIntensity * (adjMagLoc + 2);

          for (const star of visibleStars.values()) {
            if ((star as any).isPlanet) continue;
            if (star.mag > MAG_LIMIT_loc) continue;
            if (!star.isDouble) continue;

            if (zoomRef.current > DOUBLE_SPLIT_START) {
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

              const magRangeLoc = adjMagLoc - BRIGHT_MAG_LIMIT;
              const normMag = Math.max(0, (adjMagLoc - star.mag) / magRangeLoc);
              const radiusPx =
                Math.max(
                  isMobile ? 0.6 : 0.4,
                  normMag * (isMobile ? 3.0 : 2.6) + 0.2,
                ) * uiScale;
              const primaryR = radiusPx * Math.max(0.65, 1 - splitProg * 0.35);
              const primaryColor = getStarColor(star.bv);
              const starAlpha = Math.min(
                1,
                Math.max(0.1, (adjMagLoc - star.mag) / magRangeLoc),
              );

              const gfx = new Graphics();
              gfx.circle(star.x - dx, star.y - dy, primaryR).fill({
                color: hexToPixiColor(primaryColor),
                alpha: starAlpha,
              });

              const secMag = star.secondaryMag ?? star.mag + 1.5;
              const secNorm = Math.max(0, (adjMagLoc - secMag) / magRangeLoc);
              const secR =
                Math.max(
                  isMobile ? 0.3 : 0.2,
                  secNorm * (isMobile ? 2.5 : 2.2) + 0.1,
                ) *
                uiScale *
                Math.min(1, splitProg * 1.8);
              const secBv = star.secondaryBv ?? (star.bv ?? 0) + 1.2;
              const secondaryCol = getStarColor(secBv);
              gfx.circle(star.x + dx, star.y + dy, secR).fill({
                color: hexToPixiColor(secondaryCol),
                alpha: starAlpha,
              });

              objCont.addChild(gfx);
            }

            // Variable star pulse ring
            if (star.isVariable && zoomRef.current > 1.5) {
              const periodMs = (star.variablePeriod || 7) * 86_400_000;
              const phase = (now % periodMs) / periodMs;
              const pulse2 = (Math.sin(phase * Math.PI * 2) + 1) / 2;
              const magRangeLoc2 = adjMagLoc - BRIGHT_MAG_LIMIT;
              const normMag = Math.max(
                0,
                (adjMagLoc - star.mag) / magRangeLoc2,
              );
              const radiusPx =
                Math.max(
                  isMobile ? 0.6 : 0.4,
                  normMag * (isMobile ? 3.0 : 2.6) + 0.2,
                ) * uiScale;
              const primaryColor = getStarColor(star.bv);
              const starAlpha = Math.min(
                1,
                Math.max(0.1, (adjMagLoc - star.mag) / magRangeLoc2),
              );

              const gfx = new Graphics();
              gfx
                .circle(
                  star.x,
                  star.y,
                  radiusPx + (1.5 + 2.5 * pulse2) * uiScale,
                )
                .stroke({
                  color: hexToPixiColor(primaryColor),
                  width: 0.7 * uiScale,
                  alpha: starAlpha * 0.35 * pulse2,
                });
              objCont.addChild(gfx);
            }
          }
        }

        /* ── Active target reticle (PixiJS arc segments) ─────────── */
        if (activeTargetPos && !activeTargetIsConstellation) {
          const { x: tx, y: ty } = activeTargetPos;
          const tOff = now / 400;
          const gfx = new Graphics();
          const cl = 35 * zoomScale,
            ig = 15 * zoomScale;

          // Determine reticle color from object type
          let reticleColor = 0x22c55e; // green default
          const fb = latestObjectsRef.current.get(activeTargetRef.current?.id);
          if (fb) {
            const t = (fb as any).type;
            if (t === "Comet" || t === "Asteroid") reticleColor = 0x2dd4bf;
            else if (t === "Satellite") reticleColor = 0x10b981;
            else if (t === "MeteorShower") reticleColor = 0xfacc15;
          }

          gfx
            .moveTo(tx - cl, ty)
            .lineTo(tx - ig, ty)
            .stroke({ color: reticleColor, width: 1, alpha: 0.6 });
          gfx
            .moveTo(tx + ig, ty)
            .lineTo(tx + cl, ty)
            .stroke({ color: reticleColor, width: 1, alpha: 0.6 });
          gfx
            .moveTo(tx, ty - cl)
            .lineTo(tx, ty - ig)
            .stroke({ color: reticleColor, width: 1, alpha: 0.6 });
          gfx
            .moveTo(tx, ty + ig)
            .lineTo(tx, ty + cl)
            .stroke({ color: reticleColor, width: 1, alpha: 0.6 });

          // Rotating dashed ring via arc segments
          const numSeg = 8;
          for (let si = 0; si < numSeg; si += 2) {
            const a0 = tOff + (si / numSeg) * Math.PI * 2;
            const a1 = tOff + ((si + 0.85) / numSeg) * Math.PI * 2;
            gfx
              .arc(tx, ty, 24 * zoomScale, a0, a1)
              .stroke({ color: reticleColor, width: 1.5, alpha: 0.9 });
          }
          objCont.addChild(gfx);
        }

        /* ── Update renderedXxxRef maps for raycasting ───────────── */
        renderedStarsRef.current = visibleStars;
        renderedMinorBodiesRef.current = visibleMinorBodies;
        renderedSatellitesRef.current = visibleSatellites;
        renderedMeteorShowersRef.current = visibleMeteors;
        renderedConstellationsRef.current = visibleConstellations;
      }); // end ticker
    })();

    return () => {
      destroyed = true;
      pixiInitRef.current = false;
      if (appRef.current) {
        appRef.current.destroy(true, { children: true, texture: true });
        appRef.current = null;
      }
      offCanvasRef.current = null;
      offTextureRef.current = null;
      offSpriteRef.current = null;
      starPcRef.current = null;
      objContRef.current = null;
      starParticlesRef.current.clear();
      starTexRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  /* ============================================================== */
  /* Raycasting / Object Selection (identical logic to original)    */
  /* ============================================================== */
  const selectObjectAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
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
          const d = Math.hypot(con.x - mx, con.y - my);
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

  /* ============================================================== */
  /* Gesture handling (identical to original)                       */
  /* ============================================================== */
  const isDragRef = useRef(false);
  const initialDragPos = useRef<{ x: number; y: number } | null>(null);

  const bindGestures = useGesture(
    {
      onDragStart: ({ event }) => {
        isDragRef.current = false;
        const e = event as PointerEvent;
        initialDragPos.current = { x: e.clientX, y: e.clientY };
      },

      onDrag: ({ delta: [dx, dy] }) => {
        if (!isDragRef.current) {
          if (!initialDragPos.current) return;
          isDragRef.current = true;
          if (activeTargetRef.current) onClearTargetRef.current?.();
          setIsDragging(true);
        }
        const sens =
          (isMobile ? VIEW_SENSITIVITY * 0.8 : VIEW_SENSITIVITY) /
          zoomRef.current;
        viewAzRef.current = normalizeAzimuth(viewAzRef.current - dx * sens);
        viewAltRef.current = clamp(viewAltRef.current + dy * sens, -90, 90);
      },

      onDragEnd: ({ event }) => {
        setIsDragging(false);
        const e = event as PointerEvent;
        if (initialDragPos.current) {
          const movedDist = Math.hypot(
            e.clientX - initialDragPos.current.x,
            e.clientY - initialDragPos.current.y,
          );
          if (movedDist <= CLICK_MOVE_THRESHOLD) {
            selectObjectAtPoint(e.clientX, e.clientY);
          }
        }
        isDragRef.current = false;
        initialDragPos.current = null;
      },

      onPinch: ({ offset: [distance] }) => {
        if (activeTargetRef.current) onClearTargetRef.current?.();
        const newZoom = clamp(distance, MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
        zoomRef.current = newZoom;
        targetZoomRef.current = newZoom;
        notifyZoomChangeThrottled(newZoom);
      },

      onWheel: ({ event, delta: [, dy] }) => {
        event.preventDefault();
        if (activeTargetRef.current) onClearTargetRef.current?.();
        const factor = dy > 0 ? 0.85 : 1.15;
        const newZoom = clamp(
          targetZoomRef.current * factor,
          MIN_ZOOM_LEVEL,
          MAX_ZOOM_LEVEL,
        );
        targetZoomRef.current = newZoom;
      },
    },
    {
      drag: {},
      pinch: {
        from: () => [zoomRef.current, 0],
        scaleBounds: { min: MIN_ZOOM_LEVEL, max: MAX_ZOOM_LEVEL },
      },
      wheel: { eventOptions: { passive: false } },
    },
  );

  return (
    <div
      ref={containerRef}
      {...bindGestures()}
      className="h-full w-full select-none touch-none"
      style={{
        cursor: isDragging ? "grabbing" : TARGET_CURSOR,
        touchAction: "none",
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}
