import type { BaseAction, ActionResponse } from "./base_action_types"
import { z } from "zod"

interface AgentContext {
  apiEndpoint: string
  apiKey: string
  requestId?: string
  trace?: Record<string, unknown>
}

/**
 * Central Agent: routes calls to registered actions.
 */
export class Agent {
  private actions = new Map<string, BaseAction<any, any, AgentContext>>()

  register<S extends z.ZodObject<any>, R>(action: BaseAction<S, R, AgentContext>): void {
    if (this.actions.has(action.id)) {
      throw new Error(`Action with id "${action.id}" already registered`)
    }
    this.actions.set(action.id, action)
  }

  listActions(): string[] {
    return Array.from(this.actions.keys())
  }

  getActionSummary(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [id, a] of this.actions.entries()) {
      out[id] = a.summary
    }
    return out
  }

  async invoke<R>(
    actionId: string,
    payload: unknown,
    ctx: AgentContext
  ): Promise<ActionResponse<R>> {
    const action = this.actions.get(actionId)
    if (!action) throw new Error(`Unknown action "${actionId}"`)
    try {
      const validated = action.validate(payload)
      return await action.execute({ payload: validated, context: ctx })
    } catch (err: any) {
      return { notice: err.message ?? "Action failed", status: "ERROR" }
    }
  }
}
