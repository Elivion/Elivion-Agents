export interface AgentCapabilities {
  canAnswerProtocolQuestions: boolean
  canAnswerTokenQuestions: boolean
  canDescribeTooling: boolean
  canReportEcosystemNews: boolean
  canHandleGovernanceTopics: boolean
  canSummarizeDeveloperUpdates: boolean
}

export interface AgentFlags {
  requiresExactInvocation: boolean
  noAdditionalCommentary: boolean
  logInteractions: boolean
  allowParallelTasks: boolean
}

/**
 * Default Solana-focused agent capabilities
 */
export const SOLANA_AGENT_CAPABILITIES: AgentCapabilities = {
  canAnswerProtocolQuestions: true,
  canAnswerTokenQuestions: true,
  canDescribeTooling: true,
  canReportEcosystemNews: true,
  canHandleGovernanceTopics: true,
  canSummarizeDeveloperUpdates: true,
}

/**
 * Execution rules for Solana agent
 */
export const SOLANA_AGENT_FLAGS: AgentFlags = {
  requiresExactInvocation: true,
  noAdditionalCommentary: true,
  logInteractions: true,
  allowParallelTasks: false,
}

/**
 * Helper utilities to inspect agent behavior
 */
export function describeAgentCapabilities(cap: AgentCapabilities): string {
  const enabled = Object.entries(cap)
    .filter(([_, v]) => v)
    .map(([k]) => k.replace(/^can/, ""))
  return `Agent supports: ${enabled.join(", ")}`
}

export function validateAgentFlags(flags: AgentFlags): boolean {
  return typeof flags.requiresExactInvocation === "boolean" &&
         typeof flags.noAdditionalCommentary === "boolean"
}
