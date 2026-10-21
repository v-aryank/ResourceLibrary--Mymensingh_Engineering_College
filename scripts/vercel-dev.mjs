import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const listenHost = '127.0.0.1';
const listenPort = 3001;
let child;
let stopping = false;
let resolveShutdown;
const shutdownPromise = new Promise((resolvePromise) => {
  resolveShutdown = resolvePromise;
});

function resolveVercelCli() {
  const packageJsonPath = require.resolve('vercel/package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const bin = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.vercel;

  if (!bin) throw new Error('The installed Vercel package has no CLI entry point.');
  return resolve(dirname(packageJsonPath), bin);
}

function portListener() {
  if (process.platform === 'win32') return '';
  try {
    return execFileSync('ss', ['-ltnp', `( sport = :${listenPort} )`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').slice(1).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

async function assertPortAvailable() {
  await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', () => {
      const listener = portListener();
      rejectPromise(new Error(
        `Integrated Vercel workflow cannot start: port ${listenPort} is already in use${listener ? ` (${listener})` : ''}. Stop the listener from its owning terminal and retry; this launcher will not terminate it.`,
      ));
    });
    server.listen(listenPort, listenHost, () => {
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise();
      });
    });
  });
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;

  if (child?.exitCode == null && child?.signalCode == null && child?.pid != null) {
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error(`Could not stop the integrated Vercel process: ${error.message}`);
      }
    }
  }

  process.exitCode = code;
  resolveShutdown();

  const forceStop = setTimeout(() => {
    if (child?.exitCode != null || child?.signalCode != null || child?.pid == null) return;
    try {
      if (process.platform === 'win32') child.kill('SIGKILL');
      else process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error(`Could not force-stop the integrated Vercel process: ${error.message}`);
      }
    }
  }, 5000);
  forceStop.unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function requestMatches(response, body) {
  return response.status === 401 &&
    response.headers.get('content-type')?.includes('application/json') &&
    body?.error === 'Authentication required';
}

async function waitForServer() {
  let lastIssue = '';
  const deadline = Date.now() + 60_000;
  while (!stopping && Date.now() < deadline) {
    if (child.exitCode != null || child.signalCode != null) break;

    try {
      const [page, api] = await Promise.all([
        fetch(`http://${listenHost}:${listenPort}/admin`, {
          headers: { Accept: 'text/html' },
          signal: AbortSignal.timeout(10_000),
        }),
        fetch(`http://${listenHost}:${listenPort}/api/uploads/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(10_000),
        }),
      ]);
      const [pageText, apiBody] = await Promise.all([
        page.text(),
        api.json().catch(() => null),
      ]);

      if (
        page.status === 200 &&
        page.headers.get('content-type')?.includes('text/html') &&
        pageText.includes('id="root"') &&
        requestMatches(api, apiBody)
      ) {
        return;
      }

      lastIssue = `frontend HTTP ${page.status}; API HTTP ${api.status} (${api.headers.get('content-type') ?? 'unknown content type'})`;
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : 'request failed';
    }

    if (Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }

  throw new Error(
    `Vercel did not serve the frontend and API on port ${listenPort}${lastIssue ? `; last check: ${lastIssue}` : ''}. Check the Vercel CLI output and local project configuration.`,
  );
}

try {
  await assertPortAvailable();
  child = spawn(
    process.execPath,
    [
      resolveVercelCli(),
      'dev',
      '--local',
      '--yes',
      '--listen',
      `${listenHost}:${listenPort}`,
      '--queue-port',
      '4792',
      '--runtime-cache-port',
      '4793',
      '--schedules-port',
      '4794',
    ],
    {
      cwd: projectRoot,
      detached: process.platform !== 'win32',
      stdio: 'inherit',
    },
  );

  child.on('error', (error) => {
    if (!stopping) {
      console.error(`Vercel CLI could not start: ${error.message}`);
      stop(1);
    }
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      const result = signal ? ` (signal ${signal})` : ` (exit ${code ?? 'unknown'})`;
      console.error(`Vercel stopped unexpectedly${result}.`);
      stop(code && code > 0 ? code : 1);
    }
  });

  await waitForServer();
  console.log('Ready: integrated Vercel frontend and API at http://localhost:3001.');
  await shutdownPromise;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Integrated Vercel startup failed.');
  stop(1);
} finally {
  if (child && child.exitCode == null && child.signalCode == null) {
    await new Promise((resolvePromise) => child.once('close', resolvePromise));
  }
}
