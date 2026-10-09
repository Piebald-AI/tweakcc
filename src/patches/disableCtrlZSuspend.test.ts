import { describe, expect, it, vi } from 'vitest';

import { writeDisableCtrlZSuspend } from './disableCtrlZSuspend';

// Trimmed from CC 2.1.295 chunk-x31wb8sb.js (Ink input loop).
const EXCERPT =
  'if(T.kind==="paste"){n.props.dispatchPasteEvent(T.text);continue}' +
  'if(T.name==="z"&&T.ctrl&&tYn()){n.handleSuspend();continue}' +
  'if(n.handleInput(T.sequence),T.name==="wheelup"||T.name==="wheeldown"||T.name==="mouse"){}';

describe('writeDisableCtrlZSuspend', () => {
  it('short-circuits the Ctrl-Z suspend check', () => {
    const result = writeDisableCtrlZSuspend(EXCERPT);

    expect(result).toBe(
      EXCERPT.replace('if(T.name==="z"', 'if(!1&&T.name==="z"')
    );
  });

  it('returns null when the anchor is absent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(writeDisableCtrlZSuspend('if(T.name==="x"){}')).toBeNull();
    spy.mockRestore();
  });
});
