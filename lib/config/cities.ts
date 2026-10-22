/**
 * Initial coverage seeded into the database. After seeding, operations manage cities, areas,
 * pincodes and per-area services from the admin console — this file is only the starting point.
 *
 * Launch strategy: one city in PILOT with a few concentrated LIVE areas. Other areas and cities
 * exist as PLANNED / COMING_SOON so the waitlist can measure demand, but they cannot be booked.
 * Pincode lists are illustrative and must be verified by operations before launch.
 */
export interface CitySeed {
  slug: string;
  name: string;
  state: string;
  timeZone: string;
  status: "LIVE" | "PILOT" | "COMING_SOON" | "PAUSED";
  supportPhone: string | null;
  supportEmail: string | null;
  areas: {
    name: string;
    status: "LIVE" | "PAUSED" | "PLANNED";
    pincodes: string[];
    /** Category slugs enabled in this area. "*" = all active categories. */
    categories: string[] | "*";
  }[];
}

export const citySeeds: CitySeed[] = [
  {
    slug: "bengaluru",
    name: "Bengaluru",
    state: "Karnataka",
    timeZone: "Asia/Kolkata",
    status: "PILOT",
    supportPhone: null,
    supportEmail: null,
    areas: [
      { name: "Koramangala", status: "LIVE", pincodes: ["560034", "560095"], categories: "*" },
      { name: "HSR Layout", status: "LIVE", pincodes: ["560102"], categories: "*" },
      {
        name: "Indiranagar",
        status: "LIVE",
        pincodes: ["560038", "560008"],
        categories: ["electrician", "plumbing", "ac-service", "appliance-repair", "ro-purifier", "inverter-battery", "general-maintenance"],
      },
      { name: "Whitefield", status: "PLANNED", pincodes: ["560066", "560048"], categories: [] },
      { name: "Jayanagar", status: "PLANNED", pincodes: ["560011", "560041"], categories: [] },
    ],
  },
  {
    slug: "pune",
    name: "Pune",
    state: "Maharashtra",
    timeZone: "Asia/Kolkata",
    status: "COMING_SOON",
    supportPhone: null,
    supportEmail: null,
    areas: [{ name: "Baner", status: "PLANNED", pincodes: ["411045"], categories: [] }],
  },
  {
    slug: "hyderabad",
    name: "Hyderabad",
    state: "Telangana",
    timeZone: "Asia/Kolkata",
    status: "COMING_SOON",
    supportPhone: null,
    supportEmail: null,
    areas: [{ name: "Gachibowli", status: "PLANNED", pincodes: ["500032"], categories: [] }],
  },
];
