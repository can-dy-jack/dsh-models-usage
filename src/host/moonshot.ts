/** Kimi Open Platform pay-as-you-go account balance, separate from Kimi Code. */

import type { BalanceInfo } from '../payload'
import { isRecord } from '../shared'

function amount(value: unknown): string | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return undefined
  return Number.isFinite(Number(text)) ? text : undefined
}

/** Values come from the API; cash debt must not be subtracted from vouchers again. */
export function parseMoonshotBalance(data: unknown, currency: 'CNY' | 'USD'): BalanceInfo {
  const failed: BalanceInfo = { status: 'failed', message: 'Moonshot AI 返回的余额响应无法识别' }
  if (!isRecord(data) || data.code !== 0 || data.status !== true || !isRecord(data.data)) return failed
  const available = amount(data.data.available_balance)
  const cash = amount(data.data.cash_balance)
  const voucher = amount(data.data.voucher_balance)
  if (available === undefined
    || (data.data.cash_balance !== undefined && cash === undefined)
    || (data.data.voucher_balance !== undefined && voucher === undefined)
    || (voucher !== undefined && Number(voucher) < 0)) return failed
  return {
    status: 'ready',
    isAvailable: Number(available) > 0,
    wallets: [{ currency, balance: available, cash, voucher, kind: 'account' }],
  }
}
