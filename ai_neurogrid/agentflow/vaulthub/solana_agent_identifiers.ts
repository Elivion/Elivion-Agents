/** Unique identifier for the Solana Knowledge Agent */
export const SOLANA_KNOWLEDGE_AGENT_ID = "solana-knowledge-agent" as const

/** Human-readable name */
export const SOLANA_KNOWLEDGE_AGENT_NAME = "Solana Knowledge Agent"

/** Short description for registries or dashboards */
export const SOLANA_KNOWLEDGE_AGENT_DESCRIPTION =
  "Provides authoritative answers about Solana protocols, tokens, validators, tooling, and ecosystem updates."

/** Version tag for tracking updates */
export const SOLANA_KNOWLEDGE_AGENT_VERSION = "1.0.0"

/** Convenience metadata bundle */
export const SOLANA_KNOWLEDGE_AGENT_META = {
  id: SOLANA_KNOWLEDGE_AGENT_ID,
  name: SOLANA_KNOWLEDGE_AGENT_NAME,
  description: SOLANA_KNOWLEDGE_AGENT_DESCRIPTION,
  version: SOLANA_KNOWLEDGE_AGENT_VERSION,
} as const
