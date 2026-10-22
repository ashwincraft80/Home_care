import { CalendarCheck2, House, KeyRound, LifeBuoy, ReceiptText, UserRound, UsersRound, Wrench } from "lucide-react";
import type { NavItem } from "@/components/domain/workspace-shell";
import type { Dictionary } from "@/lib/i18n/dictionaries";

export const customerNav = (d: Dictionary): NavItem[] => [
  { href: "/account", label: d.account.overview, icon: House, exact: true },
  { href: "/account/bookings", label: d.account.bookings, icon: CalendarCheck2 },
  { href: "/account/assets", label: d.account.appliances, icon: Wrench },
  { href: "/account/invoices", label: d.account.invoices, icon: ReceiptText },
  { href: "/account/household", label: d.account.household, icon: UsersRound },
  { href: "/account/rented", label: d.account.rented, icon: KeyRound },
  { href: "/support", label: d.account.support, icon: LifeBuoy },
  { href: "/account/profile", label: d.account.profile, icon: UserRound },
];
