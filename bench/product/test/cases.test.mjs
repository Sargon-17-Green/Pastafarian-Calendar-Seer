import assert from 'node:assert/strict';
import test from 'node:test';
import { buildScenarios } from '../cases.mjs';

test('exact workload coordinates survive cache rejection', async () => {
  const exactFixture = {
    generatedDir: 'ignored-cache-dir',
    calcJdn: 2461304n,
    missTargetJdn: 2461695n,
  };
  const api = {
    async queryDate() {
      return {
        targetDay: { jdn: '2461304' },
        pastafarianDate: {
          year: '1',
          cutlet: '1',
          dayInCutlet: '1',
          month: '1',
          dayInMonth: '1',
        },
      };
    },
  };

  const { scenarios, workload } = await buildScenarios(api, null, {
    smoke: true,
    exactFixture,
  });

  assert.deepEqual(workload.exactMiss, {
    calculationJdn: '2461304',
    targetJdn: '2461695',
  });
  assert.equal(scenarios.some((item) => item.id === 'cached_date'), false);
});
