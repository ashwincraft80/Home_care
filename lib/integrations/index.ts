import "server-only";
import { isDemoMode } from "@/lib/config/env";

/**
 * External integration boundary. V1 ships with NO live SMS, email, WhatsApp, payment or maps
 * provider. Each interface below has a "not configured" implementation; in demo mode messages are
 * simulated (logged without personal data). Implement a provider class and register it here once
 * credentials and contracts exist.
 */

export type IntegrationState = "configured" | "simulated" | "not_configured";

export interface MessageChannel {
  readonly key: "sms" | "email" | "whatsapp";
  readonly label: string;
  state(): IntegrationState;
  /** Returns false when not delivered. Never throws for "not configured". */
  send(recipientUserId: string, template: string): Promise<boolean>;
}

class UnconfiguredChannel implements MessageChannel {
  constructor(
    readonly key: "sms" | "email" | "whatsapp",
    readonly label: string,
  ) {}
  state(): IntegrationState {
    return isDemoMode() ? "simulated" : "not_configured";
  }
  async send(recipientUserId: string, template: string): Promise<boolean> {
    if (isDemoMode()) {
      console.info(`[demo:${this.key}] simulated "${template}" to user ${recipientUserId.slice(0, 8)}…`);
    }
    return false;
  }
}

export const channels: MessageChannel[] = [
  new UnconfiguredChannel("sms", "SMS / OTP"),
  new UnconfiguredChannel("email", "Email"),
  new UnconfiguredChannel("whatsapp", "WhatsApp Business"),
];

export interface PaymentGateway {
  readonly label: string;
  state(): IntegrationState;
  createOrder(input: { invoiceId: string; amountPaise: number }): Promise<{ orderId: string; checkoutUrl: string }>;
}

/** Real payments are disabled by default. Add a sandbox gateway first; see docs/launch-checklist.md. */
export const paymentGateway: PaymentGateway = {
  label: "Online payments",
  state: () => "not_configured",
  async createOrder() {
    throw new Error("Online payment is not configured. Customers pay the professional after service.");
  },
};

export interface Geocoder {
  readonly label: string;
  state(): IntegrationState;
  isServiceable(locality: string): boolean;
}

/**
 * Serviceability is decided by pincode → service area in the database (features/locations).
 * A maps/geocoding provider (address autocomplete, coordinates) can be added behind this interface.
 */
export const geocoder: Geocoder = {
  label: "Maps & geocoding",
  state: () => "not_configured",
  isServiceable: () => {
    throw new Error("Use features/locations/service.coverageFor(pincode) for serviceability.");
  },
};

export function integrationStatus() {
  return [
    ...channels.map((c) => ({ key: c.key, label: c.label, state: c.state() })),
    { key: "payments", label: paymentGateway.label, state: paymentGateway.state() },
    { key: "maps", label: geocoder.label, state: geocoder.state() },
    { key: "storage", label: "File storage", state: (isDemoMode() ? "simulated" : "configured") as IntegrationState },
    { key: "verification", label: "Technician ID / background verification", state: "not_configured" as IntegrationState },
    { key: "tracking", label: "Real-time location tracking", state: "not_configured" as IntegrationState },
  ];
}

/** Fire-and-forget external notification for key events. In-app notifications are already stored. */
export async function deliverExternal(recipientUserIds: (string | null | undefined)[], template: string): Promise<void> {
  for (const id of recipientUserIds) {
    if (!id) continue;
    for (const c of channels) await c.send(id, template).catch(() => false);
  }
}
