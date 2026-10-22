import { BriefcaseBusiness, ClipboardList, LifeBuoy, UserRound, Wallet } from "lucide-react";
import type { NavItem } from "@/components/domain/workspace-shell";

export const technicianNav = (): NavItem[] => [
  { href: "/tech", label: "Today", icon: BriefcaseBusiness, exact: true },
  { href: "/tech/offers", label: "Available jobs", icon: ClipboardList },
  { href: "/tech/jobs", label: "My jobs", icon: ClipboardList },
  { href: "/tech/earnings", label: "Earnings", icon: Wallet },
  { href: "/tech/profile", label: "Profile & availability", icon: UserRound },
  { href: "/support", label: "Support & disputes", icon: LifeBuoy },
];
