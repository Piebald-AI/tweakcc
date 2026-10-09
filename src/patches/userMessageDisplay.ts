// Please see the note about writing patches in ./index
import {
  escapeNonAscii,
  findBoxComponent,
  findChalkVar,
  findTextComponent,
  showDiff,
} from './index';
import { UserMessageDisplayConfig } from '../types';

/**
 * CC 0.2.9:
 * ```diff
 *  function Cf2({ addMargin: I, param: { text: d } }) {
 *    let { columns: G } = G9();
 *    if (!d) return (X0("No content found in user prompt message"), null);
 *    return XU.default.createElement(
 *      p,
 *      { flexDirection: "row", marginTop: I ? 1 : 0, width: "100%" },
 * -    XU.default.createElement(
 * -      p,
 * -      { minWidth: 2, width: 2 },
 * -      XU.default.createElement(u, { color: r1().secondaryText }, ">"),
 * -    ),
 *      XU.default.createElement(
 *        p,
 *        { flexDirection: "column", width: G - 4 },
 *        XU.default.createElement(
 *          u,
 * -        { color: r1().secondaryText, wrap: "wrap" },
 * -        d,
 * +        null,
 * +        CHALK.styles.here(`${d}`)
 *        ),
 *      ),
 *    );
 *  }
 * ```
 *
 * CC 1.0.50
 * ```diff
 *  function vj2({ addMargin: A, param: { text: B } }) {
 *    let { columns: Q } = w9();
 *    if (!B)
 *      return (b1(new Error("No content found in user prompt message")), null);
 *    return ec.default.createElement(
 *      b,
 *      { flexDirection: "row", marginTop: A ? 1 : 0, width: "100%" },
 * -    ec.default.createElement(
 * -      b,
 * -      { minWidth: 2, width: 2 },
 * -      ec.default.createElement(S, { color: "secondaryText" }, ">"),
 * -    ),
 *      ec.default.createElement(
 *        b,
 *        { flexDirection: "column", width: Q - 4 },
 *        ec.default.createElement(
 *          S,
 * -        { color: "secondaryText", wrap: "wrap" },
 * -        B.trim(),
 * +        {},
 * +        CHALK_VAR.style1.style2(`format ${B.trim()}`),
 *        ),
 *      ),
 *    );
 *  }
 * ```
 *
 * CC 2.0.77
 * ```diff
 *  function an2({ addMargin: A, param: { text: Q }, thinkingMetadata: B }) {
 *    let { columns: G } = QB();
 *    if (!Q) return (r(Error("No content found in user prompt message")), null);
 *    let Z = Q.replace(GB7, "")
 *      .replace(ZB7, "")
 *      .replace(YB7, "")
 *      .replace(JB7, "")
 *      .trim();
 *    return uq0.default.createElement(
 *      T,
 *      { flexDirection: "column", marginTop: A ? 1 : 0, width: G - 4 },
 * -    uq0.default.createElement(in2, { text: Z, thinkingMetadata: B }),
 * +    uq0.default.createElement(BOX_COMP, {border:styles...}, uq0.default.createElement(TEXT_COMP, null, CHALK_VAR.style1.style2(`format ${Z}`))),
 *    );
 *  }
 * ```
 *
 * CC 2.1.21:
 * ```diff
 *  function H8K(A) {
 *    let K = s(7),
 *      { addMargin: q, param: Y, thinkingMetadata: z } = A,
 *      { text: w } = Y,
 *      { columns: H } = M8();
 *    if (!w) return (KA(Error("No content found in user prompt message")), null);
 *    let J = q ? 1 : 0,
 *      O = H - 4,
 *      X;
 *    if (K[0] !== w || K[1] !== z)
 * -    ((X = oR6.default.createElement(z8K, { text: w, thinkingMetadata: z })),
 * +    ((X = oR6.default.createElement(BOX_COMP, {border:styles...}, oR6.default.createElement(TEXT_COMP, null, CHALK_VAR.style1.style2(`format ${w}`))),
 *        (K[0] = w),
 *        (K[1] = z),
 *        (K[2] = X));
 *    else X = K[2];
 *    let $;
 *    if (K[3] !== J || K[4] !== O || K[5] !== X)
 *      (($ = oR6.default.createElement(
 *        I,
 *        { flexDirection: "column", marginTop: J, width: O },
 *        X,
 *      )),
 *        (K[3] = J),
 *        (K[4] = O),
 *        (K[5] = X),
 *        (K[6] = $));
 *    else $ = K[6];
 *    return $;
 *  }
 *  ```
 *
 * CC 2.1.295 (chunk-88x0yy2z.js; Text `n`, Box `s` and jsx `e` are local import
 * aliases, chalk is not in scope, and `Z` may be a truncated {head,hiddenLines,tail}):
 * ```diff
 *  const z=l?1:0,re=q?void 0:"userMessageBackground",X=q?0:1,me=q?h:void 0;let ce;
 * -if(K[13]!==B||...)ce=e(VLt,{text:Z,useBriefLayout:q,timestamp:me,awaitingModel:B}),...
 * +if(K[13]!==B||...)ce=e(s,{children:e(n,{color:"rgb(..)",bold:!0,children:`format ${Z}`})}),...
 *  ```
 */

/**
 * Most frequently used first argument of `jsx(X,{prop:` calls. CC >=2.1.280
 * chunks import Ink's Text/Box under per-chunk aliases and do not define them.
 */
const mostUsedComponent = (file: string, pattern: RegExp): string | undefined =>
  Object.entries(
    Array.from(file.matchAll(pattern)).reduce<Record<string, number>>(
      (counts, m) => ({ ...counts, [m[1]]: (counts[m[1]] ?? 0) + 1 }),
      {}
    )
  ).sort((a, b) => b[1] - a[1])[0]?.[0];

export const writeUserMessageDisplay = (
  oldFile: string,
  config: UserMessageDisplayConfig
): string | null => {
  // CC >=2.1.280 runs this on every chunk; only one renders user prompts.
  if (!oldFile.includes('No content found in user prompt message')) {
    return null;
  }

  const isChunk = oldFile.includes('from"/$bunfs/root/');
  const textComponent = isChunk
    ? mostUsedComponent(
        oldFile,
        /[(,]([$\w]+),\{(?:dimColor|color|bold|wrap):/g
      )
    : findTextComponent(oldFile);
  if (!textComponent) {
    console.error('patch: userMessageDisplay: failed to find Text component');
    return null;
  }

  const boxComponent = isChunk
    ? mostUsedComponent(oldFile, /[(,]([$\w]+),\{flexDirection:/g)
    : findBoxComponent(oldFile);

  // Chunks have no chalk in scope; style through Text props there instead.
  const chalkVar = isChunk ? undefined : findChalkVar(oldFile);
  if (!isChunk && !chalkVar) {
    console.error('patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  // See the older examples above.  We explictly look for and match the component and subcomponent
  // that renders the ">" in older versions so that we can silently drop it in the replacement,
  // removing it in versions where it's present and not failing on versions where it's not.
  const pattern =
    /(No content found in user prompt message.{0,150}?\b)([$\w]+(?:\.default)?\.createElement.{0,30}\b[$\w]+(?:\.default)?\.createElement.{0,40}">.+?)?(([$\w]+(?:\.default)?\.createElement).{0,100})(\([$\w]+,(?:\{[^{}]+wrap:"wrap"\},([$\w]+)(?:\.trim\(\))?\)\)|\{text:([$\w]+)(?:,thinkingMetadata:[$\w]+)?\}\)\)?))/;

  // CC ≥2.1.79: Rendering delegates to a subcomponent with {text:VAR,...}
  // Pattern: No content found...createElement(BOX,{flexDirection:...},createElement(SUB,{text:VAR,...}))
  const newPattern =
    /(No content found in user prompt message.{0,50}?\b)(([$\w]+(?:\.default)?)\.createElement\([$\w]+,\{flexDirection:"column"[^}]*\},([$\w]+(?:\.default)?\.createElement)\([$\w]+,\{text:([$\w]+)[^}]*\}\)\))/;

  // CC 2.1.138: child display is memoized before the parent Box call.
  // CC 2.1.295 adds `awaitingModel` and calls the jsx runtime via a bare alias.
  // Replace only the child assignment so React compiler cache bookkeeping remains intact.
  // CC >=2.1.x renders via the JSX automatic runtime, so the assignment is
  // `B=X.jsx(SUB,{text:VAR,...})` rather than `B=X.createElement(SUB,{text:VAR,...})`.
  const memoizedChildPattern =
    /(No content found in user prompt message.{0,1200}?)([$\w]+)=([$\w]+(?:\.default)?\.(?:createElement|jsxs?)|[$\w]+)\([$\w]+,\{text:([$\w]+),useBriefLayout:[$\w]+,timestamp:[$\w]+(?:,awaitingModel:[$\w]+)?\}\)/;

  const oldMatch = oldFile.match(pattern);
  const newMatch = oldMatch ? null : oldFile.match(newPattern);
  const memoizedChildMatch =
    oldMatch || newMatch ? null : oldFile.match(memoizedChildPattern);
  const match = oldMatch ?? newMatch ?? memoizedChildMatch;

  if (!match || match.index === undefined) {
    console.error(
      'patch: userMessageDisplay: failed to find user message display pattern'
    );
    return null;
  }

  let createElementFn: string;
  let messageVar: string;

  let localBoxComponent: string | undefined;

  if (oldMatch) {
    // Old pattern matches
    createElementFn = match[4];
    messageVar = match[6] ?? match[7];
  } else if (newMatch) {
    // New pattern (CC ≥2.1.79)
    createElementFn = match[4];
    messageVar = match[5];
  } else {
    // Memoized child pattern (CC 2.1.138)
    createElementFn = match[3];
    // CC 2.1.295 truncates long prompts to {head,hiddenLines,tail} before display.
    const v = match[4];
    messageVar = `(typeof ${v}=="object"?${v}.head+"\\n\\u2026 +"+${v}.hiddenLines+" lines\\n"+${v}.tail:${v})`;
  }

  const resolvedBoxComponent = localBoxComponent ?? boxComponent;
  if (!resolvedBoxComponent) {
    console.error('patch: userMessageDisplay: failed to find Box component');
    return null;
  }

  // Build box attributes (border and padding)
  const boxAttrs: string[] = [];
  const isCustomBorder = config.borderStyle.startsWith('topBottom');

  if (config.borderStyle !== 'none') {
    if (isCustomBorder) {
      // Custom topBottom borders - only show top and bottom
      let customBorder = '';

      if (config.borderStyle === 'topBottomSingle') {
        customBorder =
          '{top:"─",bottom:"─",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      } else if (config.borderStyle === 'topBottomDouble') {
        customBorder =
          '{top:"═",bottom:"═",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      } else if (config.borderStyle === 'topBottomBold') {
        customBorder =
          '{top:"━",bottom:"━",left:" ",right:" ",topLeft:" ",topRight:" ",bottomLeft:" ",bottomRight:" "}';
      }

      boxAttrs.push(`borderStyle:${customBorder}`);
    } else {
      // Standard Ink border styles
      boxAttrs.push(`borderStyle:"${config.borderStyle}"`);
    }

    const borderMatch = config.borderColor.match(/\d+/g);
    if (borderMatch) {
      boxAttrs.push(`borderColor:"rgb(${borderMatch.join(',')})"`);
    }
  }

  if (config.paddingX > 0) {
    boxAttrs.push(`paddingX:${config.paddingX}`);
  }
  if (config.paddingY > 0) {
    boxAttrs.push(`paddingY:${config.paddingY}`);
  }
  if (config.fitBoxToContent) {
    boxAttrs.push(`alignSelf:"flex-start"`);
  }

  const boxAttrsObjStr =
    boxAttrs.length > 0 ? `{${boxAttrs.join(',')}}` : 'null';

  // Custom (non-default, non-null) colors and styling
  const rgb = (color: string) => color.match(/\d+/g)?.join(',');
  const fg =
    config.foregroundColor !== 'default'
      ? rgb(config.foregroundColor)
      : undefined;
  const bg =
    config.backgroundColor !== 'default' && config.backgroundColor !== null
      ? rgb(config.backgroundColor)
      : undefined;
  const stylings = [
    'bold',
    'italic',
    'underline',
    'strikethrough',
    'inverse',
  ].filter(s => config.styling.includes(s));

  // Replace {} in format string with the message variable
  const formattedMessage =
    '`' +
    escapeNonAscii(config.format).replace(/\{\}/g, '${' + messageVar + '}') +
    '`';

  let textProps: string[] = [];
  let textChild = formattedMessage;
  if (chalkVar) {
    const chalkChain =
      chalkVar +
      (fg ? `.rgb(${fg})` : '') +
      (bg ? `.bgRgb(${bg})` : '') +
      stylings.map(s => `.${s}`).join('');
    textChild = `${chalkChain}(${formattedMessage})`;
  } else {
    textProps = [
      ...(fg ? [`color:"rgb(${fg})"`] : []),
      ...(bg ? [`backgroundColor:"rgb(${bg})"`] : []),
      ...stylings.map(s => `${s}:!0`),
    ];
  }

  // Build replacement: Box(border/padding) wrapping Text(styled message).
  const replacementPrefix = memoizedChildMatch ? `${match[2]}=` : '';

  // CC's JSX automatic runtime (jsx/jsxs, or a bare imported alias in chunks)
  // passes children as a prop, so emit jsx-convention calls there. Older
  // bundles use the classic createElement(type, props, ...children).
  const isJsxRuntime =
    /\.jsxs?$/.test(createElementFn) || !createElementFn.includes('.');
  let elementTree: string;
  if (isJsxRuntime) {
    const textEl = `${createElementFn}(${textComponent},{${[...textProps, `children:${textChild}`].join(',')}})`;
    const boxProps =
      boxAttrsObjStr === 'null'
        ? `{children:${textEl}}`
        : `${boxAttrsObjStr.slice(0, -1)},children:${textEl}}`;
    elementTree = `${createElementFn}(${resolvedBoxComponent},${boxProps})`;
  } else {
    elementTree = `${createElementFn}(${resolvedBoxComponent},${boxAttrsObjStr},${createElementFn}(${textComponent},null,${textChild}))`;
  }

  // The parent Box paints the theme's userMessageBackground; keep it only for
  // the 'default' background (null = none, custom = painted on the Text).
  const prefix =
    config.backgroundColor === 'default'
      ? match[1]
      : match[1].replace('"userMessageBackground"', 'void 0');
  const replacement = prefix + `${replacementPrefix}${elementTree}`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
