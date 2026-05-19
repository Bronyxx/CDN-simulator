const express = require('express')
const redis = require('redis')
const axios = require('axios')
require('dotenv').config()

const PORT=process.env.PORT || 4000
const ORIGIN_URL = process.env.ORIGIN_URL

const app = express()
app.use(express.json())

const REDIS_URL = process.env.REDIS_URL  
const cache = redis.createClient({ url: REDIS_URL })
cache.connect()

cache.on('connect', () => console.log('Redis connected'))
cache.on('error', (err) => console.log('Redis error:', err))

// existing cache endpoint
app.get('/data/:id', async (req, res) => {
  const key = req.params.id
  const cached = await cache.get(key)

  if (cached) {
    return res.json({ source: 'cache', data: JSON.parse(cached) })
  }

  const response = await axios.get(`${ORIGIN_URL}/data/${key}`)
  await cache.setEx(key, 30, JSON.stringify(response.data))
  res.json({ source: 'origin', data: response.data })
})

// new invalidation endpoint
app.post('/invalidate/:key', async (req, res) => {
  const { key } = req.params

  await cache.del(key)
  console.log(`Cache invalidated for key: ${key}`)

  res.json({ message: `Key ${key} deleted from cache` })
})

app.listen(PORT, () => console.log(`Edge running on ${PORT}`))