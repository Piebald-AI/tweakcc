// Please see the note about writing patches in ./index
import {
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
 */

export const writeUserMessageDisplay = (
  oldFile: string,
  config: UserMessageDisplayConfig
): string | null => {
  const textComponent = findTextComponent(oldFile);
  if (!textComponent) {
    console.error('patch: userMessageDisplay: failed to find Text component');
    return null;
  }

  const boxComponent = findBoxComponent(oldFile);
  if (!boxComponent) {
    console.error('patch: userMessageDisplay: failed to find Box component');
    return null;
  }

  const chalkVar = findChalkVar(oldFile);
  if (!chalkVar) {
    console.error('patch: userMessageDisplay: failed to find chalk variable');
    return null;
  }

  // See the older examples above.  We explictly look for and match the component and subcomponent
  // that renders the ">" in older versions so that we can silently drop it in the replacement,
  // removing it in versions where it's present and not failing on versions where it's not.
  const pattern =
    /(No content found in user prompt message.{0,150}?\b)([$\w]+(?:\.default)?\.createElement.{0,30}\b[$\w]+(?:\.default)?\.createElement.{0,40}">.+?)?(([$\w]+(?:\.default)?\.createElement).{0,100})(\([$\w]+,(?:\{[^{}]+wrap:"wrap"\},([$\w]+)(?:\.trim\(\))?\)\)|\{text:([$\w]+)(?:,thinkingMetadata:[$\w]+)?\}\)\)?))/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: userMessageDisplay: failed to find user message display pattern'
    );
    return null;
  }

  const createElementFn = match[4];
  // Either match[6] or match[7] will be present (never both)
  const messageVar = match[6] ?? match[7];

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

  // Build chalk chain for custom colors and styling
  let chalkChain = chalkVar;

  // Only add color methods for custom (non-default, non-null) colors
  if (config.foregroundColor !== 'default') {
    const fgMatch = config.foregroundColor.match(/\d+/g);
    if (fgMatch) {
      chalkChain += `.rgb(${fgMatch.join(',')})`;
    }
  }

  if (config.backgroundColor !== 'default' && config.backgroundColor !== null) {
    const bgMatch = config.backgroundColor.match(/\d+/g);
    if (bgMatch) {
      chalkChain += `.bgRgb(${bgMatch.join(',')})`;
    }
  }

  // Apply styling
  if (config.styling.includes('bold')) chalkChain += '.bold';
  if (config.styling.includes('italic')) chalkChain += '.italic';
  if (config.styling.includes('underline')) chalkChain += '.underline';
  if (config.styling.includes('strikethrough')) chalkChain += '.strikethrough';
  if (config.styling.includes('inverse')) chalkChain += '.inverse';

  // Replace {} in format string with the message variable
  const formattedMessage =
    '`' + config.format.replace(/\{\}/g, '${' + messageVar + '}') + '`';

  const chalkFormattedString = `${chalkChain}(${formattedMessage})`;

  // Build replacement: match[1] + createElement(Box, boxProps, createElement(Text, null, chalkFormattedString))
  const replacement =
    match[1] +
    `${createElementFn}(${boxComponent},${boxAttrsObjStr},${createElementFn}(${textComponent},null,${chalkFormattedString}))`;

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
