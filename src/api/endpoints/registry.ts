import { z } from "zod";
import { get, type Connection } from "../http";
import type { Result } from "../errors";

const PATHS = {
  agents: "/registry/agents",
  agentCard: "/.well-known/agent.json",
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

export const agentById = (
  c: Connection,
  agentId: string,
  signal?: AbortSignal,
): Promise<Result<RegisteredAgent>> =>
  get(c, `${PATHS.agents}/${encodeURIComponent(agentId)}`, { schema: RegisteredAgent, signal });

/**
 * The agent's own A2A card, served unauthenticated at a well-known path. It is
 * what the agent claims about itself to anyone who asks — which is exactly why
 * it is worth showing next to what the agent actually does. `url` here is the
 * address the agent advertises, and it is routinely wrong behind a proxy
 * (localhost, in the deployment this was written against), so the screen must
 * never present it as the address this console is talking to.
 */
export const AgentCard = z
  .object({
    name: z.string(),
    description: z.string().nullable().catch(null),
    url: z.string().nullable().catch(null),
    version: z.string().catch(""),
    provider: z
      .object({ name: z.string().catch(""), url: z.string().nullable().catch(null) })
      .loose()
      .nullable()
      .catch(null),
    capabilities: z
      .object({
        protocols: z.array(z.string()).catch([]),
        streaming: z.boolean().catch(false),
        push_notifications: z.boolean().catch(false),
      })
      .loose()
      .nullable()
      .catch(null),
    skills: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string().catch(""),
            description: z.string().nullable().catch(null),
            tags: z.array(z.string()).catch([]),
          })
          .loose(),
      )
      .catch([]),
  })
  .loose();
export type AgentCard = z.infer<typeof AgentCard>;

export const agentCard = (c: Connection, signal?: AbortSignal): Promise<Result<AgentCard>> =>
  get(c, PATHS.agentCard, { schema: AgentCard, signal });
