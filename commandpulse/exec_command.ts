import { exec } from "child_process"

/**
 * Execute a shell command and return stdout, stderr, and exit code.
 */
export interface ExecResult {
  stdout: string
  stderr: string
  code: number
  durationMs: number
}

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    public readonly result: ExecResult
  ) {
    super(message)
    this.name = "CommandExecutionError"
  }
}

/**
 * Run a shell command with optional timeout.
 * Resolves with ExecResult or throws CommandExecutionError.
 */
export function execCommand(command: string, timeoutMs: number = 30_000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const proc = exec(command, { timeout: timeoutMs }, (error, stdout, stderr) => {
      const result: ExecResult = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: error && "code" in error ? (error as any).code ?? 1 : 0,
        durationMs: Date.now() - start,
      }
      if (error) {
        return reject(new CommandExecutionError(`Command failed: ${stderr || error.message}`, result))
      }
      resolve(result)
    })

    // handle immediate failure (e.g., spawn error)
    proc.on("error", (err) => {
      const result: ExecResult = {
        stdout: "",
        stderr: err.message,
        code: 1,
        durationMs: Date.now() - start,
      }
      reject(new CommandExecutionError("Command execution error", result))
    })
  })
}
