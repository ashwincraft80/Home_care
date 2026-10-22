/**
 * Selectable parts of the 3D home and the real service categories they lead to.
 * Category slugs must exist in lib/config/catalog.ts. Options become a pre-filled problem
 * description in the booking flow (?issue=…), never a price promise.
 */
export type HotspotKey = "ac" | "plumbing" | "geyser" | "purifier" | "electrical" | "appliances" | "inverter" | "solar" | "general";

export interface Hotspot {
  key: HotspotKey;
  label: string;
  room: string;
  categorySlug: string;
  description: string;
  options: string[];
  nextStep: string;
  /** Marker position in scene units (shared by the 3D scene and the static fallback). */
  anchor: [number, number, number];
}

export const hotspots: Hotspot[] = [
  {
    key: "ac",
    label: "Air conditioner",
    room: "Bedroom",
    categorySlug: "ac-service",
    description: "Servicing before summer, weak cooling, water dripping from the indoor unit, or installation.",
    options: ["Routine servicing", "Not cooling properly", "Water leaking from indoor unit", "Installation or uninstallation"],
    nextStep: "Gas top-ups only after a leak check and your approval.",
    anchor: [-2.1, 2.55, -2.7],
  },
  {
    key: "plumbing",
    label: "Taps, basin & drains",
    room: "Bathroom",
    categorySlug: "plumbing",
    description: "Leaking taps, blocked drains, running flush tanks and fitting replacements.",
    options: ["Leaking tap", "Blocked drain", "Flush tank keeps running", "Tap or mixer installation"],
    nextStep: "The plumber inspects first and sends an itemised estimate before extra work.",
    anchor: [1.15, 1.35, -2.6],
  },
  {
    key: "geyser",
    label: "Geyser",
    room: "Bathroom",
    categorySlug: "appliance-repair",
    description: "No hot water, tripping, leaks or a new geyser installation.",
    options: ["No hot water", "Geyser trips the MCB", "Leaking geyser", "New geyser installation"],
    nextStep: "If it's under manufacturer warranty, check with the brand first — we'll remind you.",
    anchor: [3.2, 2.55, -2.65],
  },
  {
    key: "purifier",
    label: "Water purifier",
    room: "Kitchen",
    categorySlug: "ro-purifier",
    description: "Routine RO service, filter changes, low flow or taste issues.",
    options: ["Routine service", "Filter replacement", "Low water flow", "Water tastes different"],
    nextStep: "Filter life depends on your water; the professional will show you before replacing.",
    anchor: [3.22, 1.95, 0.3],
  },
  {
    key: "appliances",
    label: "Kitchen & laundry appliances",
    room: "Kitchen",
    categorySlug: "appliance-repair",
    description: "Washing machine, refrigerator, chimney and microwave repairs or installation.",
    options: ["Washing machine not draining", "Fridge not cooling", "Chimney cleaning", "Appliance installation"],
    nextStep: "You approve any parts before they're fitted.",
    anchor: [3.6, 1.2, 2.5],
  },
  {
    key: "electrical",
    label: "Wiring & switchboard",
    room: "Living room",
    categorySlug: "electrician",
    description: "Tripping MCBs, sparking switches, fans, lights and new power points.",
    options: ["MCB keeps tripping", "Switch or socket not working", "Fan or light installation", "New power point"],
    nextStep: "Diagnosis first, then an itemised estimate before extra work.",
    anchor: [-3.6, 2.25, 0.5],
  },
  {
    key: "inverter",
    label: "Inverter & battery",
    room: "Living room",
    categorySlug: "inverter-battery",
    description: "Backup time dropping, not charging, battery top-up or a new installation.",
    options: ["Backup time has dropped", "Inverter not charging", "Battery water top-up", "New inverter installation"],
    nextStep: "Battery replacements are quoted with brand and capacity shown.",
    anchor: [-3.2, 0.9, 0.38],
  },
  {
    key: "solar",
    label: "Rooftop solar",
    room: "Roof",
    categorySlug: "rooftop-solar",
    description: "Panel cleaning, generation drops, inverter error codes and annual inspection.",
    options: ["Panel cleaning", "Generation has dropped", "Inverter shows an error", "Annual inspection"],
    nextStep: "Where the installer or manufacturer is needed, we help coordinate and keep the record.",
    anchor: [0, 3.6, -4.0],
  },
  {
    key: "general",
    label: "Doors, mounting & small jobs",
    room: "Entrance",
    categorySlug: "general-maintenance",
    description: "TV and shelf mounting, curtain rods, door alignment and furniture assembly.",
    options: ["TV wall mounting", "Door not closing properly", "Curtain rod installation", "Furniture assembly"],
    nextStep: "Larger renovation work? We'll tell you if it's outside our scope.",
    anchor: [-3.6, 2.4, 2.45],
  },
];

export const hotspotByKey = Object.fromEntries(hotspots.map((h) => [h.key, h])) as Record<HotspotKey, Hotspot>;

export function bookingHref(h: Hotspot, option?: string): string {
  const params = new URLSearchParams({ category: h.categorySlug, from: "explorer" });
  if (option) params.set("issue", option);
  return `/book?${params.toString()}`;
}
