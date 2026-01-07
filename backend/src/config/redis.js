import Redis from 'ioredis';

let redis;

const getRedis = () => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
    redis.on('error', (err) => console.error('Redis error:', err.message));
  }
  return redis;
};

export default getRedis;
