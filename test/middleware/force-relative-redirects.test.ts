import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { forceRelativeRedirects } from '../../src/worker/middleware/force-relative-redirects';

describe('forceRelativeRedirects middleware', () => {
  it('should convert absolute labelzoom.net redirect to relative', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('https://api.labelzoom.net/some/path?query=value', 302);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/some/path?query=value');
  });

  it('should convert absolute www.labelzoom.net redirect to relative', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('https://www.labelzoom.net/another/path', 301);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('/another/path');
  });

  it('should leave relative redirects unchanged', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('/relative/path', 302);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/relative/path');
  });

  it('should not modify redirects to other domains', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('https://example.com/path', 302);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/path');
  });

  it('should handle 201 Created responses with Location header', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.post('/test', (c) => {
      return c.json({ created: true }, 201, {
        Location: 'https://api.labelzoom.net/resource/123',
      });
    });

    const res = await app.request('/test', { method: 'POST' });
    
    expect(res.status).toBe(201);
    expect(res.headers.get('Location')).toBe('/resource/123');
  });

  it('should not modify non-redirect responses', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.json({ message: 'OK' }, 200);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'OK' });
  });

  it('should handle redirects with query parameters', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('https://labelzoom.net/path?foo=bar&baz=qux', 302);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/path?foo=bar&baz=qux');
  });

  it('should handle case-insensitive domain matching', async () => {
    const app = new Hono();
    app.use(forceRelativeRedirects());
    app.get('/test', (c) => {
      return c.redirect('https://API.LABELZOOM.NET/path', 302);
    });

    const res = await app.request('/test');
    
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/path');
  });
});

