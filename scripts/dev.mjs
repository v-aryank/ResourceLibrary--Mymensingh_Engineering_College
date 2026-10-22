import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const apiPortStart = 3000;
const apiPortEnd = 3099;
const frontendPort = 5173;
const children = [];
let stopping = false;
let vercelRoot;
let resolveShutdown;
const shutdownPromise = new Promise((resolvePromise) => {
  resolveShutdown = resolvePromise;
});

function resolvePackageBin(packageName, binName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const bin = typeof packageJson.bin === 'string'
    ? packageJson.bin
    : packageJson.bin?.[binName];

  if (!bin) throw new Error(`Package "${packageName}" does not define "${binName}".`);
  return resolve(dirname(packageJsonPath), bin);
}

const vercelCli = resolvePackageBin('vercel', 'vercel');
const viteCli = resolvePackageBin('vite', 'vite');

async function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolvePromise(false);
      else rejectPromise(error);
    });
    server.listen(port, host, () => {
      server.close((error) => {
        if (error) rejectPromise(error);
        else resolvePromise(true);
      });
    });
  });
}

async function findApiPort() {
  for (let port = apiPortStart; port <= apiPortEnd; port += 1) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(
    `No API port is available between ${apiPortStart} and ${apiPortEnd}. Stop a local server on that range and retry.`,
  );
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;

  for (const child of children) {
    if (child.exitCode != null || child.signalCode != null || child.pid == null) continue;
    try {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else process.kill(-child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') {
        console.error(`Could not stop child process ${child.pid}: ${error.message}`);
      }
    }
  }

  process.exitCode = code;
  resolveShutdown();
  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode != null || child.signalCode != null || child.pid == null) continue;
      try {
        if (process.platform === 'win32') child.kill('SIGKILL');
        else process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') {
          console.error(`Could not force-stop child process ${child.pid}: ${error.message}`);
        }
      }
    }
  }, 5000);
  forceStop.unref();
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function start(command, args, label, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? projectRoot,
    detached: process.platform !== 'win32',
    stdio: 'inherit',
    env: options.env ?? process.env,
  });
  children.push(child);

  child.on('error', (error) => {
    if (!stopping) {
      console.error(`${label} could not start: ${error.message}`);
      stop(1);
    }
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      const result = signal ? ` (signal ${signal})` : ` (exit ${code ?? 'unknown'})`;
      console.error(`${label} stopped unexpectedly${result}. Stopping the other development process.`);
      stop(code && code > 0 ? code : 1);
    }
  });
  return child;
}

async function prepareVercelRoot() {
  const root = await mkdtemp(resolve(tmpdir(), 'mec-resource-library-vercel-'));
  await symlink(resolve(projectRoot, 'api'), resolve(root, 'api'), 'junction');
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify({ name: 'mec-resource-library-local-api', private: true, type: 'module' }),
  );

  const localEnv = resolve(projectRoot, '.env.local');
  if (existsSync(localEnv)) {
    await symlink(localEnv, resolve(root, '.env.local'), 'file');
  }
  return root;
}

function matchesApiResponse(response, body) {
  return response.status === 401 &&
    response.headers.get('content-type')?.includes('application/json') &&
    body?.error === 'Authentication required';
}

async function waitForApi(child, port) {
  let lastResponse = '';
  const deadline = Date.now() + 90_000;

  while (!stopping && Date.now() < deadline) {
    if (child.exitCode != null || child.signalCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/uploads/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(3000),
      });
      const body = await response.json().catch(() => null);
      lastResponse = `HTTP ${response.status}`;
      if (matchesApiResponse(response, body)) return;
    } catch (error) {
      lastResponse = error instanceof Error ? error.message : 'request failed';
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(
    `Vercel API server did not become ready on port ${port}${lastResponse ? `; last check: ${lastResponse}` : ''}. Check the Vercel CLI output and API configuration.`,
  );
}

async function waitForFrontend(child) {
  let lastIssue = '';
  const deadline = Date.now() + 60_000;

  while (!stopping && Date.now() < deadline) {
    if (child.exitCode != null || child.signalCode != null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${frontendPort}/`, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(2000),
      });
      const html = await response.text();
      if (
        response.status === 200 &&
        response.headers.get('content-type')?.includes('text/html') &&
        html.includes('id="root"')
      ) return;
      lastIssue = `HTTP ${response.status}`;
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : 'request failed';
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(
    `Vite did not become ready on http://localhost:${frontendPort}${lastIssue ? `; last check: ${lastIssue}` : ''}.`,
  );
}

async function verifyProxy(port) {
  const response = await fetch(`http://127.0.0.1:${frontendPort}/api/uploads/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);

  if (!matchesApiResponse(response, body)) {
    throw new Error(
      `The localhost /api proxy did not reach the Vercel API on port ${port} (HTTP ${response.status}).`,
    );
  }
}

try {
  if (!await isPortAvailable(frontendPort)) {
    throw new Error(
      `Frontend port ${frontendPort} is already in use. Stop its server from the owning terminal, then run npm run dev again.`,
    );
  }

  const apiPort = await findApiPort();
  vercelRoot = await prepareVercelRoot();
  const vercelEnv = {
    ...loadEnv('development', projectRoot, ''),
    ...process.env,
  };
  const vercel = start(
    process.execPath,
    [vercelCli, 'dev', vercelRoot, '--local', '--yes', '--listen', `127.0.0.1:${apiPort}`],
    'Vercel API server',
    { cwd: vercelRoot, env: vercelEnv },
  );
  await waitForApi(vercel, apiPort);

  const vite = start(
    process.execPath,
    [viteCli, '--host', 'localhost', '--port', String(frontendPort), '--strictPort', '--open'],
    'Vite frontend',
    { env: { ...process.env, API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` } },
  );
  await waitForFrontend(vite);
  await verifyProxy(apiPort);
  console.log(`Ready: frontend at http://localhost:${frontendPort}; API at http://localhost:${apiPort}.`);
  await shutdownPromise;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Development startup failed.');
  stop(1);
} finally {
  await Promise.all(children.map((child) => {
    if (child.exitCode != null || child.signalCode != null) return Promise.resolve();
    return new Promise((resolvePromise) => child.once('close', resolvePromise));
  }));

  if (vercelRoot) {
    try {
      await rm(vercelRoot, { recursive: true, force: true });
    } catch (error) {
      console.error(
        `Could not remove temporary Vercel API root ${vercelRoot}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      process.exitCode ||= 1;
    }
  }
}
