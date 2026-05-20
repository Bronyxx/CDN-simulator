const express = require('express')
const axios = require('axios')
const app = express()
require('dotenv').config()
app.use(express.json())


const PORT= process.env.ORIGIN_PORT || 3000
// your existing data endpoint
app.get('/data/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30')
  res.json({ id: req.params.id, data: 'Hello from origin', ts: Date.now() })
})

// edge node addresses - locally they run on different ports
const EDGE_NODES = [
  process.env.EDGE_1,
  //process.env.EDGE_2,
  //process.env.EDGE_3
]

// invalidation endpoint
app.post('/invalidate/:key', async (req, res) => {
  const { key } = req.params

  console.log(`Invalidating key: ${key} across all edges`)

  const results = await Promise.allSettled(
    EDGE_NODES.map(edge =>
      axios.post(`${edge}/invalidate/${key}`)
    )
  )

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`Edge ${i + 1} invalidated successfully`)
    } else {
      console.log(`Edge ${i + 1} failed:`, result.reason.message)
    }
  })

  res.json({ message: `Key ${key} invalidated across all edges` })
})

app.listen(PORT, () => console.log(`Origin running on ${PORT}`))