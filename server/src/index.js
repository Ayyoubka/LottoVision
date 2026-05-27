import 'dotenv/config'
import app from './app.js'

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`LOTO server running on http://localhost:${PORT}`)
  console.log(`  GET http://localhost:${PORT}/api/latest-draw`)
})
