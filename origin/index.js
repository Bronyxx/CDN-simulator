// origin/index.js
const express = require('express')
const app = express()

app.get('/data/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30')
  res.json({ id: req.params.id, data: 'Hello from origin', ts: Date.now() })
})

app.listen(3000, () => console.log('Origin running on 3000'))