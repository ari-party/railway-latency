import { env } from '@/env';
import { redis } from '@/server/services/redis';

const pendingPromises = new Map<string, Promise<unknown>>();

const getCacheKey = (key: string) => `memoize:${key}`;

export async function deleteMemoized(key: string) {
  return await redis.del(getCacheKey(key));
}

export async function memoize<T extends () => Promise<unknown> | unknown>(
  key: string,
  fn: T,
  expiry: number = 60,
): Promise<ReturnType<T>> {
  const cacheKey = getCacheKey(key);

  type ReturnTypeT = Awaited<ReturnType<T>>;

  const update = async (): Promise<ReturnTypeT> => {
    const existingPromise = pendingPromises.get(cacheKey);
    if (existingPromise) {
      if (env.NODE_ENV === 'development')
        console.log('Memoize promise dedupe:', key);

      return existingPromise as Promise<ReturnTypeT>;
    }

    if (env.NODE_ENV === 'development') console.log('Memoize cache miss:', key);

    const promise = (async () => {
      try {
        const newValue = (await Promise.resolve(fn())) as ReturnTypeT;
        await redis.setex(
          cacheKey,
          env.NODE_ENV === 'development' ? Math.min(expiry, 60) : expiry,
          JSON.stringify({
            value: newValue,
          }),
        );

        return newValue;
      } finally {
        pendingPromises.delete(cacheKey);
      }
    })();

    pendingPromises.set(cacheKey, promise);
    return await promise;
  };

  const ttl = await redis.ttl(cacheKey);
  if (ttl <= 0) return update();
  else {
    const formattedValue = await redis.get(cacheKey);
    if (!formattedValue) return update();

    if (env.NODE_ENV === 'development') console.log('Memoize cache hit:', key);

    const parsedValue = JSON.parse(formattedValue) as { value: ReturnTypeT };
    return parsedValue.value;
  }
}
