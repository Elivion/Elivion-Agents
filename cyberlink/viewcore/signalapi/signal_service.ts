export interface Signal {
  id: string
  type: string
  timestamp: number
  payload: Record<string, any>
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  status?: number
}

/**
 * Simple HTTP client for fetching signals.
 */
export class SignalApiClient {
  constructor(private baseUrl: string, private apiKey?: string) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`
    return headers
  }

  private async handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}`, status: res.status }
    }
    try {
      const data = (await res.json()) as T
      return { success: true, data, status: res.status }
    } catch (err: any) {
      return { success: false, error: `Invalid JSON: ${err.message}`, status: res.status }
    }
  }

  async fetchAllSignals(limit?: number): Promise<ApiResponse<Signal[]>> {
    try {
      const url = new URL(`${this.baseUrl}/signals`)
      if (limit) url.searchParams.set("limit", String(limit))
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: this.getHeaders(),
      })
      return this.handleResponse<Signal[]>(res)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async fetchSignalById(id: string): Promise<ApiResponse<Signal>> {
    try {
      const res = await fetch(`${this.baseUrl}/signals/${encodeURIComponent(id)}`, {
        method: "GET",
        headers: this.getHeaders(),
      })
      return this.handleResponse<Signal>(res)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async searchSignalsByType(type: string): Promise<ApiResponse<Signal[]>> {
    try {
      const res = await fetch(`${this.baseUrl}/signals?type=${encodeURIComponent(type)}`, {
        method: "GET",
        headers: this.getHeaders(),
      })
      return this.handleResponse<Signal[]>(res)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
}
