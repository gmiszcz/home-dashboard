import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, fetchAcks, fetchLatest, removeAck, sendAck } from './api';

function reply(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('api', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { localStorage: { getItem: () => 'tok' } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed body and sends the bearer token', async () => {
    fetchMock.mockResolvedValue(reply(200, { sections: [] }));
    await expect(fetchLatest()).resolves.toEqual({ sections: [] });
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('throws ApiError with status 401', async () => {
    fetchMock.mockResolvedValue(reply(401));
    const error = await fetchLatest().catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it('throws ApiError on a non-OK status', async () => {
    fetchMock.mockResolvedValue(reply(500));
    await expect(fetchAcks('ai_daily')).rejects.toMatchObject({ status: 500 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/acks?section=ai_daily');
  });

  it('posts the kind only when given', async () => {
    fetchMock.mockResolvedValue(reply(200));
    await sendAck('s', 'i');
    await sendAck('s', 'i', 'skipped');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ section: 's', item_id: 'i' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ section: 's', item_id: 'i', kind: 'skipped' });
  });

  it('rejects sendAck and removeAck when the server refuses, so callers can roll back', async () => {
    fetchMock.mockResolvedValue(reply(403));
    await expect(sendAck('s', 'i')).rejects.toBeInstanceOf(ApiError);
    await expect(removeAck('s', 'i')).rejects.toBeInstanceOf(ApiError);
  });

  it('encodes the ack identifiers on delete', async () => {
    fetchMock.mockResolvedValue(reply(200));
    await removeAck('a b', 'x/y');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ack?section=a%20b&item_id=x%2Fy');
  });
});
