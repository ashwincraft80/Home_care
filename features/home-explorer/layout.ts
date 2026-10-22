import type { HotspotKey } from "./hotspots";

/**
 * Procedural model of a contemporary Indian home (isometric cutaway).
 * One source of truth for both the WebGL scene and the static SVG fallback.
 *
 * Provenance: authored in this repository from primitive shapes — no third-party model or texture,
 * so there is no external licence to track. Units are metres-ish; floor top is y = 0.
 * Camera looks from +x, +z, +y, so rooms are cut open on the +x/+z sides.
 */
export type PartKind = "box" | "cylinder" | "sphere" | "panel" | "glass" | "lamp";
/** Surface finish used by the WebGL renderer (ignored by the flat fallback). */
export type Finish = "matte" | "wood" | "planks" | "tiles" | "gloss" | "metal" | "fabric" | "leaf" | "stone" | "grass";
export type RevealGroup = "foundation" | "walls" | "furniture" | "roof" | "lights";

export interface Part {
  id: string;
  kind: PartKind;
  /** Axis-aligned bounds [x0, y0, z0, x1, y1, z1]. */
  box: [number, number, number, number, number, number];
  color: string;
  group: RevealGroup;
  hotspot?: HotspotKey;
  rounded?: boolean;
  /** Extra rotation in the 3D scene (radians); ignored in the flat fallback. */
  rotation?: [number, number, number];
  castShadow?: boolean;
  /** Skip in the static fallback (small details). */
  noSvg?: boolean;
  finish?: Finish;
}

const C = {
  grass: "#c3d2bb",
  stone: "#e8dfcf",
  oak: "#d9c19c",
  tile: "#eee8dd",
  wall: "#f4eee3",
  wallShade: "#e7dfd1",
  ink: "#4a5c55",
  teal: "#2c7a70",
  tealDeep: "#1f5b53",
  sage: "#a9c0b1",
  wood: "#b8946a",
  woodDark: "#8a6a47",
  white: "#fbfaf6",
  steel: "#d5d9d6",
  dark: "#3a433f",
  glass: "#bcd6d9",
  panel: "#2d3f4f",
  sun: "#f4c46c",
  leaf: "#7f9f88",
};

let n = 0;
const p = (kind: PartKind, box: Part["box"], color: string, group: RevealGroup, extra: Partial<Part> = {}): Part => ({
  id: `p${n++}`,
  kind,
  box,
  color,
  group,
  castShadow: group !== "foundation",
  ...extra,
});

export const parts: Part[] = [
  // Foundation & garden
  p("box", [-5.3, -0.45, -6.0, 5.3, -0.25, 4.5], C.grass, "foundation", { castShadow: false, finish: "grass", rounded: true }),
  p("box", [-4.3, -0.25, -5.0, 4.3, 0, 3.2], C.stone, "foundation", { castShadow: false, finish: "stone" }),
  p("box", [-5.3, -0.25, 2.15, -4.3, -0.2, 2.75], C.stone, "foundation", { castShadow: false }),
  p("box", [-3.8, 0, -2.95, -0.06, 0.03, -0.06], C.oak, "foundation", { castShadow: false, finish: "planks" }),
  p("box", [-3.8, 0, 0.06, -0.06, 0.03, 3.1], C.oak, "foundation", { castShadow: false, finish: "planks" }),
  p("box", [0.06, 0, -2.95, 4.1, 0.03, -0.06], C.tile, "foundation", { castShadow: false, finish: "tiles" }),
  p("box", [0.06, 0, 0.06, 4.1, 0.03, 3.1], C.tile, "foundation", { castShadow: false, finish: "tiles" }),

  // Structure
  p("box", [-4.3, 0, -5.0, 4.3, 2.6, -3.0], C.wall, "walls", { rounded: true }),
  p("box", [-4.3, 0, -3.0, -3.8, 2.6, 2.0], C.wallShade, "walls"),
  p("box", [-4.3, 0, 2.9, -3.8, 2.6, 3.2], C.wallShade, "walls"),
  p("box", [-4.3, 2.1, 2.0, -3.8, 2.6, 2.9], C.wallShade, "walls"),
  // Low interior partitions, split per room so the static fallback can depth-sort them.
  p("box", [-0.06, 0, -2.95, 0.06, 1.0, -0.06], C.wall, "walls"),
  p("box", [-0.06, 0, 0.06, 0.06, 1.0, 3.1], C.wall, "walls"),
  p("box", [-3.8, 0, -0.06, -0.06, 1.0, 0.06], C.wall, "walls"),
  p("box", [0.06, 0, -0.06, 4.1, 1.0, 0.06], C.wall, "walls"),
  p("box", [-0.06, 0, -0.06, 0.06, 1.0, 0.06], C.wall, "walls"),
  // Section caps (architectural poché)
  p("box", [-4.3, 2.6, -3.0, -3.8, 2.65, 3.2], C.ink, "walls", { castShadow: false }),
  p("box", [-0.07, 1.0, -2.95, 0.07, 1.04, -0.07], C.ink, "walls", { castShadow: false }),
  p("box", [-0.07, 1.0, 0.07, 0.07, 1.04, 3.1], C.ink, "walls", { castShadow: false }),
  p("box", [-3.8, 1.0, -0.07, -0.07, 1.04, 0.07], C.ink, "walls", { castShadow: false }),
  p("box", [0.07, 1.0, -0.07, 4.1, 1.04, 0.07], C.ink, "walls", { castShadow: false }),
  p("box", [-0.07, 1.0, -0.07, 0.07, 1.04, 0.07], C.ink, "walls", { castShadow: false }),

  // Roof terrace, solar and water tank
  p("box", [-4.4, 2.6, -5.1, 4.4, 2.75, -2.9], "#e2d9c8", "roof"),
  p("box", [-4.4, 2.75, -5.1, 4.4, 2.95, -5.0], C.wallShade, "roof", { noSvg: true }),
  p("panel", [-3.45, 2.95, -4.75, -1.35, 3.01, -3.25], C.panel, "roof", { hotspot: "solar", rotation: [0.32, 0, 0] }),
  p("panel", [-1.05, 2.95, -4.75, 1.05, 3.01, -3.25], C.panel, "roof", { hotspot: "solar", rotation: [0.32, 0, 0] }),
  p("panel", [1.35, 2.95, -4.75, 2.65, 3.01, -3.25], C.panel, "roof", { hotspot: "solar", rotation: [0.32, 0, 0] }),
  p("cylinder", [3.05, 2.75, -4.7, 3.85, 3.55, -3.9], C.dark, "roof"),
  p("glass", [4.3, 1.0, -4.5, 4.33, 2.0, -3.5], C.glass, "roof"),
  p("glass", [-3.82, 1.0, -2.3, -3.78, 2.0, -1.1], C.glass, "roof"),

  // Bedroom
  p("box", [-3.45, 0.03, -2.98, -1.55, 1.1, -2.78], C.tealDeep, "furniture", { rounded: true }),
  p("box", [-3.4, 0.03, -2.78, -1.6, 0.42, -0.95], "#e6dac6", "furniture", { rounded: true }),
  p("box", [-3.35, 0.42, -2.73, -1.65, 0.6, -1.0], C.white, "furniture", { rounded: true }),
  p("box", [-3.2, 0.6, -2.68, -1.8, 0.74, -2.3], C.sage, "furniture", { rounded: true, noSvg: true }),
  p("box", [-2.8, 1.95, -2.99, -1.4, 2.3, -2.72], C.white, "furniture", { hotspot: "ac", rounded: true }),
  p("box", [-2.72, 1.97, -2.73, -1.48, 2.01, -2.7], "#c9cfcc", "furniture", { hotspot: "ac", noSvg: true }),
  p("box", [-3.78, 0.03, -0.9, -3.25, 1.9, -0.12], "#cdb38f", "furniture", { rounded: true }),
  p("lamp", [-1.3, 0.03, -2.9, -0.9, 0.85, -2.5], C.sun, "lights"),

  // Bathroom
  p("box", [0.65, 0.03, -2.95, 1.65, 0.75, -2.55], "#9db7ab", "furniture", { hotspot: "plumbing", rounded: true }),
  p("box", [0.6, 0.75, -2.98, 1.7, 0.85, -2.5], C.white, "furniture", { hotspot: "plumbing", rounded: true }),
  p("box", [1.1, 0.85, -2.92, 1.2, 1.05, -2.8], "#b7bfc1", "furniture", { hotspot: "plumbing", noSvg: true }),
  p("glass", [0.75, 1.15, -2.99, 1.55, 1.85, -2.96], "#d9e6e8", "furniture"),
  p("cylinder", [2.92, 1.55, -2.99, 3.48, 2.35, -2.43], C.white, "furniture", { hotspot: "geyser" }),
  p("box", [2.6, 0.03, -1.7, 3.95, 0.08, -0.25], C.white, "furniture"),
  p("glass", [2.55, 0.08, -1.7, 2.6, 1.9, -0.25], C.glass, "furniture", { noSvg: true }),
  p("box", [0.4, 0.03, -1.25, 0.85, 0.48, -0.65], C.white, "furniture", { rounded: true }),

  // Living room
  p("box", [-3.25, 0.03, 0.55, -0.95, 0.05, 2.65], "#e8d6b8", "furniture", { castShadow: false }),
  p("box", [-3.78, 0.03, 0.95, -3.4, 0.45, 2.0], C.wood, "furniture", { rounded: true }),
  p("box", [-3.78, 0.85, 1.0, -3.72, 1.6, 1.95], "#20262a", "furniture"),
  p("box", [-1.9, 0.03, 0.6, -1.1, 0.42, 2.4], C.teal, "furniture", { rounded: true }),
  p("box", [-1.15, 0.03, 0.6, -0.85, 0.85, 2.4], C.tealDeep, "furniture", { rounded: true }),
  p("box", [-2.85, 0.03, 1.25, -2.25, 0.33, 1.8], C.woodDark, "furniture", { rounded: true }),
  p("box", [-3.8, 1.35, 0.25, -3.68, 1.95, 0.75], "#6c7873", "furniture", { hotspot: "electrical" }),
  p("box", [-3.68, 1.45, 0.32, -3.66, 1.85, 0.68], "#e9ece9", "furniture", { hotspot: "electrical", noSvg: true }),
  p("box", [-3.75, 0.03, 0.18, -3.35, 0.58, 0.58], "#efe8da", "furniture", { hotspot: "inverter", rounded: true }),
  p("box", [-3.3, 0.03, 0.2, -2.9, 0.45, 0.56], "#39463f", "furniture", { hotspot: "inverter", rounded: true }),
  p("box", [-3.86, 0.03, 2.05, -3.78, 2.05, 2.85], "#a17d55", "furniture", { hotspot: "general" }),
  p("lamp", [-0.75, 0.03, 2.55, -0.45, 1.5, 2.85], C.sun, "lights"),

  // Kitchen & laundry
  p("box", [0.4, 0.03, 0.12, 3.9, 0.9, 0.7], "#f1ebdf", "furniture"),
  p("box", [0.35, 0.9, 0.1, 3.95, 0.96, 0.75], "#4a5650", "furniture"),
  p("box", [3.0, 0.96, 0.15, 3.45, 1.62, 0.45], C.white, "furniture", { hotspot: "purifier", rounded: true }),
  p("box", [3.05, 1.02, 0.43, 3.4, 1.3, 0.47], "#8fc1c8", "furniture", { hotspot: "purifier", noSvg: true }),
  p("box", [0.15, 0.03, 1.0, 0.75, 1.9, 1.6], C.steel, "furniture", { hotspot: "appliances", rounded: true }),
  p("box", [3.3, 0.03, 2.2, 3.95, 0.85, 2.85], C.white, "furniture", { hotspot: "appliances", rounded: true }),
  p("cylinder", [3.47, 0.3, 2.84, 3.78, 0.61, 2.9], "#8aa1a7", "furniture", { hotspot: "appliances", rotation: [Math.PI / 2, 0, 0], noSvg: true }),
  p("box", [1.5, 0.03, 1.6, 2.6, 0.75, 2.4], C.wood, "furniture", { rounded: true }),
  p("lamp", [1.9, 1.9, 1.85, 2.2, 2.05, 2.15], C.sun, "lights"),

  // Garden
  p("cylinder", [4.68, -0.25, -5.62, 4.92, 1.0, -5.38], "#7d6247", "furniture"),
  p("sphere", [4.0, 0.6, -6.3, 5.6, 2.2, -4.7], C.leaf, "furniture", { finish: "leaf" }),
  p("sphere", [4.3, -0.25, 3.5, 5.1, 0.6, 4.3], C.leaf, "furniture", { finish: "leaf" }),
  p("sphere", [3.8, -0.25, 3.85, 4.35, 0.3, 4.4], "#93b39b", "furniture", { finish: "leaf" }),
  p("sphere", [-5.2, -0.25, -1.4, -4.5, 0.5, -0.7], "#93b39b", "furniture", { finish: "leaf" }),
  // ---- Architectural detail (WebGL only) -------------------------------------------------
  // Window frames and mullions
  p("box", [-3.84, 0.94, -2.36, -3.76, 1.0, -1.04], C.ink, "roof", { noSvg: true, finish: "metal" }),
  p("box", [-3.84, 2.0, -2.36, -3.76, 2.06, -1.04], C.ink, "roof", { noSvg: true, finish: "metal" }),
  p("box", [-3.84, 1.0, -1.72, -3.76, 2.0, -1.66], C.ink, "roof", { noSvg: true, finish: "metal" }),
  p("box", [4.29, 0.94, -4.56, 4.36, 1.0, -3.44], C.ink, "roof", { noSvg: true, finish: "metal" }),
  p("box", [4.29, 2.0, -4.56, 4.36, 2.06, -3.44], C.ink, "roof", { noSvg: true, finish: "metal" }),
  // Door frame
  p("box", [-3.9, 2.05, 1.98, -3.76, 2.12, 2.92], C.woodDark, "walls", { noSvg: true, finish: "wood" }),
  // Roof terrace railing
  ...[-4.3, -2.15, 0, 2.15, 4.3].map((x) => p("box", [x - 0.03, 2.75, -2.98, x + 0.03, 3.35, -2.92], C.ink, "roof", { noSvg: true, finish: "metal" })),
  p("box", [-4.33, 3.33, -2.99, 4.33, 3.38, -2.91], C.ink, "roof", { noSvg: true, finish: "metal" }),
  // Solar mounting legs
  ...[-3.2, -1.6, 0.8, 2.4].map((x) => p("box", [x - 0.03, 2.75, -3.45, x + 0.03, 2.98, -3.39], "#7d8a86", "roof", { noSvg: true, finish: "metal" })),
  // Bedroom: wall art, rug, bedside table
  p("box", [-3.2, 1.35, -2.99, -2.4, 1.85, -2.95], "#d9b46a", "furniture", { noSvg: true, finish: "gloss" }),
  p("box", [-3.15, 1.4, -2.96, -2.45, 1.8, -2.94], "#e9dcc4", "furniture", { noSvg: true }),
  p("box", [-3.3, 0.03, -0.9, -1.7, 0.045, -0.3], "#c7d6cc", "furniture", { castShadow: false, finish: "fabric" }),
  p("box", [-1.48, 0.03, -2.9, -1.08, 0.5, -2.5], C.woodDark, "furniture", { rounded: true, finish: "wood", noSvg: true }),
  // Living: plants, cushions, pendant
  p("cylinder", [-0.75, 0.03, 0.3, -0.45, 0.45, 0.6], "#e7ded0", "furniture", { finish: "gloss" }),
  p("sphere", [-0.95, 0.4, 0.1, -0.25, 1.2, 0.8], C.leaf, "furniture", { finish: "leaf" }),
  p("box", [-1.05, 0.42, 0.85, -0.92, 0.7, 1.25], C.sage, "furniture", { rounded: true, finish: "fabric", noSvg: true }),
  p("box", [-1.05, 0.42, 1.75, -0.92, 0.7, 2.15], "#e9b45c", "furniture", { rounded: true, finish: "fabric", noSvg: true }),
  p("lamp", [-2.7, 2.15, 1.35, -2.4, 2.3, 1.65], C.sun, "lights", { noSvg: true }),
  p("box", [-2.56, 2.3, 1.49, -2.54, 2.6, 1.51], C.ink, "lights", { noSvg: true }),
  // Kitchen: backsplash, hob, stools, pendant cord
  p("box", [0.4, 0.96, 0.08, 3.9, 1.0, 0.12], "#d5e3dc", "furniture", { noSvg: true, finish: "tiles" }),
  p("box", [1.2, 0.96, 0.25, 1.8, 0.99, 0.6], "#2a302e", "furniture", { noSvg: true, finish: "gloss" }),
  p("cylinder", [1.6, 0.03, 2.55, 1.9, 0.6, 2.85], C.woodDark, "furniture", { noSvg: true, finish: "wood" }),
  p("cylinder", [2.2, 0.03, 2.55, 2.5, 0.6, 2.85], C.woodDark, "furniture", { noSvg: true, finish: "wood" }),
  p("box", [2.04, 2.05, 1.99, 2.06, 2.6, 2.01], C.ink, "lights", { noSvg: true }),
  // Bathroom: wall tiles band, towel, plant
  p("box", [0.06, 0.03, -2.99, 2.5, 0.75, -2.96], "#e2ece8", "furniture", { noSvg: true, finish: "tiles" }),
  p("box", [3.95, 0.9, -1.4, 3.99, 1.4, -0.9], C.sage, "furniture", { noSvg: true, finish: "fabric" }),
  // Garden: path lights, hedges, bench
  ...[1.95, 3.0].map((z) => p("lamp", [-5.0, -0.25, z, -4.88, 0.15, z + 0.12], C.sun, "lights", { noSvg: true })),
  p("box", [-5.2, -0.25, -5.9, -4.6, 0.35, -2.0], "#86a68e", "furniture", { rounded: true, finish: "leaf" }),
  p("box", [2.2, -0.25, 3.7, 3.6, 0.3, 4.3], "#86a68e", "furniture", { rounded: true, finish: "leaf" }),
  p("box", [-2.6, -0.25, 3.55, -1.2, 0.2, 4.0], C.wood, "furniture", { rounded: true, finish: "wood" }),
];


/** Timeline for the "Home Reveal" (seconds). Total ≈ 2 s; skipped for returning visitors and reduced motion. */
export const revealTimeline: Record<RevealGroup, { start: number; duration: number; stagger: number }> = {
  foundation: { start: 0.0, duration: 0.35, stagger: 0.02 },
  walls: { start: 0.25, duration: 0.45, stagger: 0.04 },
  furniture: { start: 0.6, duration: 0.4, stagger: 0.012 },
  roof: { start: 1.0, duration: 0.45, stagger: 0.06 },
  lights: { start: 1.4, duration: 0.5, stagger: 0.05 },
};
export const REVEAL_TOTAL = 2.0;
