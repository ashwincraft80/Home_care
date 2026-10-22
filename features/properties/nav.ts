import { Building, ClipboardList, LayoutDashboard, LifeBuoy, ReceiptText } from "lucide-react";
import type { NavItem } from "@/components/domain/workspace-shell";

export const pmNav = (): NavItem[] => [
  { href: "/pm", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/pm/properties", label: "Properties", icon: Building },
  { href: "/pm/requests", label: "Requests", icon: ClipboardList },
  { href: "/pm/invoices", label: "Invoices & history", icon: ReceiptText },
  { href: "/support", label: "Support", icon: LifeBuoy },
];
