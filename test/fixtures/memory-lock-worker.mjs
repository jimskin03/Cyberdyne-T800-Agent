// Child process for test/memory-dir-lock.test.mjs. Several of these share one
// MEMORY_DIR and report every operation result as one JSON line on stdout.
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {createLocalMemoryStore} from '../../tools/memory/local-store.mjs';
import {acquireDirectoryLock} from '../../tools/memory/dir-lock.mjs';

const [mode, directory, name, ...rest] = process.argv.slice(2);
const log = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const record = (id) => ({id, kind: 'intercom', text: `note ${id}`, at: 1_700_000_000_000, session: 'lock-test'});

async function waitForStart() {
  log({ready: name});
  while (!existsSync(join(directory, 'go'))) await sleep(2);
}

if (mode === 'hammer') {
  const [iterations, clearEvery, maxRecords, useEpoch] = rest.map(Number);
  const store = createLocalMemoryStore(directory, {maxRecords});
  await waitForStart();
  for (let i = 0; i < iterations; i++) {
    if (clearEvery && i % clearEvery === clearEvery - 1) {
      const result = await store.clear('cell');
      log({op: 'clear', worker: name, removed: result.removed, epoch: result.epoch});
      continue;
    }
    const id = `${name}-${i}`;
    const epoch = useEpoch ? await store.epoch('cell') : undefined;
    // Let other processes act between reading the generation and appending.
    if (i % 3 === 0) await sleep(Math.floor(Math.random() * 3));
    const result = await store.add('cell', [record(id)], {epoch});
    log({op: 'add', worker: name, id, seq: i, epoch: epoch ?? null, conflict: result.conflict, stored: result.stored});
  }
  log({done: name});
} else if (mode === 'hold') {
  const release = await acquireDirectoryLock(directory);
  log({locked: name});
  await sleep(Number(rest[0]));
  log({releasing: name});
  await release();
} else if (mode === 'exit') {
  await acquireDirectoryLock(directory);
  log({locked: name});
  process.exit(0);
} else if (mode === 'crash') {
  await acquireDirectoryLock(directory);
  log({locked: name});
  process.kill(process.pid, 'SIGKILL');
}
