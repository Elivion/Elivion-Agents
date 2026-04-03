import { z } from "zod"

/**
 * Base types for any action (cleaned of vendor-specific names)
 */
export type ActionSchema = z.ZodObject<z.ZodRawShape>

export interface ActionResponse<T> {
  notice: string
  data?: T
  status?: "OK" | "WARN" | "ERROR"
  meta?: Record<string, unknown>
}

/** Error type that can carry validation issues */
export class ActionError extends Error {
  readonly code: string
  readonly issues?: z.ZodIssue[]

  constructor(message: string, code = "ACTION_ERROR", issues?: z.ZodIssue[]) {
    super(message)
    this.name = "ActionError"
    this.code = code
    this.issues = issues
  }
}

export interface BaseAction<S extends ActionSchema, R, Ctx = unknown> {
  id: string
  summary: string
  /** Zod schema describing expected input */
  input: S
  /** Optional semantic version for tracing changes */
  version?: string
  /** Parse/validate unknown input to a typed payload (throws ActionError) */
  validate(payload: unknown): z.infer<S>
  /** Execute with validated payload and context */
  execute(args: { payload: z.infer<S>; context: Ctx }): Promise<ActionResponse<R>>
}

/** Helpers to build common responses */
export const ok = <T>(notice: string, data?: T, meta?: Record<string, unknown>): ActionResponse<T> => ({
  notice, data, status: "OK", meta,
})
export const warn = <T>(notice: string, data?: T, meta?: Record<string, unknown>): ActionResponse<T> => ({
  notice, data, status: "WARN", meta,
})
export const err = <T>(notice: string, meta?: Record<string, unknown>): ActionResponse<T> => ({
  notice, status: "ERROR", meta,
})

/** Type guard for ActionResponse */
export const isActionResponse = <T = unknown>(v: unknown): v is ActionResponse<T> =>
  !!v && typeof v === "object" && typeof (v as any).notice === "string"

/**
 * Factory to create a typed action with built-in validation
 */
export function createAction<S extends ActionSchema, R, Ctx = unknown>(cfg: {
  id: string
  summary: string
  input: S
  version?: string
  handler: (args: { payload: z.infer<S>; context: Ctx }) => Promise<ActionResponse<R>>
}): BaseAction<S, R, Ctx> {
  const { id, summary, input, version, handler } = cfg

  const validate = (payload: unknown): z.infer<S> => {
    const res = input.safeParse(payload)
    if (!res.success) throw new ActionError("Invalid payload", "VALIDATION_ERROR", res.error.issues)
    return res.data
  }

  return {
    id,
    summary,
    input,
    version,
    validate,
    async execute({ payload, context }) {
      const validated = validate(payload)
      return handler({ payload: validated, context })
    },
  }
}
