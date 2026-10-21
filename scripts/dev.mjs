import { execFileSync, spawn } from 'node:child_process';
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

  if (!bin) {
    throw new Error(`Package "${packageName}" does not define "${binName}".`);
  }

  return resolve(dirname(packageJsonPath), bin);
}

const vercelCli = resolvePackageBin('vercel', 'vercel');
const viteCli = resolvePackageBin('vite', 'vite');

function portListener(port) {
  if (process.platform === 'win32') return '';
  try {
    return execFileSync('ss', ['-ltnp', `( sport = :${port} )`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n').slice(1).filter(Boolean).join('; ');
  } catch {
    return '';
  }
}

async function assertPortAvailable(port, service) {
  await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.once('error', (error) => {
      const listener = portListener(port);
      rejectPromise(
        new Error(
          `${service} cannot start because port ${port} is already in use${listener ? ` (${listener})` : ''}. Stop the listener from its owning terminal and retry; this launcher will not terminate it.`,
        ),
      );
    });
    server.listen(port, '0.0.0.0', () => {
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

  for (const child of children) {
    if (child.exitCode == null && child.signalCode == null) {
      if (process.platform === 'win32') child.kill('SIGTERM');
      else if (child.pid == null) continue;
      else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch (error) {
          if (error.code !== 'ESRCH') {
            console.error(`Could not stop child process ${child.pid}: ${error.message}`);
          }
        }
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
    JSON.stringify({
      name: 'mec-resource-library-local-api',
      private: true,
      type: 'module',
    }),
  );

  const localEnv = resolve(projectRoot, '.env.local');
  if (existsSync(localEnv)) {
    await symlink(localEnv, resolve(root, '.env.local'), 'file');
  }

  return root;
}

async function waitForApi(child) {
  let lastResponse = '';

  for (let attempt = 0; attempt < 4 && !stopping; attempt += 1) {
    if (child.exitCode != null || child.signalCode != null) break;

    try {
      const response = await fetch('http://127.0.0.1:3000/api/uploads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json().catch(() => null);
      lastResponse = `HTTP ${response.status} (${response.headers.get('content-type') ?? 'unknown content type'})`;

      if (
        response.status === 401 &&
        response.headers.get('content-type')?.includes('application/json') &&
        body?.error === 'Authentication required'
      ) {
        return;
      }
    } catch (error) {
      lastResponse = error instanceof Error ? error.message : 'request failed';
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  }

  throw new Error(
    `Vercel API server did not return the expected unauthenticated response on port 3000${lastResponse ? `; last response was ${lastResponse}` : ''}. Check the Vercel CLI output and API function configuration.`,
  );
}

async function waitForVite(child) {
  let lastIssue = '';

  for (let attempt = 0; attempt < 60 && !stopping; attempt += 1) {
    if (child.exitCode != null || child.signalCode != null) break;

    try {
      const page = await fetch('http://127.0.0.1:5173/', {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(1500),
      });
      const pageText = await page.text();
      const module = await fetch('http://127.0.0.1:5173/src/main.tsx', {
        signal: AbortSignal.timeout(1500),
      });
      const moduleText = await module.text();
      const contentType = module.headers.get('content-type') ?? '';

      if (
        page.status === 200 &&
        page.headers.get('content-type')?.includes('text/html') &&
        pageText.includes('id="root"') &&
        module.status === 200 &&
        contentType.includes('javascript') &&
        !moduleText.trimStart().startsWith('<!doctype html')
      ) {
        return;
      }

      lastIssue = `frontend HTTP ${page.status}, module HTTP ${module.status} (${contentType})`;
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : 'request failed';
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(
    `Vite did not serve the frontend and JavaScript module on port 5173${lastIssue ? `; last check: ${lastIssue}` : ''}. Check the Vite output and port availability.`,
  );
}

async function verifyProxy() {
  const response = await fetch('http://127.0.0.1:5173/api/uploads/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);

  if (
    response.status !== 401 ||
    !response.headers.get('content-type')?.includes('application/json') ||
    body?.error !== 'Authentication required'
  ) {
    throw new Error(
      `Vite's /api proxy did not reach the Vercel handler (HTTP ${response.status}). Check vite.config.ts and the Vercel API process.`,
    );
  }
}

try {
  await assertPortAvailable(3000, 'Vercel API server');
  await assertPortAvailable(5173, 'Vite frontend');
  vercelRoot = await prepareVercelRoot();
  const vercelEnv = {
    ...loadEnv('development', projectRoot, ''),
    ...process.env,
  };

  const vercel = start(
    process.execPath,
    [vercelCli, 'dev', vercelRoot, '--local', '--yes', '--listen', '127.0.0.1:3000'],
    'Vercel API server',
    { cwd: vercelRoot, env: vercelEnv },
  );
  await waitForApi(vercel);

  const vite = start(
    process.execPath,
    [viteCli, '--host', 'localhost', '--port', '5173', '--strictPort', '--open'],
    'Vite frontend',
  );
  await waitForVite(vite);
  await verifyProxy();
  console.log('Ready: Vercel API at http://localhost:3000 and Vite frontend at http://localhost:5173.');
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
