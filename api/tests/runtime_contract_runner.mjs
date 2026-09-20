import http from 'node:http';
import process from 'node:process';
import { createSeerHttpHandler } from '../../http/app.mjs';

const FIXED_NOW = new Date('2026-09-20T09:00:00.000Z');

const fixtureProvider = Object.freeze({
  id: 'runtime-contract-fixture',
  async query() {
    return {
      record: {
        year: 5000,
        cutletIndex: 0,
        dayInCutlet: 1,
        monthIndex: 0,
        dayInMonth: 1,
        dayInYear: 1,
        yearLengthDays: 5778,
        cutletCount: 1,
        currentCutletLengthDays: 5778,
        monthCount: 1,
        currentMonthLengthDays: 123,
      },
      provenance: {
        calendarRevision: 'contract-fixture',
        engineRevision: 'contract-fixture',
        dataRevision: 'contract-fixture',
      },
    };
  },
  async year({ year }) {
    return {
      year: {
        number: year.toString(),
        startJdn: '1000',
        cutlets: [{ cutletIndex: 0, lengthDays: 5778, startOffset: 0 }],
        months: [{ monthIndex: 0, lengthDays: 123, startOffset: 0 }],
      },
      provenance: {
        calendarRevision: 'contract-fixture',
        engineRevision: 'contract-fixture',
        dataRevision: 'contract-fixture',
      },
    };
  },
});

const fixtureBoundary = Object.freeze({
  async calculationDayAt() {
    return 1000n;
  },
  async dayBoundaries() {
    return {
      startsAt: '2026-09-20T00:00:00.000Z',
      endsAt: '2026-09-21T00:00:00.000Z',
    };
  },
});

function endpointFor(operation) {
  switch (operation) {
    case 'date': return '/v1/date';
    case 'batch': return '/v1/batch';
    case 'range': return '/v1/range';
    case 'reverse': return '/v1/reverse';
    case 'locales': return '/v1/locales';
    default: throw new Error(`Unknown runtime-contract operation: ${operation}`);
  }
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return JSON.parse(text);
}

async function main() {
  const cases = await readStdin();
  if (!Array.isArray(cases)) throw new TypeError('runner input must be an array');

  const server = http.createServer(createSeerHttpHandler({
    queryOptions: {
      provider: fixtureProvider,
      dayBoundaryService: fixtureBoundary,
      maxBatchItems: 100,
      maxRangeItems: 100,
    },
    nowFactory: () => new Date(FIXED_NOW),
    healthProbe: { probe: async () => ({ status: 'ok' }) },
    logger: { error() {} },
  }));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const outcomes = [];
  try {
    for (const item of cases) {
      const operation = item.operation;
      const path = endpointFor(operation);
      const init = operation === 'locales'
        ? { method: 'GET', headers: { accept: 'application/json' } }
        : {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
            },
            body: JSON.stringify(item.request),
          };
      const response = await fetch(base + path, init);
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = { __nonJsonBody: text };
      }
      outcomes.push({
        id: item.id,
        operation,
        status: response.status,
        contentType: response.headers.get('content-type'),
        body,
      });
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }

  process.stdout.write(JSON.stringify(outcomes));
}

await main();
