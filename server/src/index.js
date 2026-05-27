import 'dotenv/config'
import app              from './app.js'
import { startScheduler } from './scheduler.js'

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`LOTO server running on http://localhost:${PORT}`)
  console.log(`  GET http://localhost:${PORT}/api/latest-draw`)
  startScheduler()
})
