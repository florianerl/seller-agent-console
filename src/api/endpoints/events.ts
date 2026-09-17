import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  events: "/events",
} as const;

// --- events (operator only) -------------------------------------------------

export const EventRecord = z
  .object({
    event_type: z.string(),
    timestamp: z.string(),
    event_id: z.string().optional(),
    flow_id: z.string().nullable().optional(),
    session_id: z.string().nullable().optional(),
  })
  .loose();
export type EventRecord = z.infer<typeof EventRecord>;

export const EventsPage = z.object({ events: z.array(EventRecord) }).loose();
export type EventsPage = z.infer<typeof EventsPage>;

export type EventsQuery = {
  limit?: number;
  event_type?: string;
  flow_id?: string;
  session_id?: string;
};

export const events = (
  c: Connection,
  query: EventsQuery = {},
  signal?: AbortSignal,
): Promise<Result<EventsPage>> =>
  get(c, PATHS.events, { schema: EventsPage, query, signal });

/**
 * Detail for one event. The list response already carries everything the
 * table shows, so this exists for the fields it does not — payloads differ per
 * event type, so the body is kept unknown and rendered as formatted JSON.
 */
export const EventDetail = z.looseObject({});

export const eventById = (
  c: Connection,
  eventId: string,
  signal?: AbortSignal,
): Promise<Result<Record<string, unknown>>> =>
  get(c, `${PATHS.events}/${encodeURIComponent(eventId)}`, {
    schema: EventDetail,
    signal,
  });
