import express       from 'express'
import cors          from 'cors'
import lottoRoute        from './routes/lotto.js'
import authRoute         from './routes/auth.js'
import scrapeRoute       from './routes/scrape.js'
import ticketsRoute      from './routes/tickets.js'
import settlementsRoute  from './routes/settlements.js'
import pipelineRoute     from './routes/pipeline.js'
import notificationsRoute from './routes/notifications.js'
import importRoute        from './routes/import.js'

const app = express()

// Allow the configured origin (or all origins in dev)
const allowedOrigin = process.env.ALLOWED_ORIGIN
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : undefined))
app.use(express.json())

app.use('/api/auth',        authRoute)
app.use('/api/scrape',      scrapeRoute)
app.use('/api/tickets',     ticketsRoute)
app.use('/api/settlements', settlementsRoute)
app.use('/api/pipeline',       pipelineRoute)
app.use('/api/notifications',  notificationsRoute)
app.use('/api/import',         importRoute)
app.use('/api',                lottoRoute)

app.get('/health', (_, res) => res.json({ status: 'ok' }))

// 404 for anything else
app.use((_, res) => res.status(404).json({ error: 'Not found' }))

export default app
