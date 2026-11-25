// Please see the note about writing patches in ./index
//
// Team File Lock Wait Patch - let parallel teammate spawns wait their turn
// for the team file instead of failing with "Lock file is already being held"
//
// An Agent call with `name` starts an in-process teammate. Before the
// teammate starts, its member entry is written to the team file under the
// team file's lock (handleSpawnInProcess -> reserveTeammateIdentity ->
// updateTeamFile, which gets no in-memory store on this path). In CC 2.1.332
// (chunk-e7bby5x1.js):
//
//   var H={realpath:!1,retries:{retries:10,minTimeout:5,maxTimeout:100},onCompromised:()=>{}};
//   ...async function VEe(e,r,n,a){if(a)return J(e,r,n,a);let o=cRt(e),f;
//     try{f=await ec(o,{lockfilePath:`${o}.lock`,...H})}catch(u){...throw u}
//     try{let u=await VE(e);...s=await O(o,"r+");try{await C(s,g),await s.truncate(...)}...
//
// Each holder reads and rewrites the whole file. The lock library retries
// without jitter at 5, 10, 20, 40, 80 and then 100 ms, so a caller gives up
// after about 0.65 s and the Agent call fails with ELOCKED. A script that
// starts many teammates at once (Promise.all), while running teammates also
// update the file, queues more work than that on the lock.
//
// This patch raises that lock's retries to 70 with a 200 ms cap: about 13 s
// in total. The lock is not stale while it is held (the holder refreshes it),
// so a longer wait only queues callers. The task list and mailbox locks keep
// their own options.

import { showDiff } from './index';

export const TEAM_FILE_LOCK_RETRIES = {
  retries: 70,
  minTimeout: 5,
  maxTimeout: 200,
};

export const writeTeamFileLockWait = (oldFile: string): string | null => {
  const pattern =
    /var ([$\w]+)=\{realpath:!1,(retries:\{[^}]*\})(?=,onCompromised:\(\)=>\{\}\};function [$\w]+\([$\w]+\)\{return new [$\w]+\(`Internal error: team file for)/g;
  const matches = [...oldFile.matchAll(pattern)];
  if (matches.length !== 1) {
    console.error(
      `patch: teamFileLockWait: expected one team file lock options object, found ${matches.length}`
    );
    return null;
  }

  const [whole, name, retries] = matches[0];
  const uses = oldFile.split(`.lock\`,...${name}})`).length - 1;
  if (uses !== 1) {
    console.error(
      `patch: teamFileLockWait: expected the team file lock to use ${name} once, found ${uses}`
    );
    return null;
  }

  const { retries: count, minTimeout, maxTimeout } = TEAM_FILE_LOCK_RETRIES;
  const replacement = `retries:{retries:${count},minTimeout:${minTimeout},maxTimeout:${maxTimeout}}`;
  const start = matches[0].index! + whole.length - retries.length;
  const end = start + retries.length;
  const newFile = oldFile.slice(0, start) + replacement + oldFile.slice(end);

  showDiff(oldFile, newFile, replacement, start, end);

  return newFile;
};
