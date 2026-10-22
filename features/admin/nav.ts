import { BarChart3, CalendarRange, HardHat, LayoutDashboard, Map, MessageSquareWarning, Tags, Users, Wallet } from "lucide-react";
import type { NavItem } from "@/components/domain/workspace-shell";

export const adminNav = (): NavItem[] => [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings", label: "Booking queue", icon: CalendarRange },
  { href: "/admin/technicians", label: "Professionals", icon: HardHat },
  { href: "/admin/complaints", label: "Complaints", icon: MessageSquareWarning },
  { href: "/admin/coverage", label: "Cities & areas", icon: Map },
  { href: "/admin/catalogue", label: "Services & pricing", icon: Tags },
  { href: "/admin/payouts", label: "Payouts & invoices", icon: Wallet },
  { href: "/admin/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/admin/users", label: "Users & audit", icon: Users },
];
