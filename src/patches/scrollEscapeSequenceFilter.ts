import { showDiff } from './index';
import { isGraphContextActive } from './graphContext';

const MARKER = '// SCROLLING FIX PATCH START';

/**
 * Offset just past the leading shebang / comment / blank lines. A module's
 * `// @bun` pragma must stay on line 1, so nothing is inserted above it.
 */
const getScrollEscapeSequenceFilterLocation = (oldFile: string): number => {
  const lines = oldFile.split('\n');
  let injectionIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#!') || line.startsWith('//')) continue;
    if (line.trim() === '') continue;
    injectionIndex = i;
    break;
  }

  return injectionIndex > 0
    ? lines.slice(0, injectionIndex).join('\n').length + 1
    : 0;
};

// Only filter scroll-specific sequences, NOT cursor positioning (CSI H)
// or cursor up (CSI A) which ink needs for rendering.
//
// Filtered sequences:
// - \x1b[<n>S  — Scroll up (SU): scroll content up by n lines
// - \x1b[<n>T  — Scroll down (SD): scroll content down by n lines
// - \x1b[<n>;<n>r — Set scroll region (DECSTBM)
// - \x1b[r     — Reset scroll region
//
// NOT filtered (ink needs these):
// - \x1b[<n>;<n>H — Cursor position (CUP)
// - \x1b[<n>A     — Cursor up (CUU)
//
// The filter is installed once per process (guarded by a global). On a
// code-split native build the entry module is evaluated only after its
// imports, and those can already have drawn the first frames, so the filter
// is placed at the top of every module that writes to stdout instead: the
// first one evaluated installs it, before any of its code can write.
// Byte chunks are filtered through latin1, which round-trips every byte.
//
// CC 2.1.2xx later swaps process.stdout.write for its own non-blocking
// writer that goes straight to the file descriptor, which would bypass a
// plain wrapper. So `write` becomes an accessor: whatever gets assigned is
// wrapped in the filter too, and assigning one of our wrappers back (a
// "restore") keeps it as is instead of wrapping twice.
const filterCode = `${MARKER}
if(!globalThis.__tweakccScrollFilter){
globalThis.__tweakccScrollFilter=true;
const _tweakccScrollStrip=(s)=>s
.replace(/\\x1b\\[\\d*S/g,'')
.replace(/\\x1b\\[\\d*T/g,'')
.replace(/\\x1b\\[\\d*;?\\d*r/g,'');
const _tweakccScrollWrap=(inner)=>{
if(typeof inner!=='function'||inner.__tweakccScrollInner)return inner;
const w=function(chunk,encoding,cb){
if(typeof chunk==='string'){
chunk=_tweakccScrollStrip(chunk);
}else if(chunk instanceof Uint8Array&&chunk.includes(27)){
const s=Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength).toString('latin1');
const f=_tweakccScrollStrip(s);
if(f!==s)chunk=Buffer.from(f,'latin1');
}
return inner.call(this,chunk,encoding,cb);
};
w.__tweakccScrollInner=inner;
return w;
};
let _tweakccScrollWrite=_tweakccScrollWrap(process.stdout.write);
Object.defineProperty(process.stdout,'write',{
configurable:true,
enumerable:false,
get(){return _tweakccScrollWrite;},
set(fn){_tweakccScrollWrite=_tweakccScrollWrap(fn);}
});
}
// SCROLLING FIX PATCH END
`;

/**
 * CC 2.1.2xx has an opt-in renderer (CLAUDE_CODE_DECSTBM, or the server flag
 * tengu_marlin_porch) that is built on scroll regions. Stripping its
 * sequences leaves the reply invisible, so turn that renderer off and let
 * the classic one draw:
 *   function SY(){{let n=bo();if(n.decstbmRendererEnabled!==void 0)...
 */
const disableScrollRegionRenderer = (file: string): string =>
  file.replace(
    /\{\{let ([$\w]+)=([$\w]+)\(\);if\(\1\.decstbmRendererEnabled!==void 0\)/,
    '{{let $1=$2();$1.decstbmRendererEnabled=!1;if($1.decstbmRendererEnabled!==void 0)'
  );

export const writeScrollEscapeSequenceFilter = (
  oldFile: string
): string | null => {
  if (oldFile.includes(MARKER)) return oldFile;
  // On a module graph only modules that write to stdout need the filter;
  // report "no match" for the rest so they stay untouched.
  if (isGraphContextActive() && !oldFile.includes('stdout.write')) return null;

  const base = disableScrollRegionRenderer(oldFile);
  const index = getScrollEscapeSequenceFilterLocation(base);
  const newFile = base.slice(0, index) + filterCode + base.slice(index);

  showDiff(oldFile, newFile, filterCode, index, index);
  return newFile;
};
