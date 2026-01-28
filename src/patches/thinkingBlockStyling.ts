// Please see the note about writing patches in ./index

import { findTextComponent, showDiff } from './index';

/**
 *  * CC 2.1.10
 * ```diff
 * function FkA({
 *    param: { thinking: A },
 *    addMargin: Q = !1,
 *    isTranscriptMode: B,
 *    verbose: G,
 *    hideInTranscript: Z = !1,
 *  }) {
 *  ...
 *    return q9A.default.createElement(
 *      j,
 *
 *      { flexDirection: "column", gap: 1, marginTop: Q ? 1 : 0, width: "100%" },
 *      q9A.default.createElement($, { dimColor: !0, italic: !0 }, "∴ Thinking…"),
 *      q9A.default.createElement(
 *        j,
 *        { paddingLeft: 2 },
 * -      q9A.default.createElement($D, null, A),
 * +      q9A.default.createElement(<<TextComponent>>, { dimColor: true, italic: true }, A),
 *      ),
 *    );
 *  }
 *
 * CC 2.1.20
 * ```diff
 *   function Ej1(A) {
 *    let K = s(17),
 *      {
 *        param: q,
 *        addMargin: Y,
 *        isTranscriptMode: z,
 *        verbose: w,
 *        hideInTranscript: H,
 *      } = A,
 *      { thinking: J } = q,
 *  ...
 *    let G = z || w,
 *      W;
 *    if (K[1] !== J) ((W = "∴ Thinking"), (K[1] = J), (K[2] = W));
 *    else W = K[2];
 *    let D = W;
 *  ...
 *    let M = O ? 1 : 0,
 *      j;
 *    if (K[9] !== D)
 *      ((j = z3A.default.createElement(f, { dimColor: !0, italic: !0 }, D, "…")),
 *        (K[9] = D),
 *        (K[10] = j));
 *    else j = K[10];
 *    let P;
 *    if (K[11] !== J)
 *      ((P = z3A.default.createElement(
 *        I,
 *        { paddingLeft: 2 },
 * -      z3A.default.createElement(P0, null, J),
 * +      z3A.default.createElement(<<TextComponent>>, { dimColor: true, italic: true }, J),
 *      )),
 *        (K[11] = J),
 *        (K[12] = P));
 *    else P = K[12];
 * ```
 */

export const writeThinkingBlockStyling = (oldFile: string): string | null => {
  const textComponent = findTextComponent(oldFile);
  if (!textComponent) {
    console.error('patch: thinkingBlockStyling: failed to find Text component');
    return null;
  }

  const pattern =
    /\{thinking:([$\w]+)\}.{0,400}(?:∴|\\u2234) Thinking.{0,700}(?:…|\\u2026).{0,200}\b[$\w]+(?:\.default)?\.createElement\(([$\w]+,null),\1\)/;

  const match = oldFile.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: thinkingBlockStyling: failed to find thinking label pattern'
    );
    return null;
  }

  // Replace match[2] (the "Component,null" part) with Text component and styling
  const replacement = match[0].replace(
    match[2],
    `${textComponent},{dimColor:true,italic:true}`
  );

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    oldFile.slice(0, startIndex) + replacement + oldFile.slice(endIndex);

  showDiff(oldFile, newFile, replacement, startIndex, endIndex);

  return newFile;
};
