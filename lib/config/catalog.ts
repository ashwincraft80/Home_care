/**
 * Default service catalogue and asset service guidance.
 *
 * Categories are seeded into the database and then managed by admins
 * (prices, warranty days, active flag). The values below are illustrative
 * starting points for the launch city — they are NOT market research and must
 * be reviewed by operations before launch.
 */

export type ServiceIconKey =
  | "electrician"
  | "plumbing"
  | "ac"
  | "appliance"
  | "ro"
  | "inverter"
  | "solar"
  | "general";

export interface CategorySeed {
  slug: string;
  name: string;
  nameHi: string;
  icon: ServiceIconKey;
  shortDescription: string;
  description: string;
  commonJobs: string[];
  visitFeePaise: number;
  indicativeMinPaise: number | null;
  indicativeMaxPaise: number | null;
  warrantyDays: number;
  warrantyExclusions: string;
  /** Asset types this category typically services (used to suggest assets in booking). */
  assetTypes: AssetType[];
  sortOrder: number;
}

export const assetTypes = [
  "AC",
  "GEYSER",
  "RO",
  "INVERTER",
  "SOLAR",
  "WASHING_MACHINE",
  "REFRIGERATOR",
  "WIRING",
  "PLUMBING_FIXTURE",
  "OTHER",
] as const;
export type AssetType = (typeof assetTypes)[number];

export const assetTypeLabels: Record<AssetType, string> = {
  AC: "Air conditioner",
  GEYSER: "Geyser / water heater",
  RO: "RO / water purifier",
  INVERTER: "Inverter & battery",
  SOLAR: "Rooftop solar system",
  WASHING_MACHINE: "Washing machine",
  REFRIGERATOR: "Refrigerator",
  WIRING: "Electrical wiring / DB",
  PLUMBING_FIXTURE: "Plumbing fixture",
  OTHER: "Other",
};

/**
 * Service guidance used to suggest a "next recommended service" date.
 * These are general operations defaults configured by the business — not
 * manufacturer claims. The UI always says "suggested by HomeCare" and asks
 * customers to follow their manufacturer's manual where it differs.
 */
export const serviceGuidance: Record<AssetType, { intervalDays: number | null; note: string }> = {
  AC: { intervalDays: 180, note: "General cleaning before and after peak summer use." },
  GEYSER: { intervalDays: 365, note: "Annual check of element, thermostat and safety valve." },
  RO: { intervalDays: 120, note: "Filter check; replacement depends on water quality and usage." },
  INVERTER: { intervalDays: 180, note: "Battery terminal and water-level check for tubular batteries." },
  SOLAR: { intervalDays: 90, note: "Panel cleaning and visual inspection; dust levels vary by site." },
  WASHING_MACHINE: { intervalDays: 365, note: "Drum, hose and drain check." },
  REFRIGERATOR: { intervalDays: null, note: "Service when you notice a problem." },
  WIRING: { intervalDays: 730, note: "Periodic safety inspection of the distribution board." },
  PLUMBING_FIXTURE: { intervalDays: null, note: "Service when you notice a leak or blockage." },
  OTHER: { intervalDays: null, note: "No default guidance." },
};

const r = (rupees: number) => rupees * 100;

export const categorySeeds: CategorySeed[] = [
  {
    slug: "electrician",
    name: "Electrician",
    nameHi: "इलेक्ट्रीशियन",
    icon: "electrician",
    shortDescription: "Switches, wiring faults, fittings and safety checks.",
    description:
      "For tripping MCBs, sparking switches, fan and light installation, new points and distribution-board checks. The professional diagnoses the fault first and gives you an itemised estimate before any extra work.",
    commonJobs: ["MCB keeps tripping", "Fan or light installation", "Switchboard repair", "New power point"],
    visitFeePaise: r(149),
    indicativeMinPaise: r(149),
    indicativeMaxPaise: r(1500),
    warrantyDays: 30,
    warrantyExclusions:
      "Does not cover faults in parts supplied by the customer, damage from voltage surges, or new faults elsewhere in the wiring.",
    assetTypes: ["WIRING"],
    sortOrder: 1,
  },
  {
    slug: "plumbing",
    name: "Plumbing",
    nameHi: "प्लंबिंग",
    icon: "plumbing",
    shortDescription: "Leaks, blockages, taps, flush tanks and fittings.",
    description:
      "Leaking taps, blocked drains, flush-tank repairs, fitting replacement and pipe leaks. Concealed-pipe work needs an inspection first and may need wall opening, which will be in the estimate.",
    commonJobs: ["Leaking tap", "Blocked drain", "Flush tank repair", "Tap or mixer installation"],
    visitFeePaise: r(149),
    indicativeMinPaise: r(149),
    indicativeMaxPaise: r(1800),
    warrantyDays: 30,
    warrantyExclusions:
      "Does not cover concealed pipes not opened during the job, blockages caused after the visit, or customer-supplied fittings.",
    assetTypes: ["PLUMBING_FIXTURE", "GEYSER"],
    sortOrder: 2,
  },
  {
    slug: "ac-service",
    name: "AC service & repair",
    nameHi: "एसी सर्विस और रिपेयर",
    icon: "ac",
    shortDescription: "Cleaning, cooling issues, gas top-up and installation.",
    description:
      "Split and window AC cleaning, cooling problems, water leakage, gas pressure checks and installation or uninstallation. Gas refills are only done after a leak check and your approval.",
    commonJobs: ["Routine cleaning", "Not cooling", "Water leaking from indoor unit", "Installation"],
    visitFeePaise: r(199),
    indicativeMinPaise: r(499),
    indicativeMaxPaise: r(3500),
    warrantyDays: 30,
    warrantyExclusions:
      "Gas refills are covered only if no new leak is found. Does not cover compressor or PCB failures unless those parts were replaced in this job.",
    assetTypes: ["AC"],
    sortOrder: 3,
  },
  {
    slug: "appliance-repair",
    name: "Appliance installation & repair",
    nameHi: "उपकरण इंस्टॉलेशन और रिपेयर",
    icon: "appliance",
    shortDescription: "Washing machines, refrigerators, geysers and more.",
    description:
      "Installation and repair for washing machines, refrigerators, geysers, chimneys and microwaves. If the appliance is under manufacturer warranty, check with the brand first — we will tell you if a repair could affect it.",
    commonJobs: ["Washing machine not draining", "Fridge not cooling", "Geyser installation", "Chimney cleaning"],
    visitFeePaise: r(199),
    indicativeMinPaise: r(199),
    indicativeMaxPaise: r(4000),
    warrantyDays: 30,
    warrantyExclusions:
      "Does not cover parts not replaced in this job or damage from misuse, water ingress or voltage fluctuation.",
    assetTypes: ["WASHING_MACHINE", "REFRIGERATOR", "GEYSER"],
    sortOrder: 4,
  },
  {
    slug: "ro-purifier",
    name: "RO / water purifier",
    nameHi: "आरओ / वॉटर प्यूरीफायर",
    icon: "ro",
    shortDescription: "Filter changes, servicing and installation.",
    description:
      "Routine service, filter and membrane replacement, low-flow and taste issues, and installation. Filter replacement intervals depend on your water quality and usage.",
    commonJobs: ["Routine service", "Filter replacement", "Low water flow", "Installation"],
    visitFeePaise: r(149),
    indicativeMinPaise: r(349),
    indicativeMaxPaise: r(2500),
    warrantyDays: 30,
    warrantyExclusions: "Filters and membranes are consumables and wear with use; not covered beyond installation defects.",
    assetTypes: ["RO"],
    sortOrder: 5,
  },
  {
    slug: "inverter-battery",
    name: "Inverter & battery",
    nameHi: "इन्वर्टर और बैटरी",
    icon: "inverter",
    shortDescription: "Backup issues, battery checks and installation.",
    description:
      "Backup time dropping, inverter not charging, battery water top-up, terminal cleaning and installation. Battery replacement is quoted separately with brand and capacity shown.",
    commonJobs: ["Backup time reduced", "Not charging", "Battery water top-up", "New installation"],
    visitFeePaise: r(149),
    indicativeMinPaise: r(149),
    indicativeMaxPaise: r(2000),
    warrantyDays: 30,
    warrantyExclusions: "Battery capacity loss due to age is not covered. New batteries carry the manufacturer's warranty only.",
    assetTypes: ["INVERTER"],
    sortOrder: 6,
  },
  {
    slug: "rooftop-solar",
    name: "Rooftop solar maintenance",
    nameHi: "रूफटॉप सोलर मेंटेनेंस",
    icon: "solar",
    shortDescription: "Panel cleaning, inspection and coordination for repairs.",
    description:
      "Panel cleaning, visual inspection of panels, wiring and mounting, and an inverter status check. Where a fault needs the original installer or manufacturer, we help you coordinate and keep the record in your home passport.",
    commonJobs: ["Panel cleaning", "Generation has dropped", "Inverter error code", "Annual inspection"],
    visitFeePaise: r(299),
    indicativeMinPaise: r(799),
    indicativeMaxPaise: r(3000),
    warrantyDays: 15,
    warrantyExclusions:
      "Inspection and cleaning only. Does not cover panel, inverter or structural defects, which remain under the installer's or manufacturer's warranty.",
    assetTypes: ["SOLAR"],
    sortOrder: 7,
  },
  {
    slug: "general-maintenance",
    name: "General installation & maintenance",
    nameHi: "सामान्य इंस्टॉलेशन और मेंटेनेंस",
    icon: "general",
    shortDescription: "Mounting, fixtures, small repairs and handyman jobs.",
    description:
      "TV and shelf mounting, curtain rods, door and hinge repairs, and other small jobs around the home. For larger renovation work, we will tell you if it is outside our scope.",
    commonJobs: ["TV wall mounting", "Curtain rod installation", "Door alignment", "Furniture assembly"],
    visitFeePaise: r(149),
    indicativeMinPaise: r(149),
    indicativeMaxPaise: r(1500),
    warrantyDays: 15,
    warrantyExclusions: "Does not cover wall or surface damage from pre-existing conditions.",
    assetTypes: ["OTHER"],
    sortOrder: 8,
  },
];
