import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  agents: "/registry/agents",
} as const;

// --- agent registry ---------------------------------------------------------

/**
 * Two different kinds of claim, which the screen must not blend.
 *
 * `trust_status` is the operator's own decision — approved, preferred, blocked.
 * `registry_sources[].verified_at` is an external registry confirming the agent
 * is registered with it. One is our judgement, the other is someone else's
 * verification, and an agent can have either without the other.
 */
export const RegistrySource = z
  .object({
    registry_id: z.string().catch(""),
    registry_name: z.string().catch(""),
    verified_at: z.string().nullable().catch(null),
  })
  .loose();
export type RegistrySource = z.infer<typeof RegistrySource>;

export const RegisteredAgent = z
  .object({
    agent_id: z.string(),
    agent_type: z.string().catch("other"),
    trust_status: z.string().catch("unknown"),
    registry_sources: z.array(RegistrySource).catch([]),
    registered_at: z.string().nullable().catch(null),
    last_seen: z.string().nullable().catch(null),
    interaction_count: z.number().catch(0),
    agent_card: z
      .object({ name: z.string().catch(""), url: z.string().catch("") })
      .loose()
      .nullable()
      .catch(null),
  })
  .loose();
export type RegisteredAgent = z.infer<typeof RegisteredAgent>;

export const AgentList = z
  .object({ agents: z.array(RegisteredAgent), total: z.number().catch(0) })
  .loose();
export type AgentList = z.infer<typeof AgentList>;

export const agents = (
  c: Connection,
  query: { agent_type?: string; trust_status?: string } = {},
  signal?: AbortSignal,
): Promise<Result<AgentList>> => get(c, PATHS.agents, { schema: AgentList, query, signal });
