import { hotspots, type HotspotKey } from "./hotspots";
import { parts, type Part } from "./layout";

/**
 * Static isometric drawing of the same home (no WebGL). Used while the 3D scene loads, when WebGL
 * is unavailable, on low-power / data-saver devices, and as the server-rendered first paint.
 * Hotspots are real <button>s, so it is fully keyboard and screen-reader accessible.
 */
const S = 22;
const COS = Math.cos(Math.PI / 6);
const project = (x: number, y: number, z: number): [number, number] => [(x - z) * COS * S, (x + z) * 0.5 * S - y * S];

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

const pts = (list: [number, number, number][]) => list.map(([x, y, z]) => project(x, y, z).map((v) => v.toFixed(1)).join(",")).join(" ");

const drawable = parts.filter((p) => !p.noSvg);
const order = (p: Part) => (p.group === "foundation" ? -100 : 0) + p.box[0] + p.box[2] + p.box[1] * 0.8;
const sorted = [...drawable].sort((a, b) => order(a) - order(b));

// View box from all projected corners.
const corners = drawable.flatMap((p) => {
  const [x0, y0, z0, x1, y1, z1] = p.box;
  return [project(x0, y1, z0), project(x1, y0, z1), project(x0, y0, z1), project(x1, y1, z0), project(x1, y0, z0), project(x0, y0, z0)];
});
const minX = Math.min(...corners.map((c) => c[0])) - 12;
const maxX = Math.max(...corners.map((c) => c[0])) + 12;
const minY = Math.min(...corners.map((c) => c[1])) - 28;
const maxY = Math.max(...corners.map((c) => c[1])) + 12;
export const staticViewBox = { minX, minY, width: maxX - minX, height: maxY - minY };

function Shape({ part, selected }: { part: Part; selected: boolean }) {
  const [x0, y0, z0, x1, y1, z1] = part.box;
  const glass = part.kind === "glass";
  const opacity = glass ? 0.55 : 1;
  const stroke = selected ? "#0d6b62" : "rgba(19,36,31,0.12)";
  const strokeWidth = selected ? 1.6 : 0.5;
  if (part.kind === "sphere") {
    const [cx, cy] = project((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const r = ((x1 - x0) / 2) * S;
    return <circle cx={cx} cy={cy} r={r} fill={part.color} stroke={stroke} strokeWidth={strokeWidth} />;
  }
  const color = part.kind === "lamp" ? "#f7cf86" : part.color;
  return (
    <g opacity={opacity}>
      <polygon points={pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} fill={color} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])} fill={shade(color, 0.07)} stroke={stroke} strokeWidth={strokeWidth} />
      <polygon points={pts([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]])} fill={shade(color, 0.15)} stroke={stroke} strokeWidth={strokeWidth} />
    </g>
  );
}

export function StaticHome({
  selected,
  onSelect,
  labelFor,
}: {
  selected: HotspotKey | null;
  onSelect?: (key: HotspotKey) => void;
  labelFor?: (key: HotspotKey) => string;
}) {
  const { minX: vx, minY: vy, width, height } = staticViewBox;
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`${vx} ${vy} ${width} ${height}`} className="h-full w-full" role="img" aria-label="Illustration of a home with rooms, appliances and rooftop solar">
        {sorted.map((p) => (
          <Shape key={p.id} part={p} selected={Boolean(p.hotspot && p.hotspot === selected)} />
        ))}
      </svg>
      {onSelect &&
        hotspots.map((h) => {
          const [sx, sy] = project(...h.anchor);
          const left = ((sx - vx) / width) * 100;
          const top = ((sy - vy) / height) * 100;
          const active = selected === h.key;
          return (
            <button
              key={h.key}
              type="button"
              onClick={() => onSelect(h.key)}
              aria-pressed={active}
              aria-label={labelFor ? labelFor(h.key) : h.label}
              className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full p-2 focus-visible:outline-2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span
                className={`flex size-5 items-center justify-center rounded-full ring-2 transition-transform duration-150 group-hover:scale-110 ${
                  active ? "scale-125 bg-brand ring-sun" : "bg-surface ring-brand"
                }`}
              >
                <span className={`size-2 rounded-full ${active ? "bg-sun" : "bg-brand"}`} />
              </span>
            </button>
          );
        })}
    </div>
  );
}
