import { describe, expect, it } from 'vitest';

import { writeWarnIgnoredCodeModeEnv } from './warnIgnoredCodeModeEnv';

// From CC 2.1.332 (chunk-gf6wnm23.js): the function that lists env keys a
// project's settings ignore, and the start of the next one, which holds the
// module's env truthiness check.
const NOTICES =
  'function _yi(){let t=[],r=[],n=Jo();for(let o of n){if(!KV(o))continue;if(o==="projectSettings"&&n.includes("userSettings")&&Cm())continue;let i=me(o)?.env??{},g=[],l=[];for(let a of Object.keys(i)){let e=a.toUpperCase();if(!y.has(e))continue;if(cqo(a,i[a],Fea))l.push(a);else g.push(a)}let d=vn(o),c=Tx(o);if(g.length>0)t.push({file:d,path:"env",message:`Claude Code ignores these telemetry variables in ${c}: ${g.join(", ")}. A project\'s settings files can only turn telemetry off: set OTEL_LOGS_EXPORTER, OTEL_METRICS_EXPORTER, or OTEL_TRACES_EXPORTER to none, or a content variable such as OTEL_LOG_USER_PROMPTS to 0, with the name in upper case. That doesn\'t work for a variable that managed settings, a --settings file, or the environment you start Claude Code from already sets. If you set them on purpose, set them in your shell, your user settings (~/.claude/settings.json), or managed settings instead.`,severity:"warning",statusOnly:!0});if(l.length>0)r.push({file:d,path:"env",message:`${c} turns telemetry off with these variables: ${l.join(", ")}. Claude Code uses these values unless managed settings or a --settings file sets the same variable. Your user settings don\'t override this file. To keep one on, set it in the environment you start Claude Code from, in a --settings file, or in managed settings.`,severity:"warning",statusOnly:!0})}return{ignored:t,turnedOff:r}}function O(){if(!De(process.env.CLAUDE_CODE_ENABLE_TELEMETRY)||!1||s.ENABLE_BETA_TRACING_DETAILED||LR($o()))return[];';

const isEnvTruthy = (v: unknown) =>
  typeof v === 'boolean'
    ? v
    : !!v &&
      ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase().trim());

type Notice = { file: string; path: string; message: string };

const ignoredNotices = (
  code: string,
  env: Record<string, Record<string, unknown>>
): Notice[] =>
  new Function(
    'Jo',
    'KV',
    'Cm',
    'me',
    'y',
    'cqo',
    'Fea',
    'vn',
    'Tx',
    'De',
    `${code}return[]};return _yi().ignored;`
  )(
    () => ['userSettings', 'projectSettings', 'localSettings'],
    (source: string) =>
      source === 'projectSettings' || source === 'localSettings',
    () => false,
    (source: string) => ({ env: env[source] }),
    new Set(['OTEL_LOGS_EXPORTER']),
    () => false,
    undefined,
    (source: string) => `/repo/.claude/${source}.json`,
    (source: string) => `.claude/${source}.json`,
    isEnvTruthy
  );

describe('writeWarnIgnoredCodeModeEnv', () => {
  it('says nothing about Code Mode without the patch', () => {
    expect(
      ignoredNotices(NOTICES, {
        localSettings: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' },
      })
    ).toEqual([]);
  });

  it('names the project or local file that sets it on', () => {
    const notices = ignoredNotices(writeWarnIgnoredCodeModeEnv(NOTICES)!, {
      userSettings: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' },
      projectSettings: { claude_code_experimental_code_mode: true },
      localSettings: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' },
    });
    expect(notices.map(n => [n.file, n.path])).toEqual([
      ['/repo/.claude/projectSettings.json', 'env'],
      ['/repo/.claude/localSettings.json', 'env'],
    ]);
    expect(notices[0].message).toMatch(
      /^Claude Code ignores claude_code_experimental_code_mode in \.claude\/projectSettings\.json: a project's settings files can't turn Code Mode on\./
    );
    expect(notices[1].message).toContain('~/.claude/settings.json');
  });

  it('ignores off values and keeps the telemetry notice', () => {
    const notices = ignoredNotices(writeWarnIgnoredCodeModeEnv(NOTICES)!, {
      localSettings: {
        CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '0',
        OTEL_LOGS_EXPORTER: 'otlp',
      },
    });
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toMatch(
      /^Claude Code ignores these telemetry variables/
    );
  });

  it('returns null when the notice list is not there', () => {
    expect(writeWarnIgnoredCodeModeEnv('let x=1;')).toBeNull();
    expect(
      writeWarnIgnoredCodeModeEnv(
        NOTICES.replace('process.env.CLAUDE_CODE_ENABLE_TELEMETRY', 'x')
      )
    ).toBeNull();
  });
});
