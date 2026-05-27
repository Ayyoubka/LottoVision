/**
 * settlementService.js — group accounting after each draw.
 *
 * Settlement rules:
 *   - Every week the group buys one ticket at a fixed cost (GROUP_TICKET_COST).
 *   - Each active member pays an equal share: cost / memberCount.
 *   - Any prize is split equally among active members.
 *   - Net delta per member = (winnings - ticketCost) / memberCount
 *
 * Example — 7 members, cost ₪70, no prize:
 *   delta = (0 - 70) / 7 = -10  → each member -₪10
 *
 * Example — 7 members, cost ₪70, prize ₪140:
 *   delta = (140 - 70) / 7 = +10 → each member +₪10
 *
 * Idempotency: if a settlement already exists for drawId, the call is a no-op.
 * This makes it safe to re-run the ticket check without double-billing.
 *
 * Atomicity note: member balance updates run sequentially (not in a Firestore
 * transaction). For a 7-member admin-only group the risk of partial failure is
 * acceptable; a future upgrade could use a batched write or transaction.
 */

import {
  getActiveMembers,
  updateMemberBalance,
  seedGroupMembers,
  hasMembers,
} from '../repositories/groupMembersRepository.js'
import {
  saveSettlement,
  settlementExistsForDraw,
} from '../repositories/settlementsRepository.js'
import { isFirestoreReady } from '../config/firestore.js'

// ── Config ─────────────────────────────────────────────────────────────────

export const GROUP_TICKET_COST = 70   // ILS — 7 members × ₪10 per combination set

const DEFAULT_MEMBERS = [
  { name: 'أيوب'  },
  { name: 'أحمد'  },
  { name: 'محمد'  },
  { name: 'علي'   },
  { name: 'عمر'   },
  { name: 'يوسف' },
  { name: 'خالد' },
]

// ── Seeding ────────────────────────────────────────────────────────────────

/**
 * Seed groupMembers with DEFAULT_MEMBERS if the collection is empty.
 * Safe to call on every request — no-ops if members already exist.
 */
export async function ensureGroupMembers() {
  if (!isFirestoreReady()) return
  const exists = await hasMembers()
  if (!exists) {
    console.log('[SettlementService] Seeding group members…')
    await seedGroupMembers(DEFAULT_MEMBERS)
    console.log(`[SettlementService] Seeded ${DEFAULT_MEMBERS.length} members`)
  }
}

// ── Settlement ─────────────────────────────────────────────────────────────

/**
 * Run the weekly settlement after a ticket is checked against a draw.
 *
 * @param {{ ticketId: string, drawId: number, winnings: number, ticketCost?: number }}
 * @returns {Promise<object>} The saved settlement document
 *
 * @throws FIRESTORE_UNAVAILABLE | NO_MEMBERS
 *         Silently skips on ALREADY_SETTLED (idempotent re-run).
 */
export async function runSettlement({ ticketId, drawId, winnings, ticketCost = GROUP_TICKET_COST }) {
  if (!isFirestoreReady()) {
    throw Object.assign(new Error('Firestore not available'), { code: 'FIRESTORE_UNAVAILABLE' })
  }

  // ── Idempotency ───────────────────────────────────────────────────────────
  const alreadySettled = await settlementExistsForDraw(drawId)
  if (alreadySettled) {
    console.log(`[SettlementService] Draw #${drawId} already settled — skipping`)
    throw Object.assign(
      new Error(`Settlement already exists for draw #${drawId}`),
      { code: 'ALREADY_SETTLED' }
    )
  }

  // ── Load members ──────────────────────────────────────────────────────────
  const members = await getActiveMembers()
  if (members.length === 0) {
    throw Object.assign(new Error('No active group members found'), { code: 'NO_MEMBERS' })
  }

  const memberCount = members.length

  console.log(
    `[SettlementService] draw=#${drawId}  ticketId=${ticketId}` +
    `  winnings=₪${winnings}  cost=₪${ticketCost}  members=${memberCount}`
  )

  // ── Per-member math ───────────────────────────────────────────────────────
  const costShare  = round2(ticketCost / memberCount)
  const prizeShare = round2(winnings   / memberCount)
  const delta      = round2(prizeShare - costShare)

  console.log(
    `[SettlementService] costShare=₪${costShare}` +
    `  prizeShare=₪${prizeShare}  delta=₪${delta}`
  )

  // ── Update balances ───────────────────────────────────────────────────────
  const memberResults = []

  for (const member of members) {
    const balanceAfter = round2(member.balance + delta)

    await updateMemberBalance(member.id, {
      balance:   balanceAfter,
      totalPaid: round2(member.totalPaid + costShare),
      totalWon:  round2(member.totalWon  + prizeShare),
    })

    memberResults.push({
      memberId:     member.id,
      name:         member.name,
      delta,
      balanceAfter,
    })

    console.log(`[SettlementService]   ${member.name}: ₪${member.balance} → ₪${balanceAfter}`)
  }

  // ── Persist settlement ────────────────────────────────────────────────────
  const settlement = await saveSettlement({
    drawId,
    ticketId,
    ticketCost,
    winnings,
    netResult: winnings - ticketCost,
    memberResults,
  })

  console.log(
    `[SettlementService] Settlement saved — id=${settlement.id}` +
    `  netResult=₪${settlement.netResult}`
  )

  return settlement
}

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100
}
