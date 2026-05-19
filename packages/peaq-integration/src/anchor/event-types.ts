import { z } from "zod";

/**
 * Telemetry event-type taxonomy for the AXI peaq trust layer.
 *
 * Every leaf in an hourly Merkle anchor is one typed telemetry event. The type
 * code records which division and which stream the event belongs to, so a
 * verifier can scope a Merkle proof to, e.g., "ICE fuel events for vehicle X,
 * hour H".
 *
 * One trust layer serves both divisions: the cryptographic primitive — a typed,
 * hashed event committed under an hourly root — is identical; only the
 * vocabulary differs.
 */

export type Division = "ice" | "ev";

/** ICE division — diesel-fleet telemetry. */
export const ICE_EVENT_TYPES = {
  /** Fuel fill / draw / consumption event. */
  fuel: "ice.fuel",
  /** Trip start/stop with route + duration. */
  trip: "ice.trip",
  /** Harsh-driving event (harsh brake / accel / corner). */
  harshDriving: "ice.harsh-driving",
  /** Odometer reading. */
  odometer: "ice.odometer",
} as const;

/** EV division — electric-fleet telemetry. */
export const EV_EVENT_TYPES = {
  /** OCPP charging session. */
  chargingSession: "ev.charging-session",
  /** Battery telemetry sample (SoC, SoH, cell voltages, temperatures). */
  batteryTelemetry: "ev.battery-telemetry",
  /** Regenerative-braking event. */
  regen: "ev.regen",
  /** Range / efficiency reading. */
  range: "ev.range",
} as const;

/** Every event type the trust layer anchors, across both divisions. */
export const PEAQ_EVENT_TYPES = {
  ...ICE_EVENT_TYPES,
  ...EV_EVENT_TYPES,
} as const;

export type IceEventType = (typeof ICE_EVENT_TYPES)[keyof typeof ICE_EVENT_TYPES];
export type EvEventType = (typeof EV_EVENT_TYPES)[keyof typeof EV_EVENT_TYPES];
export type PeaqEventType = IceEventType | EvEventType;

const ALL_EVENT_TYPES = new Set<string>(Object.values(PEAQ_EVENT_TYPES));

/** True if `value` is a recognised trust-layer event type. */
export function isPeaqEventType(value: string): value is PeaqEventType {
  return ALL_EVENT_TYPES.has(value);
}

/** The division an event type belongs to, derived from its `ice.` / `ev.` prefix. */
export function divisionOf(eventType: PeaqEventType): Division {
  return eventType.startsWith("ev.") ? "ev" : "ice";
}

/** Zod schema for a trust-layer event type — use at the ingest boundary. */
export const peaqEventTypeSchema = z
  .string()
  .refine(isPeaqEventType, { message: "Unknown peaq trust-layer event type" });

/**
 * A typed telemetry event as it enters the anchor pipeline. `payloadHash` is the
 * sha256 of the full off-chain record and becomes a leaf in the hourly Merkle
 * tree. The full payload never goes on-chain — only the root does.
 *
 * `deviceDid` + `assetDid` tie the event to MachineRegistry: ingest rejects an
 * event whose device is not registered, active, and bound to the claimed asset.
 */
export interface TelemetryEvent {
  eventType: PeaqEventType;
  /** DID of the asset (vehicle / battery) the event concerns. */
  assetDid: string;
  /** DID of the device that produced and signed the event. */
  deviceDid: string;
  /** Unix milliseconds when the event was observed. */
  observedAt: number;
  /** sha256 (64-hex) of the canonical off-chain payload — the Merkle leaf. */
  payloadHash: string;
}

export const telemetryEventSchema = z.object({
  eventType: peaqEventTypeSchema,
  assetDid: z.string().min(1),
  deviceDid: z.string().min(1),
  observedAt: z.number().int().nonnegative(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});
