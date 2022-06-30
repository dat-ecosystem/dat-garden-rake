import { createRateLimiter } from './util.mjs'

const limiter = createRateLimiter(2, 100)

const start = Date.now()
for (let i = 0; i < 20; i++) {
  await limiter({ log: () => {} }, `x -> ${i} `)
  console.log(i, Date.now() - start, 'ms')
}
