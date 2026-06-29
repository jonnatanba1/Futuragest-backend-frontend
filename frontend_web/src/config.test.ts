import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiBaseUrl } from './config';

afterEach(() => {
  delete window.__APP_CONFIG__;
  vi.unstubAllEnvs();
});

describe('resolveApiBaseUrl', () => {
  it('prefers the runtime window.__APP_CONFIG__ origin over the build-time env', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://baked-at-build');
    window.__APP_CONFIG__ = { apiBaseUrl: 'https://api.futuragest.co' };
    expect(resolveApiBaseUrl()).toBe('https://api.futuragest.co');
  });

  it('strips trailing slashes from the resolved origin', () => {
    window.__APP_CONFIG__ = { apiBaseUrl: 'https://api.futuragest.co///' };
    expect(resolveApiBaseUrl()).toBe('https://api.futuragest.co');
  });

  it('falls back to VITE_API_BASE_URL when no runtime origin is present', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://build-time:3001');
    expect(resolveApiBaseUrl()).toBe('http://build-time:3001');
  });

  it('treats an empty runtime origin as absent and falls back to the build env', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://build-time:3001');
    window.__APP_CONFIG__ = { apiBaseUrl: '' };
    expect(resolveApiBaseUrl()).toBe('http://build-time:3001');
  });

  it('defaults to the local backend when nothing is configured', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(resolveApiBaseUrl()).toBe('http://localhost:3001');
  });
});
