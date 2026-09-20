import {
  gregorianToJdn,
  jdnToGregorian,
  listLocales,
  queryBatch,
  queryCalculationDay,
  queryDate,
  queryRange,
  queryReverse,
  queryYear,
  type DateResponse,
  type ExactIntegerString,
  type LocaleMetadata,
} from 'pastafarian-calendar-seer';
import {
  SeerClientError,
  createSeerClient,
  type SeerClient,
} from 'pastafarian-calendar-seer/client';
import {
  createSeerHttpHandler,
  createSeerHttpServer,
  listen,
} from 'pastafarian-calendar-seer/http';
import { createSeerHttpServer as createServerDirect } from 'pastafarian-calendar-seer/http/server';

const exact: ExactIntegerString = '-13337246';
const jdn = gregorianToJdn({ era: 'BCE', year: '762', month: 6, day: 7 });
const gregorian = jdnToGregorian(jdn);
const locales: readonly Readonly<LocaleMetadata>[] = listLocales();

const date: DateResponse = await queryDate({
  calculation: { jdn: '2461302' },
  target: { gregorian: '2026-09-20' },
  observer: { longitude: 35.2137 },
  presentation: 'canonical',
  include: ['structure', 'resolution'],
});
date.targetDay.gregorian.year satisfies ExactIntegerString;

await queryCalculationDay({
  at: '2026-09-20T08:00:00Z',
  observer: { preset: 'kisurra' },
  include: ['boundaries'],
});

const batch = await queryBatch({
  defaults: { calculation: { jdn: 2461302 }, presentation: 'canonical' },
  queries: [
    { id: 'first', target: { gregorian: '2026-09-20' } },
    { id: 'second', target: { offsetDays: 10n } },
  ],
});
for (const item of batch.results) {
  if (item.ok) item.result.pastafarianDate.year satisfies ExactIntegerString;
  else item.error.code satisfies string;
}

await queryRange({
  calculation: { jdn: exact },
  start: { jdn: '2461304' },
  count: '3',
  stepDays: 1,
  calculationMode: 'fixed',
});
await queryRange({
  start: { gregorian: '2026-09-20' },
  endInclusive: { gregorian: '2026-09-24' },
  calculationMode: 'same-as-target',
});

await queryReverse({
  calculation: { jdn: '2461302' },
  pastafarianDate: {
    year: '5000',
    cutlet: { canonicalIndex: 5, day: 351 },
    month: { canonicalIndex: 33, day: 69 },
  },
  presentation: 'canonical',
});
await queryYear('5000', {
  calculation: { jdn: '2461302' },
  presentation: 'canonical',
  include: ['days', 'resolution'],
});

const client: SeerClient = createSeerClient('https://seer.example');
await client.queryDate({ target: { jdn: '2461304' }, presentation: 'canonical' });
await client.queryNow({ observer: 'kisurra', presentation: 'canonical' });
await client.queryYear('5000', { observer: { longitude: 45.481 } });
await client.getLocales();
await client.getMeta();
await client.getStatus();
await client.getOpenApi();

const clientError = new SeerClientError('failed', { status: 503, code: 'SEER_UNAVAILABLE' });
clientError.status satisfies number;

const handler = createSeerHttpHandler({ maxBodyBytes: 1024 });
const server = createSeerHttpServer({ host: '127.0.0.1', port: 0 });
const directServer = createServerDirect({ port: '0' });
void handler;
server.close();
directServer.close();
void gregorian;
void locales;

// @ts-expect-error exact integer strings must be canonical integer text
await queryDate({ calculation: { jdn: 'not-an-integer' } });
// @ts-expect-error calculation accepts exactly one selector
await queryDate({ calculation: { jdn: '2461302', at: '2026-09-20T00:00:00Z' } });
// @ts-expect-error target accepts exactly one selector
await queryDate({ target: { jdn: '2461304', gregorian: '2026-09-20' } });
// @ts-expect-error observer preset and longitude are mutually exclusive
await queryDate({ observer: { preset: 'kisurra', longitude: 45 } });
// @ts-expect-error unsupported presentation
await queryDate({ presentation: 'machine' });
// @ts-expect-error unsupported date include
await queryDate({ include: ['days'] });
// @ts-expect-error range requires count or endInclusive
await queryRange({ start: { jdn: '2461304' } });
// @ts-expect-error range accepts count or endInclusive, not both
await queryRange({ count: 2, endInclusive: { jdn: '2461305' } });
// @ts-expect-error reverse requires the complete cutlet and month tuple
await queryReverse({ pastafarianDate: { year: '5000', cutlet: { canonicalIndex: 1, day: 1 } } });
// @ts-expect-error queryYear needs an exact integer year
await queryYear('year-five-thousand');
// @ts-expect-error POST-backed client date calls require object observer input
await client.queryDate({ observer: 'kisurra' });
// @ts-expect-error only the supported observer preset is typed
await client.queryNow({ observer: 'jerusalem' });
// @ts-expect-error HTTP port must be numeric text or a number
await listen({ port: false });
