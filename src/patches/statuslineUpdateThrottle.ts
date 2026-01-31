// Please see the note about writing patches in ./index

import { showDiff } from './index';

/**
 * Replaces the flawed debounced/throttled status line update with a proper throttle implementation,
 * or optionally a fixed-interval update.
 *
 * The original code uses a flawed debounce/throttle that can cause status line updates
 * to be delayed or missed. This patch replaces it with either:
 * - A proper throttle that ensures updates happen at most every `intervalMs` milliseconds (default)
 * - A fixed interval that updates regularly regardless of calls (when `useFixedInterval` is true)
 *
 * There are two formats in the minified code:
 * - Older: `F = Ue(G, 300)` - where the function (G) is passed directly to the flawed throttler (Ue)
 * - Newer: `W = fXA(() => I(A), 300)` - where the function (I) is called with a parameter (A)
 *   in a callback passed to the flawed throttler (fXA)
 *
 * CC 2.1.21 (throttle mode):
 * ```diff
 *  O = Pc.useCallback(
 *    async (_) => {
 *      q.current?.abort();
 *      let Z = new AbortController();
 *      q.current = Z;
 *      try {
 *        let G = J.current.exceeds200kTokens;
 *        if (_ !== void 0) {
 *          let j = _.filter((V) => V.type === "assistant"),
 *            M = j[j.length - 1],
 *            P = M?.uuid || M?.message?.id || null;
 *          if (P !== J.current.messageId)
 *            ((G = EJ1(_)),
 *              (J.current.messageId = P),
 *              (J.current.exceeds200kTokens = G));
 *        }
 *        let W = x1z(J.current.permissionMode, G, H, _ ?? [], K),
 *          D = await $x6(W, Z.signal);
 *        if (!Z.signal.aborted) w((j) => ({ ...j, statusLineText: D }));
 *      } catch {}
 *    },
 *    [w, H, K],
 *  ),
 * -X = Gr(() => O(A), 300);
 * +lastCall = Pc.useRef(0);
 * +X = Pc.useCallback(() => {
 * +  let now = Date.now();
 * +  if (now - lastCall.current >= 300) {
 * +    lastCall.current = now;
 * +    O(A);
 * +  }
 * +}, [O, A])
 *  (Pc.useEffect(() => {
 *    let _ = A.filter((W) => W.type === "assistant"),
 * ```
 *
 * CC 2.1.21 (fixed interval mode):
 * ```diff
 *  O = Pc.useCallback(...),
 * -X = Gr(() => O(A), 300);
 * +argRef = Pc.useRef(A),
 * +Pc.useEffect(() => { argRef.current = A; }, [A]),
 * +Pc.useEffect(() => {
 * +  const id = setInterval(() => O(argRef.current), 300);
 * +  return () => clearInterval(id);
 * +}, [O]),
 * +X = Pc.useCallback(() => {}, [])
 *  (Pc.useEffect(() => {
 * ```
 */
export const writeStatuslineUpdateThrottle = (
  oldFile: string,
  intervalMs: number = 300,
  useFixedInterval: boolean = false
): string | null => {
  // Pattern breakdown:
  // - (\b([$\w]+)=([$\w]+(?:\.default)?)\.useCallback.{0,1000}statusLineText.{0,200}?)
  //   Match[1]: Everything up to and including the statusLineText context (firstPart)
  //   Match[2]: The status line update function name (statusLineUpdateFn)
  //   Match[3]: The React variable, possibly with .default (reactVar)
  //
  // - (\b[$\w]+\(\(\)=>(\2\(([$\w]+)\)),300\)|\b[$\w]+\(\2,300\))
  //   Match[4]: The old debounced invocation (to be replaced)
  //   Match[5]: The function call with parameter if newer format (e.g., "I(A)")
  //   Match[6]: The argument to the function if newer format (e.g., "A")
  const pattern =
    /(,([$\w]+)=([$\w]+(?:\.default)?)\.useCallback.{0,1000}statusLineText.{0,200}?),([$\w]+)=([$\w]+\(\(\)=>(\2\(([$\w]+)\)),300\)|[$\w]+\(\2,300\))/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: statusLineThrottle: failed to find statusline update throttle pattern'
    );
    return null;
  }

  const firstPart = match[1];
  const statusLineUpdateFn = match[2];
  const reactVar = match[3];
  const callbackVar = match[4];
  // match[4] is the old debounced invocation (being replaced)
  // match[5] is the old debounced invocation (being replaced)
  // match[6] is the function call with param if newer format (e.g., "I(A)")
  // match[7] is the argument if newer format (e.g., "A")

  // Determine the function call to make
  // Newer format: match[5] contains "I(A)"
  // Older format: just call the function with no args
  const call = match[6] ?? `${statusLineUpdateFn}()`;
  const argument = match[7];

  // Build dependencies array for useCallback/useEffect
  const dependencies = argument
    ? `${statusLineUpdateFn}, ${argument}`
    : statusLineUpdateFn;

  // For fixed interval, we only depend on the function, not the argument
  const intervalDependencies = statusLineUpdateFn;

  let replacement: string;

  if (useFixedInterval) {
    // Fixed interval mode: use useEffect with setInterval
    // Use a ref to hold the latest argument value so interval doesn't reset when it changes
    // The useCallback becomes a no-op since updates happen on interval
    if (argument) {
      replacement =
        firstPart +
        `,argRef=${reactVar}.useRef(${argument})` +
        `,unused1=${reactVar}.useEffect(()=>{argRef.current=${argument};},[${argument}])` +
        `,unused2=${reactVar}.useEffect(()=>{` +
        `const id=setInterval(()=>${statusLineUpdateFn}(argRef.current),${intervalMs});` +
        `return()=>clearInterval(id);` +
        `},[${intervalDependencies}]),` +
        `${callbackVar}=${reactVar}.useCallback(()=>{},[])`;
    } else {
      replacement =
        firstPart +
        `,${reactVar}.useEffect(()=>{` +
        `const id=setInterval(()=>${call},${intervalMs});` +
        `return()=>clearInterval(id);` +
        `},[${intervalDependencies}]),` +
        `${callbackVar}=${reactVar}.useCallback(()=>{},[])`;
    }
  } else {
    // Throttle mode: updates happen on-demand but at most every intervalMs
    replacement =
      firstPart +
      `,lastCall=${reactVar}.useRef(0),` +
      `${callbackVar}=${reactVar}.useCallback(()=>{` +
      `let now=Date.now();` +
      `if(now-lastCall.current>=${intervalMs}){` +
      `lastCall.current=now;` +
      `${call};` +
      `}` +
      `},[${dependencies}])`;
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
