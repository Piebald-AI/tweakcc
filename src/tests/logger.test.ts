import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDebug, debug, warn } from '../utils';

describe('isDebug', () => {
  const originalEnv = process.env.DEBUG;

  beforeEach(() => {
    delete process.env.DEBUG;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEBUG = originalEnv;
    } else {
      delete process.env.DEBUG;
    }
  });

  it('returns true when DEBUG=tweakcc', () => {
    process.env.DEBUG = 'tweakcc';
    expect(isDebug()).toBe(true);
  });

  it('returns true when DEBUG=*', () => {
    process.env.DEBUG = '*';
    expect(isDebug()).toBe(true);
  });

  it('returns false when DEBUG is unset', () => {
    delete process.env.DEBUG;
    expect(isDebug()).toBe(false);
  });

  it('returns false when DEBUG is set to another value', () => {
    process.env.DEBUG = 'other-app';
    expect(isDebug()).toBe(false);
  });
});

describe('debug', () => {
  it('only outputs when debug is enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.DEBUG;

    debug('should not appear');
    expect(spy).not.toHaveBeenCalled();

    process.env.DEBUG = 'tweakcc';
    debug('should appear');
    expect(spy).toHaveBeenCalledWith('should appear');

    spy.mockRestore();
    delete process.env.DEBUG;
  });
});

describe('warn', () => {
  it('always outputs via console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warn('warning message');
    expect(spy).toHaveBeenCalledWith('warning message');

    spy.mockRestore();
  });
});
