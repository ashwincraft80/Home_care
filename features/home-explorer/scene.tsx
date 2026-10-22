"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, ContactShadows, Environment, Lightformer, Outlines, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { hotspotByKey, hotspots, type HotspotKey } from "./hotspots";
import { parts, revealTimeline, REVEAL_TOTAL, type Part } from "./layout";

export interface HomeSceneProps {
  selected: HotspotKey | null;
  hovered: HotspotKey | null;
  onSelect: (key: HotspotKey | null) => void;
  onHover: (key: HotspotKey | null) => void;
  /** Play the assembly reveal (first visit, motion allowed). */
  reveal: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  /** When false the render loop pauses (scene scrolled out of view). */
  active: boolean;
  onReady: () => void;
}

interface Interaction {
  selected: HotspotKey | null;
  hovered: HotspotKey | null;
  onSelect: (key: HotspotKey | null) => void;
  onHover: (key: HotspotKey | null) => void;
  finePointer: boolean;
  lowPower: boolean;
}
const InteractionCtx = createContext<Interaction | null>(null);

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const BRAND = new THREE.Color("#0d6b62");
const SUN = new THREE.Color("#e9b45c");

// ---------------------------------------------------------------------------
// Procedural textures (drawn once on a canvas — no external assets to license or download)
// ---------------------------------------------------------------------------

type TexKey = "planks" | "tiles" | "cells";
let textureCache: Record<TexKey, THREE.CanvasTexture> | null = null;

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function textures() {
  if (textureCache) return textureCache;
  textureCache = {
    planks: canvasTexture((g, s) => {
      g.fillStyle = "#f6efe4";
      g.fillRect(0, 0, s, s);
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const y = (r * s) / rows;
        g.fillStyle = r % 2 ? "rgba(120,86,48,0.07)" : "rgba(255,255,255,0.08)";
        g.fillRect(0, y, s, s / rows);
        g.fillStyle = "rgba(90,62,34,0.22)";
        g.fillRect(0, y, s, 1.5);
        g.fillRect((((r * 97) % 7) / 7) * s, y, 1.5, s / rows);
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = "rgba(110,78,44,0.06)";
          g.beginPath();
          const gy = y + ((i + 0.5) * s) / rows / 6;
          g.moveTo(0, gy);
          g.bezierCurveTo(s * 0.3, gy + 2, s * 0.6, gy - 2, s, gy + 1);
          g.stroke();
        }
      }
    }),
    tiles: canvasTexture((g, s) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, s, s);
      g.fillStyle = "rgba(60,72,66,0.16)";
      g.fillRect(0, 0, s, 2);
      g.fillRect(0, 0, 2, s);
      const grad = g.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.035)");
      g.fillStyle = grad;
      g.fillRect(2, 2, s - 2, s - 2);
    }, 128),
    cells: canvasTexture((g, s) => {
      g.fillStyle = "#1d2f45";
      g.fillRect(0, 0, s, s);
      const n = 6;
      const cell = s / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const grad = g.createLinearGradient(i * cell, j * cell, (i + 1) * cell, (j + 1) * cell);
          grad.addColorStop(0, "#2c4766");
          grad.addColorStop(1, "#18283b");
          g.fillStyle = grad;
          g.fillRect(i * cell + 2, j * cell + 2, cell - 4, cell - 4);
        }
      g.fillStyle = "rgba(210,220,230,0.55)";
      for (let i = 0; i <= n; i++) {
        g.fillRect(i * cell - 1, 0, 2, s);
        g.fillRect(0, i * cell - 1, s, 2);
      }
    }),
  };
  return textureCache;
}

function textureFor(part: Part, size: [number, number, number]): THREE.Texture | null {
  const finish = part.kind === "panel" ? "cells" : part.finish === "planks" || part.finish === "tiles" ? part.finish : null;
  if (!finish) return null;
  const t = textures()[finish].clone();
  const vertical = size[1] > size[2] * 2; // e.g. a backsplash or wall tile band
  const unit = finish === "planks" ? 1.4 : finish === "tiles" ? (vertical ? 0.25 : 0.55) : 1;
  t.repeat.set(Math.max(1, size[0] / unit), Math.max(1, (vertical ? size[1] : size[2]) / unit));
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

const revealIndex = new Map<string, number>();
for (const group of Object.keys(revealTimeline)) {
  parts.filter((p) => p.group === group).forEach((p, i) => revealIndex.set(p.id, i));
}

function useRevealClock(reveal: boolean) {
  const start = useRef<number | null>(null);
  return (now: number) => {
    if (!reveal) return Infinity;
    if (start.current === null) start.current = now;
    return now - start.current;
  };
}

type MatRef = React.RefObject<THREE.MeshStandardMaterial | null>;

function PartMaterial({ part, size, matRef, lowPower }: { part: Part; size: [number, number, number]; matRef: MatRef; lowPower: boolean }) {
  const map = useMemo(() => textureFor(part, size), [part, size]);
  useEffect(() => () => map?.dispose(), [map]);
  const physRef = matRef as React.RefObject<THREE.MeshPhysicalMaterial | null>;
  const color = map ? "#ffffff" : part.color;

  if (part.kind === "lamp") {
    return <meshStandardMaterial ref={matRef} color="#fff4dc" emissive="#ffc46b" emissiveIntensity={0} roughness={0.4} toneMapped={false} />;
  }
  if (part.kind === "glass") {
    return lowPower ? (
      <meshStandardMaterial ref={matRef} color={part.color} transparent opacity={0.38} roughness={0.08} metalness={0.1} />
    ) : (
      <meshPhysicalMaterial ref={physRef} color="#e8f3f4" transmission={0.92} thickness={0.05} roughness={0.06} ior={1.45} transparent opacity={0.9} />
    );
  }
  if (part.kind === "panel") {
    return <meshPhysicalMaterial ref={physRef} color={color} map={map ?? undefined} metalness={0.35} roughness={0.22} clearcoat={1} clearcoatRoughness={0.08} />;
  }
  switch (part.finish) {
    case "gloss":
      return <meshPhysicalMaterial ref={physRef} color={color} roughness={0.32} clearcoat={0.7} clearcoatRoughness={0.18} />;
    case "metal":
      return <meshStandardMaterial ref={matRef} color={part.color} metalness={0.55} roughness={0.35} />;
    case "fabric":
      return <meshPhysicalMaterial ref={physRef} color={color} roughness={0.92} sheen={0.6} sheenRoughness={0.8} sheenColor="#ffffff" />;
    case "leaf":
      return <meshStandardMaterial ref={matRef} color={part.color} roughness={0.75} flatShading />;
    case "wood":
      return <meshPhysicalMaterial ref={physRef} color={color} roughness={0.5} clearcoat={0.25} clearcoatRoughness={0.4} />;
    case "planks":
      return <meshPhysicalMaterial ref={physRef} color="#dcc29b" map={map ?? undefined} roughness={0.48} clearcoat={0.35} clearcoatRoughness={0.3} />;
    case "tiles":
      return <meshPhysicalMaterial ref={physRef} color={part.color} map={map ?? undefined} roughness={0.22} clearcoat={0.5} clearcoatRoughness={0.15} />;
    case "grass":
      return <meshStandardMaterial ref={matRef} color={part.color} roughness={1} />;
    case "stone":
      return <meshStandardMaterial ref={matRef} color={part.color} roughness={0.92} />;
    default: {
      // Appliances and fixtures (white, rounded) get a soft enamel finish.
      const enamel = part.rounded && /^#f[0-9a-f]{5}$/i.test(part.color);
      return enamel ? (
        <meshPhysicalMaterial ref={physRef} color={part.color} roughness={0.3} clearcoat={0.6} clearcoatRoughness={0.15} />
      ) : (
        <meshStandardMaterial ref={matRef} color={part.color} roughness={0.82} />
      );
    }
  }
}

function PartMesh({ part, clock }: { part: Part; clock: (t: number) => number }) {
  const ctx = useContext(InteractionCtx)!;
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const [x0, y0, z0, x1, y1, z1] = part.box;
  const size = useMemo<[number, number, number]>(() => [x1 - x0, y1 - y0, z1 - z0], [x0, y0, z0, x1, y1, z1]);
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const tl = revealTimeline[part.group];
  const delay = tl.start + (revealIndex.get(part.id) ?? 0) * tl.stagger;
  const isSelected = Boolean(part.hotspot && ctx.selected === part.hotspot);
  const isHovered = Boolean(part.hotspot && ctx.hovered === part.hotspot);
  const lift = useRef(0);

  useFrame((state, delta) => {
    const t = clock(state.clock.elapsedTime);
    const k = t === Infinity ? 1 : easeOut((t - delay) / tl.duration);
    const g = group.current;
    if (g) {
      g.visible = k > 0;
      const liftTarget = part.hotspot && (isHovered || isSelected) && part.group !== "roof" ? 0.06 : 0;
      lift.current += (liftTarget - lift.current) * Math.min(1, delta * 10);
      g.position.y = center[1] + (1 - k) * (part.group === "foundation" ? 0.6 : 2.2) + lift.current;
      g.scale.setScalar(0.94 + 0.06 * k);
    }
    const m = material.current;
    if (!m) return;
    if (part.kind === "lamp") {
      m.emissiveIntensity = 2.4 * k;
    } else if (part.hotspot) {
      const target = isSelected ? 0.35 : isHovered ? 0.22 : 0;
      m.emissiveIntensity += (target - m.emissiveIntensity) * Math.min(1, delta * 8);
      m.emissive.copy(isSelected ? BRAND : SUN);
    }
  });

  const handlers = part.hotspot
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          ctx.onSelect(part.hotspot!);
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          if (!ctx.finePointer) return;
          e.stopPropagation();
          ctx.onHover(part.hotspot!);
          document.body.style.cursor = "pointer";
        },
        onPointerOut: () => {
          if (!ctx.finePointer) return;
          ctx.onHover(null);
          document.body.style.cursor = "";
        },
      }
    : {};

  const mat = <PartMaterial part={part} size={size} matRef={material} lowPower={ctx.lowPower} />;
  const outline = isSelected ? <Outlines thickness={0.03} color="#0d6b62" transparent opacity={0.9} /> : null;
  const shadow = { castShadow: part.castShadow && part.kind !== "glass", receiveShadow: part.kind !== "glass" && part.kind !== "lamp" };

  let mesh: React.ReactNode;
  if (part.kind === "cylinder") {
    const r = part.rotation ? Math.min(size[0], size[1]) / 2 : Math.min(size[0], size[2]) / 2;
    mesh = (
      <mesh {...shadow} rotation={part.rotation} {...handlers}>
        <cylinderGeometry args={[r, r, part.rotation ? size[2] : size[1], 40]} />
        {mat}
        {outline}
      </mesh>
    );
  } else if (part.kind === "sphere") {
    mesh = (
      <mesh {...shadow} scale={[size[0] / 2, size[1] / 2, size[2] / 2]} {...handlers}>
        <icosahedronGeometry args={[1, 2]} />
        {mat}
      </mesh>
    );
  } else if (part.rounded) {
    mesh = (
      <RoundedBox args={size} radius={Math.min(0.06, ...size.map((s) => s / 2.2))} smoothness={3} {...shadow} {...handlers}>
        {mat}
        {outline}
      </RoundedBox>
    );
  } else {
    mesh = (
      <mesh {...shadow} rotation={part.rotation} {...handlers}>
        <boxGeometry args={size} />
        {mat}
        {outline}
      </mesh>
    );
  }

  return (
    <group ref={group} position={center} visible={false}>
      {mesh}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Markers, tooltip and selection halo
// ---------------------------------------------------------------------------

function Marker({ k, clock }: { k: HotspotKey; clock: (t: number) => number }) {
  const ctx = useContext(InteractionCtx)!;
  const ref = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const h = hotspotByKey[k];
  const active = ctx.selected === k || ctx.hovered === k;
  const scaleTarget = useMemo(() => new THREE.Vector3(), []);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    const t = clock(state.clock.elapsedTime);
    g.visible = t === Infinity || t > 1.6;
    const time = state.clock.elapsedTime;
    g.position.set(h.anchor[0], h.anchor[1] + Math.sin(time * 1.8 + h.anchor[0]) * 0.035, h.anchor[2]);
    const s = active ? 1.3 : 1;
    g.scale.lerp(scaleTarget.set(s, s, s), 0.18);
    if (halo.current) {
      const p = (time * 0.7 + h.anchor[2] * 0.1) % 1;
      halo.current.scale.setScalar(1 + p * 1.4);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (active ? 0.7 : 0.5);
    }
  });
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        ctx.onSelect(k);
      }}
      onPointerOver={(e) => {
        if (!ctx.finePointer) return;
        e.stopPropagation();
        ctx.onHover(k);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        if (!ctx.finePointer) return;
        ctx.onHover(null);
        document.body.style.cursor = "";
      }}
    >
      <mesh>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.1} clearcoat={1} clearcoatRoughness={0.05} transmission={ctx.lowPower ? 0 : 0.2} thickness={0.25} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.085, 24, 24]} />
        <meshStandardMaterial color={active ? "#f0b955" : "#13897d"} emissive={active ? "#f0b955" : "#13897d"} emissiveIntensity={1.1} toneMapped={false} />
      </mesh>
      <Billboard>
        <mesh ref={halo}>
          <ringGeometry args={[0.18, 0.22, 48]} />
          <meshBasicMaterial color={active ? "#f0b955" : "#13897d"} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Soft glowing ring on the floor under the selected item. */
function SelectionHalo() {
  const ctx = useContext(InteractionCtx)!;
  const ref = useRef<THREE.Mesh>(null);
  const key = ctx.selected;
  useFrame((state) => {
    const m = ref.current;
    if (!m || !key) return;
    const h = hotspotByKey[key];
    const onRoof = key === "solar";
    m.position.set(h.anchor[0], onRoof ? 2.77 : 0.045, h.anchor[2] + (onRoof ? 0 : 0.15));
    m.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.06);
  });
  if (!key) return null;
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <ringGeometry args={[0.45, 0.62, 64]} />
      <meshBasicMaterial color="#14a093" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Camera, lights, environment
// ---------------------------------------------------------------------------

function CameraRig({
  selected,
  reducedMotion,
  finePointer,
  hovering,
  houseRef,
}: {
  selected: HotspotKey | null;
  reducedMotion: boolean;
  finePointer: boolean;
  hovering: boolean;
  houseRef: React.RefObject<THREE.Group | null>;
}) {
  const target = useRef(new THREE.Vector3(0, 1.4, -0.6));
  const desired = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(10, 9, 10), []);
  // Camera's screen-right direction for this isometric view, used to keep a selected item
  // clear of the details panel that slides in from the right on wider screens.
  const screenRight = useMemo(() => new THREE.Vector3(1, 0, -1).normalize(), []);

  useFrame((state, delta) => {
    const { size, pointer } = state;
    const base = Math.min(size.width / 13.2, size.height / 10.8);
    const focus = selected ? hotspotByKey[selected].anchor : null;
    const zoom = focus ? base * 1.55 : base;
    if (focus && houseRef.current) {
      desired.set(focus[0], focus[1] - 0.45, focus[2]).applyMatrix4(houseRef.current.matrixWorld);
      if (size.width >= 640) desired.addScaledVector(screenRight, 175 / zoom);
    } else {
      desired.set(0, 1.4, -0.6);
    }
    // Starts slightly wide (the intro dolly) and glides to the framing; instant under reduced motion.
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 2.8);
    target.current.lerp(desired, k);
    const cam = state.camera as THREE.OrthographicCamera;
    cam.zoom += (zoom - cam.zoom) * k;
    cam.position.copy(target.current).add(offset);
    cam.lookAt(target.current);
    cam.updateProjectionMatrix();

    if (houseRef.current) {
      const drift = reducedMotion || hovering ? 0 : Math.sin(state.clock.elapsedTime * 0.22) * 0.04;
      const parallax = finePointer && !reducedMotion && !selected ? pointer.x * 0.07 : 0;
      const ry = drift + parallax;
      houseRef.current.rotation.y += (ry - houseRef.current.rotation.y) * (reducedMotion ? 1 : 0.05);
    }
  });
  return null;
}

function Lights({ lowPower, clock }: { lowPower: boolean; clock: (t: number) => number }) {
  const warm = useRef<THREE.PointLight[]>([]);
  useFrame((state) => {
    const t = clock(state.clock.elapsedTime);
    const k = t === Infinity ? 1 : easeOut((t - 1.4) / 0.5);
    warm.current.forEach((l) => l && (l.intensity = 2.6 * k));
  });
  const roomLights: [number, number, number][] = lowPower
    ? []
    : [
        [-2.2, 2.1, -1.6],
        [-2.5, 2.0, 1.5],
        [2.0, 1.9, 2.0],
      ];
  return (
    <>
      <hemisphereLight args={["#fff4e0", "#9fb3a3", 0.35]} />
      <directionalLight
        position={[6, 11, 3.5]}
        intensity={2.3}
        color="#fff0d2"
        castShadow={!lowPower}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
      />
      {roomLights.map((pos, i) => (
        <pointLight
          key={i}
          ref={(el) => {
            if (el) warm.current[i] = el;
          }}
          position={pos}
          color="#ffcf8a"
          intensity={0}
          distance={4.2}
          decay={1.6}
        />
      ))}
      {/* Procedural studio lighting for soft reflections — no HDR file is downloaded. */}
      <Environment resolution={lowPower ? 32 : 128} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.4} color="#fff3df" position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[14, 14, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#dcefe8" position={[-7, 2.5, 3]} rotation-y={Math.PI / 2} scale={[10, 5, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffd8a0" position={[7, 4, 7]} scale={3.5} />
      </Environment>
    </>
  );
}

function Home(props: {
  reveal: boolean;
  reducedMotion: boolean;
  lowPower: boolean;
  selected: HotspotKey | null;
  hovered: HotspotKey | null;
  finePointer: boolean;
  onReady: () => void;
}) {
  const playReveal = props.reveal && !props.reducedMotion;
  const clock = useRevealClock(playReveal);
  const house = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const frames = useRef(0);
  const [settled, setSettled] = useState(!playReveal);

  // Signal readiness only after real frames have been drawn, so the static drawing never
  // disappears before the 3D home is visible.
  useFrame(() => {
    if (frames.current < 3 && ++frames.current === 2) props.onReady();
  });
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (e: Event) => e.preventDefault();
    canvas.addEventListener("webglcontextlost", lost);
    const t = playReveal ? window.setTimeout(() => setSettled(true), (REVEAL_TOTAL + 0.2) * 1000) : undefined;
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      if (t) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Lights lowPower={props.lowPower} clock={clock} />
      <group ref={house}>
        {parts.map((p) => (
          <PartMesh key={p.id} part={p} clock={clock} />
        ))}
        {hotspots.map((h) => (
          <Marker key={h.key} k={h.key} clock={clock} />
        ))}
        <SelectionHalo />
        {/* Grounding shadow, baked once after the house has settled. */}
        {settled && !props.lowPower && (
          <ContactShadows position={[0, -0.244, 0]} scale={13} blur={2.6} opacity={0.38} far={3.5} resolution={512} frames={1} color="#243a32" />
        )}
      </group>
      <CameraRig selected={props.selected} reducedMotion={props.reducedMotion} finePointer={props.finePointer} hovering={Boolean(props.hovered)} houseRef={house} />
    </>
  );
}

export default function HomeScene(props: HomeSceneProps) {
  const finePointer = typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;
  const interaction: Interaction = {
    selected: props.selected,
    hovered: props.hovered,
    onSelect: props.onSelect,
    onHover: props.onHover,
    finePointer,
    lowPower: props.lowPower,
  };
  useEffect(() => () => void (document.body.style.cursor = ""), []);
  return (
    <Canvas
      orthographic
      camera={{ position: [10, 9.6, 9.4], zoom: 34, near: -50, far: 200 }}
      dpr={props.lowPower ? [1, 1.25] : [1, 1.75]}
      shadows={!props.lowPower}
      frameloop={props.active ? "always" : "never"}
      gl={{ antialias: true, powerPreference: props.lowPower ? "low-power" : "high-performance", alpha: true }}
      onCreated={(state) => {
        state.gl.toneMappingExposure = 1.06;
      }}
      onPointerMissed={() => props.onSelect(null)}
      aria-hidden
      style={{ touchAction: "pan-y" }}
    >
      <InteractionCtx.Provider value={interaction}>
        <Home
          reveal={props.reveal}
          reducedMotion={props.reducedMotion}
          lowPower={props.lowPower}
          selected={props.selected}
          hovered={props.hovered}
          finePointer={finePointer}
          onReady={props.onReady}
        />
      </InteractionCtx.Provider>
    </Canvas>
  );
}
