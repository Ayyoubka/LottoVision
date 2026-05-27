import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchLatestDraw }           from '../services/lottoApi.js'
import { fetchMyTickets }            from '../services/ticketApi.js'
import { fetchMembers, fetchLatestSettlement } from '../services/settlementApi.js'
import { runPipeline, fetchPipelineStatus }    from '../services/pipelineApi.js'
import WeeklyResultBanner  from '../components/dashboard/WeeklyResultBanner.jsx'
import LatestDrawCard      from '../components/dashboard/LatestDrawCard.jsx'
import ActiveTicketCard    from '../components/dashboard/ActiveTicketCard.jsx'
import SettlementCard      from '../components/dashboard/SettlementCard.jsx'
import GroupSummaryCard    from '../components/dashboard/GroupSummaryCard.jsx'
import MembersCard         from '../components/dashboard/MembersCard.jsx'
import PipelineStatusCard  from '../components/dashboard/PipelineStatusCard.jsx'
import NextDrawCard        from '../components/dashboard/NextDrawCard.jsx'
import '../components/dashboard/dashboard.css'

export default function DashboardScreen({ user }) {
  const [draw,           setDraw]           = useState(null)
  const [activeTicket,   setActiveTicket]   = useState(undefined) // undefined = not yet loaded
  const [members,        setMembers]        = useState(null)
  const [settlement,     setSettlement]     = useState(null)
  const [pipelineStatus, setPipelineStatus] = useState(null)
  const [drawErr,        setDrawErr]        = useState(null)
  const [refreshing,     setRefreshing]     = useState(false)
  const [pipelineRunning, setPipelineRunning] = useState(false)

  const isFirstLoad = useRef(true)

  const load = useCallback(async () => {
    setRefreshing(true)
    setDrawErr(null)

    const token = await user.getIdToken()

    const [drawRes, ticketRes, membersRes, settlementRes, pipelineRes] = await Promise.allSettled([
      fetchLatestDraw(),
      fetchMyTickets(token),
      fetchMembers(token),
      fetchLatestSettlement(token),
      fetchPipelineStatus(token),
    ])

    if (drawRes.status === 'fulfilled')
      setDraw(drawRes.value)
    else
      setDrawErr(drawRes.reason?.message ?? 'Could not load draw')

    if (ticketRes.status === 'fulfilled') {
      const all = ticketRes.value.tickets
      // Active ticket = marked active, or fallback to most recent pending
      setActiveTicket(all.find(t => t.active === true) ?? all.find(t => t.status === 'pending') ?? null)
    }

    if (membersRes.status === 'fulfilled')   setMembers(membersRes.value.members)
    if (settlementRes.status === 'fulfilled') setSettlement(settlementRes.value.settlement)
    if (pipelineRes.status === 'fulfilled')   setPipelineStatus(pipelineRes.value.status)

    isFirstLoad.current = false
    setRefreshing(false)
  }, [user])

  useEffect(() => { load() }, [load])

  const handleRunPipeline = async () => {
    if (pipelineRunning) return
    setPipelineRunning(true)
    try {
      const token  = await user.getIdToken()
      const result = await runPipeline(token)
      setPipelineStatus(result)
      await load()
    } catch (e) {
      setPipelineStatus(prev => ({ ...prev, error: e.message }))
    } finally {
      setPipelineRunning(false)
    }
  }

  // Show loading state only on first load (cards keep stale data during refresh)
  const initialLoading = isFirstLoad.current && refreshing

  return (
    <div className="db-screen">

      {/* Prominent weekly result banner */}
      <WeeklyResultBanner
        activeTicket={activeTicket === undefined ? null : activeTicket}
        pipelineRunning={pipelineRunning}
      />

      {/* Refresh row */}
      <div className="db-refresh-row">
        <button className="db-refresh-btn" onClick={load} disabled={refreshing || pipelineRunning}>
          {refreshing && !pipelineRunning ? '↻ Refreshing…' : '↺ Refresh'}
        </button>
      </div>

      <NextDrawCard />

      <ActiveTicketCard
        ticket={activeTicket === undefined ? null : activeTicket}
        loading={initialLoading && activeTicket === undefined}
      />

      <PipelineStatusCard
        status={pipelineStatus}
        running={pipelineRunning}
        onRun={handleRunPipeline}
      />

      <LatestDrawCard draw={draw} loading={initialLoading && !draw} error={drawErr} />

      <SettlementCard settlement={settlement} loading={initialLoading && !settlement} />

      <GroupSummaryCard members={members} loading={initialLoading && !members} />

      <MembersCard
        members={members}
        loading={initialLoading && !members}
        user={user}
        onBalanceUpdated={setMembers}
      />

    </div>
  )
}
