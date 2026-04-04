// edge/index.js
const express = require('express')
const redis = require('redis')
const axios = require('axios')

const app = express()
const cache = redis.createClient({ url: process.env.REDIS_URL })
cache.connect()

app.get('/data/:id', async (req, res) => {
  const key = req.params.id
  const cached = await cache.get(key)

  if (cached) {
    return res.json({ source: 'cache', data: JSON.parse(cached) })
  }

  const response = await axios.get(`http://localhost:3000/data/${key}`)
  await cache.setEx(key, 30, JSON.stringify(response.data))
  res.json({ source: 'origin', data: response.data })
})

app.listen(4000, () => console.log('Edge running'))