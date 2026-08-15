export async function settleWithConcurrency<T, TResult>(
  items: readonly T[],
  concurrency: number,
  task: (item: T) => Promise<TResult>
): Promise<PromiseSettledResult<TResult>[]> {
  const outcomes: PromiseSettledResult<TResult>[] = [];
  const boundedConcurrency = Math.max(1, Math.floor(concurrency));

  for (let offset = 0; offset < items.length; offset += boundedConcurrency) {
    const batch = items.slice(offset, offset + boundedConcurrency);
    outcomes.push(...await Promise.allSettled(batch.map(task)));
  }

  return outcomes;
}
