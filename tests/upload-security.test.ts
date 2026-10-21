import test from 'node:test';
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import createUpload from '../api/uploads/create';
import abortUpload from '../api/uploads/abort';
import completeUpload from '../api/uploads/complete';
import deleteResource from '../api/resources/delete';
import saveThumbnail from '../api/uploads/save-thumbnail';
import signPart from '../api/uploads/sign-part';
import storageHealth from '../api/storage-health';
import signThumbnail from '../api/uploads/thumbnail-url';
import {
  matchesThumbnailSignature,
  validatePdfUpload,
  validateThumbnailUpload,
} from '../api/_lib/upload-validation';

function responseRecorder() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const response = {
    setHeader(name: string, value: string) { state.headers[name] = value; return response; },
    status(code: number) { state.status = code; return response; },
    json(body: unknown) { state.body = body; return response; },
  };
  return { state, response: response as unknown as VercelResponse };
}

test('PDF server validation enforces PDF type and the 300 MB size limit', () => {
  assert.equal(validatePdfUpload({ filename: 'notes.pdf', contentType: 'application/pdf', size: 1 }), null);
  assert.ok(validatePdfUpload({ filename: 'notes.pdf', contentType: 'text/plain', size: 1 }));
  assert.ok(validatePdfUpload({ filename: 'notes.pdf', contentType: 'application/pdf', size: 300 * 1024 * 1024 + 1 }));
});

test('thumbnail validation checks MIME, size, and file signatures', () => {
  assert.equal(validateThumbnailUpload({ contentType: 'image/png', size: 8 }), null);
  assert.ok(validateThumbnailUpload({ contentType: 'image/svg+xml', size: 8 }));
  assert.ok(validateThumbnailUpload({ contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }));
  assert.equal(matchesThumbnailSignature('image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(matchesThumbnailSignature('image/png', new Uint8Array([1, 2, 3])), false);
});

test('unauthenticated multipart upload is rejected before storage access', async () => {
  const { state, response } = responseRecorder();
  await createUpload({ method: 'POST', headers: {}, body: {} } as VercelRequest, response);
  assert.equal(state.status, 401);
  assert.deepEqual(state.body, { error: 'Authentication required' });
});

test('unauthenticated deletion is rejected before a resource lookup', async () => {
  const { state, response } = responseRecorder();
  await deleteResource({ method: 'POST', headers: {}, body: { resourceId: '00000000-0000-4000-8000-000000000000' } } as VercelRequest, response);
  assert.equal(state.status, 401);
  assert.deepEqual(state.body, { error: 'Authentication required' });
});

test('unauthenticated storage diagnostics are rejected before storage access', async () => {
  const { state, response } = responseRecorder();
  await storageHealth({ method: 'GET', headers: {} } as VercelRequest, response);
  assert.equal(state.status, 401);
  assert.deepEqual(state.body, { error: 'Authentication required' });
});

test('upload lifecycle and thumbnail endpoints reject unauthenticated requests first', async () => {
  const handlers = [
    ['upload completion', completeUpload, 'POST'],
    ['upload cancellation', abortUpload, 'POST'],
    ['part signing', signPart, 'POST'],
    ['thumbnail signing', signThumbnail, 'POST'],
    ['thumbnail persistence', saveThumbnail, 'POST'],
  ] as const;

  for (const [name, handler, method] of handlers) {
    const { state, response } = responseRecorder();
    await handler({ method, headers: {}, body: {} } as VercelRequest, response);
    assert.equal(state.status, 401, `${name} should reject unauthenticated callers`);
    assert.deepEqual(state.body, { error: 'Authentication required' });
  }
});
