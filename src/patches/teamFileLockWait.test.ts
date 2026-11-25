import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { open, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { writeTeamFileLockWait } from './teamFileLockWait';

// The team file's lock options and updateTeamFile from CC 2.1.332
// (chunk-e7bby5x1.js).
const TEAM_FILE =
  'var H={realpath:!1,retries:{retries:10,minTimeout:5,maxTimeout:100},onCompromised:()=>{}};function S(e){return new T(`Internal error: team file for "${e}" not found. The session team should have been initialized at startup.`,"Team file missing (session team not initialized)")}async function VEe(e,r,n,a){if(a)return J(e,r,n,a);let o=cRt(e),f;try{f=await ec(o,{lockfilePath:`${o}.lock`,...H})}catch(u){if(b(u)==="ENOENT")throw S(e);throw u}try{let u=await VE(e);if(!u)throw Error("Team config file unreadable (lock acquired, read failed)");let p=r(u);if(p===!1)return;try{let g=_(u,null,2),s=await O(o,"r+");try{await C(s,g),await s.truncate(Buffer.byteLength(g))}finally{await s.close()}}catch(g){if(!n?.bestEffortWrite)throw b(g)==="ENOENT"?S(e):g;YEo(e,g)}return p}finally{try{await f()}catch(u){t(`[TeammateTool] updateTeamFile lock release failed: ${d(u)}`)}}}';

// The lock library Claude Code bundles (chunk-2vrk8mw4.js) and its backoff
// (Dl in chunk-gs5rwyjz.js), from CC 2.1.332.
const LOCK_LIBRARY =
  'var p=Symbol(),D="__signal_exit_emitter__",E="SIGABRT SIGALRM SIGHUP SIGINT SIGTERM SIGIOT SIGQUIT SIGSYS SIGUSR2 SIGVTALRM SIGXCPU SIGXFSZ SIGIO SIGPOLL SIGPWR SIGSTKFLT".split(" "),T={mkdir:F,realpath:U,rmdir:j,rmdirSync:d,stat:K,utimes:B},u=new Map,I=!1;function ie(e,n={}){return m((t)=>x(e,{fs:T,...n},t)).then((t)=>()=>m(t))}function re(e,n){let t={mkdir:(i,r)=>l(()=>H(i),r),rmdir:(i,r)=>l(()=>d(i),r),stat:(i,r)=>l(()=>X(i),r),utimes:(i,r,s,c)=>l(()=>Q(i,r,s),c),rmdirSync:d},o=L((i)=>x(e,{...n,fs:t},i));return()=>L(o)}function se(e,n={}){return m((t)=>G(e,{fs:T,...n},t))}function ce(e,n={}){let t={fs:T,...n};return m((o)=>v(e,t,o,(i,r)=>t.fs.stat(r,(s,c)=>s?o(f(s)==="ENOENT"?null:s,!1):o(null,!N(c,t)))))}function ae(){return Array.from(u.values(),(e)=>e.claim.directory)}function x(e,n,t){let{retries:o}=n;if(!I)V();v(e,n,t,(i,r)=>C({path:i,directory:r,options:n},Z(typeof o==="object"?o:{retries:o||0}),[],t))}function C(e,n,t,o){let{path:i,options:r}=e;k(e,!0,(s,c)=>{if(s){let a=n[t.push(s)-1];if(a===void 0)return o(z(t));setTimeout(C.bind(null,e,n,t,o),a);return}u.set(i,c),S(i,r),o(null,(a)=>c.isReleased?a(Object.assign(Error("Lock is already released"),{code:"ERELEASED"})):G(i,{...r,realpath:!1},a))})}function k(e,n,t){let{path:o,directory:i,options:r}=e;r.fs.mkdir(i,(s)=>{if(!s)return q(e,t);if(f(s)!=="EEXIST")return t(s);let c=Object.assign(Error("Lock file is already being held"),{code:"ELOCKED",file:o});if(!n)return t(c);r.fs.stat(i,(a,P)=>{if(a)return f(a)==="ENOENT"?k(e,!1,t):t(a);if(!N(P,r))return t(c);A(i,r.fs,(y)=>y?t(y):k(e,!1,t))})})}function q(e,n){let{fs:t}=e.options,o=t[p];if(o!==void 0)return h(e,o,n);let i=new Date(Math.ceil(Date.now()/1000)*1000+5);t.utimes(e.directory,i,i,(r)=>r?R(e,r,n):h(e,o,n))}function h(e,n,t){let{fs:o}=e.options;o.stat(e.directory,(i,r)=>{if(i)return R(e,i,t);let s=r.mtime.getTime(),c=n??s%1000!==0;if(o[p]===void 0)Reflect.defineProperty(o,p,{value:c});t(null,{claim:e,keepsMilliseconds:c,mtime:s,touchedAt:Date.now(),delay:0})})}function R(e,n,t){e.options.fs.rmdir(e.directory,()=>{}),t(n)}function G(e,n,t){v(e,n,t,(o,i)=>{let r=u.get(o);if(!r||r.isReleased)return t(Object.assign(Error("Lock is not acquired/owned by you"),{code:"ENOTACQUIRED"}));if(clearTimeout(r.timer),r.isReleased=!0,r.afterLook)r.afterLook.push(w.bind(null,r,i,n.fs,t));else w(r,i,n.fs,t)})}function w(e,n,t,o){if(u.get(e.claim.path)===e)u.delete(e.claim.path);A(n,t,o)}function v(e,{fs:n,lockfilePath:t,...o},i,r){if("realpath"in o&&!o.realpath){let s=Y(e);return r(s,t||`${s}.lock`)}n.realpath(e,(s,c)=>s?i(s):r(c,t||`${c}.lock`))}function S(e,n){let t=u.get(e);if(!t||t.timer||t.afterLook)return;t.delay||=Math.max(Math.min(n.update??1/0,b(n)/2)||0,1000),t.timer=setTimeout(J.bind(null,t,n),t.delay).unref()}function J(e,n){let{path:t,directory:o}=e.claim;e.timer=void 0,e.afterLook=[],n.fs.stat(o,(i,r)=>{if(e.afterLook.forEach((a)=>a()),e.afterLook=void 0,i)return O(e,n,i);if(r.mtime.getTime()!==e.mtime)return M(e,Error("Unable to update lock within the stale threshold"));if(e.isReleased)return;let s=Date.now(),c=new Date(e.keepsMilliseconds?s:Math.ceil(s/1000)*1000);n.fs.utimes(o,c,c,(a)=>{if(e.isReleased)return;if(a)return O(e,n,a);e.mtime=c.getTime(),e.touchedAt=Date.now(),e.delay=0,S(t,n)})})}function O(e,n,t){if(f(t)==="ENOENT"||e.touchedAt+b(n)<Date.now())return M(e,t);e.delay=1000,S(e.claim.path,n)}function M(e,n){let{path:t,options:o}=e.claim;if(e.isReleased=!0,clearTimeout(e.timer),u.get(t)===e)u.delete(t);let i=Object.assign(Object(n),{code:"ECOMPROMISED"});if(!o.onCompromised)throw i;o.onCompromised(i)}function V(){I=!0;for(let t of["reallyExit","emit"]){let o=Reflect.get(process,t);Reflect.set(process,t,(...i)=>{if(t==="reallyExit")g();let r=o.apply(process,i);if(i[0]==="exit")g();return r})}let e=Reflect.get(process,D)??Object.assign(new _,{count:0,emitted:{}});Reflect.set(process,D,e),e.count++;let n=W.bind(null,e,()=>E.forEach((t)=>process.off(t,n)));for(let t of E)try{process.on(t,n)}catch{}}function W(e,n,t){if(process.listenerCount(t)===e.count)n(),e.count--,g(),process.kill(process.pid,t)}function g(){let e=[...u.values()];u.clear();for(let{claim:n}of e)try{n.options.fs.rmdirSync(n.directory)}catch{}}function A(e,n,t){n.rmdir(e,(o)=>t(f(o)==="ENOENT"?void 0:o))}function b(e){return"stale"in e?Math.max(e.stale||0,2000):1e4}function N(e,n){return e.mtime.getTime()<Date.now()-b(n)}function Z({retries:e,factor:n,minTimeout:t=1000,maxTimeout:o}){return Array.from({length:e},(i,r)=>Math.round(Dl({attempt:r+1,baseMs:t,capMs:o,factor:n,jitter:{kind:"none"}})))}function z(e){let n=new Map,t=0,o=e[0];for(let i of e){let r=Reflect.get(Object(i),"message"),s=(n.get(r)??0)+1;if(n.set(r,s),s>=t)t=s,o=i}return o}function f(e){return Reflect.get(Object(e),"code")}function m(e){return new Promise((n,t)=>e((o,i)=>o?t(o):n(i)))}function L(e){let n,t;if(e((o,i)=>{t=o,n=i}),t)throw t;return n}function l(e,n){let t;try{t=e()}catch(o){return n(o)}n(null,t)}';
const BACKOFF =
  'function Dl({attempt:o,baseMs:a,capMs:i=1/0,factor:m=2,jitter:n={kind:"symmetric",ratio:0.25},random:t=Math.random}){let r=Math.min(i,a*m**(o-1));switch(n.kind){case"none":return r;case"proportional":return r+t()*n.ratio*r;case"symmetric":return Math.max(0,r+r*n.ratio*(2*t()-1));case"full":{let e=Math.min(n.floorMs,r);return e+t()*(r-e)}}}\n';

const lockLibrary = new Function(
  '_',
  'F',
  'H',
  'U',
  'j',
  'd',
  'K',
  'X',
  'B',
  'Q',
  'Y',
  `${BACKOFF}${LOCK_LIBRARY}return ie;`
)(
  EventEmitter,
  fs.mkdir,
  fs.mkdirSync,
  fs.realpath,
  fs.rmdir,
  fs.rmdirSync,
  fs.stat,
  fs.statSync,
  fs.utimes,
  fs.utimesSync,
  resolve
) as (path: string, options: object) => Promise<() => Promise<void>>;

const NAMES = [
  'ec',
  'cRt',
  'VE',
  '_',
  'O',
  'C',
  'b',
  'S',
  'T',
  'J',
  'YEo',
  't',
  'd',
];

/**
 * Runs `spawns` concurrent member additions through updateTeamFile, the way
 * parallel teammate spawns do, with each read taking `readMs` as under a
 * busy event loop. Returns the members written and the calls that failed.
 */
const spawnTeammates = async (code: string, spawns: number, readMs: number) => {
  const path = join(mkdtempSync(join(tmpdir(), 'team-file-')), 'config.json');
  writeFileSync(path, JSON.stringify({ members: [] }));
  const stubs: Record<string, unknown> = {
    ec: lockLibrary,
    cRt: () => path,
    VE: async () => {
      await new Promise(done => setTimeout(done, readMs));
      return JSON.parse(readFileSync(path, 'utf8'));
    },
    _: JSON.stringify,
    O: open,
    C: writeFile,
    b: (error: { code?: string }) => error?.code,
    S: () => new Error('team file missing'),
    T: Error,
    J: () => {
      throw new Error('in-memory store not expected');
    },
    YEo: () => {},
    t: () => {},
    d: String,
  };
  const updateTeamFile = new Function(...NAMES, `${code};return VEe;`)(
    ...NAMES.map(name => stubs[name])
  );
  const results = await Promise.allSettled(
    Array.from({ length: spawns }, (_, i) =>
      updateTeamFile('team', (team: { members: string[] }) => {
        team.members.push(`worker-${i}`);
      })
    )
  );
  return {
    members: JSON.parse(readFileSync(path, 'utf8')).members as string[],
    failures: results
      .filter(result => result.status === 'rejected')
      .map(result => (result as PromiseRejectedResult).reason.code),
  };
};

describe('writeTeamFileLockWait', () => {
  it('fails parallel spawns with ELOCKED without the patch', async () => {
    const { members, failures } = await spawnTeammates(TEAM_FILE, 20, 50);
    expect(failures.length).toBeGreaterThan(0);
    expect(new Set(failures)).toEqual(new Set(['ELOCKED']));
    expect(members.length).toBe(20 - failures.length);
  });

  it('lets 20 parallel spawns all write their member entry', async () => {
    const patched = writeTeamFileLockWait(TEAM_FILE)!;
    expect(patched).toContain(
      'retries:{retries:70,minTimeout:5,maxTimeout:200},onCompromised'
    );
    const { members, failures } = await spawnTeammates(patched, 20, 50);
    expect(failures).toEqual([]);
    expect(members.sort()).toEqual(
      Array.from({ length: 20 }, (_, i) => `worker-${i}`).sort()
    );
  }, 20_000);

  it('returns null when the team file lock is not there', () => {
    expect(writeTeamFileLockWait('let x=1;')).toBeNull();
    expect(
      writeTeamFileLockWait(TEAM_FILE.replace('team file for', 'file for'))
    ).toBeNull();
  });
});
