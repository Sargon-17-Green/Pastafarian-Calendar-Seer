import test from 'node:test';
import assert from 'node:assert/strict';
import { queryBatch, queryRange } from '../index.mjs';

function delayedProvider() {
  let active = 0;
  let peak = 0;
  return {
    provider: Object.freeze({
      id: 'delayed-test-provider',
      async query({ calculationJdn, targetJdn }) {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return { record: { targetJdn: Number(targetJdn), year: 5000, cutletIndex: 0, dayInCutlet: 1, monthIndex: 0, dayInMonth: 1, cutletCount: 1, monthCount: 1 } };
      },
    }),
    peak: () => peak,
  };
}

test('batch executes resolved items concurrently while preserving result order', async () => {
  const delayed = delayedProvider();
  const result = await queryBatch({
    defaults: { calculation: { jdn: '900' }, presentation: 'canonical' },
    queries: Array.from({ length: 8 }, (_, i) => ({ id: String(i), target: { jdn: String(1000 + i) } })),
  }, { provider: delayed.provider });
  assert.ok(delayed.peak() > 1);
  assert.deepEqual(result.results.map((x) => x.id), ['0','1','2','3','4','5','6','7']);
  assert.deepEqual(result.results.map((x) => x.result.targetDay.jdn), ['1000','1001','1002','1003','1004','1005','1006','1007']);
});

test('range executes items concurrently while preserving range order', async () => {
  const delayed = delayedProvider();
  const result = await queryRange({ calculation: { jdn: '900' }, start: { jdn: '20' }, count: '8', presentation: 'canonical' }, { provider: delayed.provider });
  assert.ok(delayed.peak() > 1);
  assert.deepEqual(result.results.map((x) => x.targetDay.jdn), ['20','21','22','23','24','25','26','27']);
});
