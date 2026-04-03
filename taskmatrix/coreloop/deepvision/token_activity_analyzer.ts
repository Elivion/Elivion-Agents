/**
 * Analyze on-chain token activity on Solana: fetch recent signatures for an address,
 * load transactions via JSON-RPC, and summarize per-owner token balance deltas for a given mint
 *
 * Notes
 * - Uses real Solana JSON-RPC methods: getSignaturesForAddress and getTransaction
 * - Computes deltas using exact integer amounts and token decimals for accuracy
 * - Includes request timeouts, basic retries, and bounded concurrency
 */

export interface ActivityRecord {
  timestamp: number
  signature: string
  source: string
  destination: string
  amount: number
}

export type Commitment = 'processed' | 'confirmed' | 'finalized'

interface RpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown[]
}

interface RpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

interface SignatureInfo {
  signature: string
  slot: number
  err: null | unknown
  blockTime: number | null
}

interface UiTokenAmount {
  amount: string // integer as string
  decimals: number
  uiAmount: number | null
  uiAmountString: string
}

interface TokenBalanceEntry {
  accountIndex: number
  mint: string
  owner?: string
  uiTokenAmount: UiTokenAmount
}

interface TransactionMeta {
  preTokenBalances?: TokenBalanceEntry[]
  postTokenBalances?: TokenBalanceEntry[]
}

interface TransactionResult {
  blockTime: number | null
  meta: TransactionMeta | null
}

export interface AnalyzerOptions {
  commitment?: Commitment
  timeoutMs?: number
  maxConcurrency?: number
  maxRetries?: number
}

export class TokenActivityAnalyzer {
  private commitment: Commitment
  private timeoutMs: number
  private maxConcurrency: number
  private maxRetries: number
  private reqId = 1

  constructor(private rpcEndpoint: string, opts: AnalyzerOptions = {}) {
    this.commitment = opts.commitment ?? 'confirmed'
    this.timeoutMs = opts.timeoutMs ?? 12_000
    this.maxConcurrency = Math.max(1, opts.maxConcurrency ?? 6)
    this.maxRetries = Math.max(0, opts.maxRetries ?? 2)
  }

  /**
   * Low-level JSON-RPC POST with timeout and basic retries
   */
  private async rpc<T>(method: string, params?: unknown[], attempt = 0): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const body: RpcRequest = {
      jsonrpc: '2.0',
      id: this.reqId++,
      method,
      params,
    }

    try {
      const res = await fetch(this.rpcEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        throw new Error(`RPC HTTP ${res.status}`)
      }
      const json = (await res.json()) as RpcResponse<T>
      if (json.error) {
        throw new Error(`RPC ${method} error ${json.error.code}: ${json.error.message}`)
      }
      if (json.result === undefined) {
        throw new Error(`RPC ${method} returned no result`)
      }
      return json.result
    } catch (err) {
      if (attempt < this.maxRetries) {
        await this.sleep(200 * (attempt + 1))
        return this.rpc<T>(method, params, attempt + 1)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Fetch recent signatures for an address (owner, token account, mint authority, etc.)
   * The Solana RPC treats this as "address", not strictly a mint address
   */
  async fetchRecentSignatures(
    address: string,
    limit = 100,
    before?: string
  ): Promise<SignatureInfo[]> {
    const args = [
      address,
      {
        limit,
        before,
        commitment: this.commitment,
      },
    ]
    const result = await this.rpc<SignatureInfo[]>('getSignaturesForAddress', args)
    // Filter out failed transactions to reduce noise
    return result.filter((s) => s.err === null)
  }

  /**
   * Fetch transactions with bounded concurrency
   */
  private async fetchTransactions(signatures: string[]): Promise<Map<string, TransactionResult>> {
    const out = new Map<string, TransactionResult>()
    let index = 0

    const worker = async () => {
      while (index < signatures.length) {
        const i = index++
        const sig = signatures[i]
        try {
          const args = [
            sig,
            {
              maxSupportedTransactionVersion: 0,
              commitment: this.commitment,
            },
          ]
          const tx = await this.rpc<TransactionResult>('getTransaction', args)
          out.set(sig, tx)
        } catch {
          // Skip on errors; analyzer will simply ignore missing entries
        }
      }
    }

    const workers = Array.from({ length: this.maxConcurrency }, () => worker())
    await Promise.all(workers)
    return out
  }

  /**
   * Analyze activity for a specific SPL mint by comparing pre/post token balances
   * across all owners touched in each transaction
   */
  async analyzeActivity(address: string, mint: string, limit = 50): Promise<ActivityRecord[]> {
    const sigInfos = await this.fetchRecentSignatures(address, limit)
    const signatures = sigInfos.map((s) => s.signature)
    if (signatures.length === 0) return []

    const txMap = await this.fetchTransactions(signatures)

    const records: ActivityRecord[] = []
    for (const sig of signatures) {
      const tx = txMap.get(sig)
      if (!tx || !tx.meta) continue

      const pre = (tx.meta.preTokenBalances ?? []).filter((b) => b.mint === mint)
      const post = (tx.meta.postTokenBalances ?? []).filter((b) => b.mint === mint)

      const preByOwner = this.indexByOwner(pre)
      const postByOwner = this.indexByOwner(post)
      const owners = new Set([...preByOwner.keys(), ...postByOwner.keys()])

      for (const owner of owners) {
        const preEntry = preByOwner.get(owner)
        const postEntry = postByOwner.get(owner)
        const { deltaUi, source, destination } = this.computeDelta(preEntry, postEntry)
        if (deltaUi === 0) continue

        records.push({
          timestamp: (tx.blockTime ?? 0) * 1000,
          signature: sig,
          source,
          destination,
          amount: Math.abs(deltaUi),
        })
      }
    }

    // Most recent first (by blockTime), fall back to incoming order if unknown
    records.sort((a, b) => b.timestamp - a.timestamp || a.signature.localeCompare(b.signature))
    return records
  }

  /**
   * Helpers
   */
  private indexByOwner(entries: TokenBalanceEntry[]): Map<string, TokenBalanceEntry> {
    const m = new Map<string, TokenBalanceEntry>()
    for (const e of entries) {
      const owner = e.owner ?? 'unknown'
      // If multiple same-owner accounts appear, keep the one with the largest absolute amount
      const prev = m.get(owner)
      if (!prev) {
        m.set(owner, e)
      } else {
        const curAmt = BigInt(e.uiTokenAmount.amount)
        const prevAmt = BigInt(prev.uiTokenAmount.amount)
        if (curAmt > prevAmt) m.set(owner, e)
      }
    }
    return m
  }

  private computeDelta(
    preEntry?: TokenBalanceEntry,
    postEntry?: TokenBalanceEntry
  ): { deltaUi: number; source: string; destination: string } {
    const preAmt = preEntry ? BigInt(preEntry.uiTokenAmount.amount) : 0n
    const postAmt = postEntry ? BigInt(postEntry.uiTokenAmount.amount) : 0n
    const decimals =
      postEntry?.uiTokenAmount.decimals ??
      preEntry?.uiTokenAmount.decimals ??
      0

    const delta = postAmt - preAmt // positive → inflow to owner; negative → outflow
    const scale = 10 ** decimals
    const deltaUi = Number(delta) / scale

    let source = 'unknown'
    let destination = 'unknown'
    if (delta > 0n) {
      // tokens moved TO post owner FROM somewhere represented by pre owner (or unknown)
      source = preEntry?.owner ?? 'unknown'
      destination = postEntry?.owner ?? 'unknown'
    } else if (delta < 0n) {
      source = preEntry?.owner ?? 'unknown'
      destination = postEntry?.owner ?? 'unknown'
    }
    return { deltaUi, source, destination }
  }
}
