import { describe, it, expect } from 'vitest';
import { writeWebFetchUserAgent } from './webFetchUserAgent';

// CC 2.1.295 chunk-sn362cnh.js
const EXCERPT =
  '.VERSION}${n}`}function Fyo(){return`Claude-User (${zo()}; +https://support.anthropic.com/)`}async function aF(e={}){if(!wv()&&bd())try{';

describe('writeWebFetchUserAgent', () => {
  it('replaces the WebFetch User-Agent with the configured string', () => {
    const result = writeWebFetchUserAgent(EXCERPT, 'MyBot/1.0 "quoted"');
    expect(result).toBe(
      '.VERSION}${n}`}function Fyo(){return "MyBot/1.0 \\"quoted\\""}async function aF(e={}){if(!wv()&&bd())try{'
    );
  });

  it('returns null when the anchor is absent', () => {
    expect(writeWebFetchUserAgent('unrelated content', 'x')).toBeNull();
  });
});
