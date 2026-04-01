// Please see the note about writing patches in ./index
//
// Channels Mode Patch - Force-enable MCP channel notifications in Claude Code
//
// Channels let MCP servers push real-time notifications into a Claude Code
// session. The feature is gated by:
//
// 1. `tengu_harbor` — master on/off (GrowthBook, default false).
//    isChannelsEnabled() checks this; when false, --channels is a no-op.
//
// 2. `gateChannelServer()` — multi-layer gate that checks auth, org policy,
//    session opt-in (--channels), and allowlist. For server-kind entries
//    (server:name), the allowlist always fails unless entry.dev is true —
//    which only --dangerously-load-development-channels sets. This is why
//    channel users are forced into the dev flag + its confirmation dialog.
//
// 3. `tengu_harbor_permissions` — separate gate for permission-relay over
//    channels (lets a remote party approve tool use via a channel message).
//
// 4. ChannelsNotice — startup banner warning about "Experimental" status
//    and prompt injection risks, shown for every --channels session.
//
// This patch bypasses all of these so --channels works cleanly:
// no GrowthBook dependency, no allowlist, no dev flag, no warning.
//
// Patch 1 - Channels feature gate (tengu_harbor):
// ```diff
//  function qX_() {
// +  return !0;
//    return A9("tengu_harbor", !1);
//  }
// ```
//
// Patch 2 - gateChannelServer (allowlist/auth/policy bypass):
// Injects early return after the capability check so all remaining gates
// (auth, policy, session, allowlist) are skipped. Anchored on the unique
// capability-check reason string.
// ```diff
//  ...reason:"server did not declare claude/channel capability"};
// +return{action:"register"};
//  if(!isChannelsEnabled())...
// ```
//
// Patch 3 - Permission relay gate (tengu_harbor_permissions):
// ```diff
//  function pQ7() {
// +  return !0;
//    return A9("tengu_harbor_permissions", !1);
//  }
// ```
//
// Patch 4 - ChannelsNotice warning suppression:
// Replaces the "Experimental · prompt injection risks" banner text with
// a short neutral message.

import { showDiff } from './index';

/**
 * Patch 1: Bypass tengu_harbor flag — force isChannelsEnabled() to return true
 */
const patchChannelsEnabled = (file: string): string | null => {
  const pattern = /function [$\w]+\(\)\{return [$\w]+\("tengu_harbor",!1\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error('patch: channelsMode: failed to find tengu_harbor gate');
    return null;
  }

  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return !0;';

  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

  showDiff(file, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};

/**
 * Patch 2: Bypass gateChannelServer — inject return{action:"register"} after
 * the capability check so auth, policy, session, and allowlist gates are all
 * skipped. Without this, server-kind entries (server:name) always fail the
 * allowlist unless entry.dev is true (only set by the dev-channels flag).
 *
 * Anchored on the unique capability-check reason string that only appears in
 * gateChannelServer. We find the end of that return statement and insert
 * immediately after it.
 */
const patchGateFunction = (file: string): string | null => {
  const pattern =
    /reason:"server did not declare claude\/channel capability"\};?/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: channelsMode: failed to find gateChannelServer capability check'
    );
    return null;
  }

  const insertIndex = match.index + match[0].length;
  const insertion = 'return{action:"register"};';

  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

  showDiff(file, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};

/**
 * Patch 3: Bypass tengu_harbor_permissions — force-enable permission relay
 * over channels so tool approval requests can be relayed via channel messages.
 */
const patchPermissionRelay = (file: string): string | null => {
  const pattern =
    /function [$\w]+\(\)\{return [$\w]+\("tengu_harbor_permissions",!1\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: channelsMode: failed to find tengu_harbor_permissions gate'
    );
    return null;
  }

  const insertIndex = match.index + match[0].indexOf('{') + 1;
  const insertion = 'return !0;';

  const newFile =
    file.slice(0, insertIndex) + insertion + file.slice(insertIndex);

  showDiff(file, newFile, insertion, insertIndex, insertIndex);
  return newFile;
};

/**
 * Patch 4: Suppress the ChannelsNotice "Experimental" warning banner.
 *
 * The ChannelsNotice component renders:
 *   "Experimental · inbound messages will be pushed into this session, this
 *    carries prompt injection risks. Restart Claude Code without {flag} to
 *    disable."
 *
 * We replace the warning text (up to the flag interpolation) with a short
 * neutral message. The middle dot (·, U+00B7) may appear as literal or
 * escaped (\xB7 / \u00B7) depending on the bundler.
 */
const patchChannelsNotice = (file: string): string | null => {
  // Match the warning string up to the flag interpolation break.
  // The ·/\xB7 between "Experimental" and "inbound" varies by bundler.
  const pattern =
    /Experimental[^"]*?inbound messages will be pushed into this session, this carries prompt injection risks\. Restart Claude Code without /;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: channelsMode: failed to find ChannelsNotice warning text'
    );
    return null;
  }

  const replacement = 'Channels active. Restart Claude Code without ';
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);
  return newFile;
};

/**
 * Patch 5: Remove the "server: entries need --dangerously-load-development-
 * channels" cosmetic warning in ChannelsNotice.
 *
 * The component pre-validates entries and pushes an unmatched warning for
 * server-kind entries without entry.dev. This is purely display — the gate
 * is already patched — but shows a confusing line at startup.
 *
 * We remove the entire if(!entry.dev){push(...)} block. In minified code:
 *   if(!VAR.dev)VAR2.push({entry:VAR,why:"server: entries need ..."})
 *
 * Anchored on the unique "server: entries need" string to avoid false matches.
 */
const patchServerDevWarning = (file: string): string | null => {
  // Match the full if-block: if(!x.dev)y.push({...,"server: entries need ..."})
  // The push arg object ends with }) — we match through the closing paren.
  const pattern =
    /if\(![$\w]+\.dev\)[$\w]+\.push\(\{[$\w]+:[$\w]+,[$\w]+:"server: entries need --dangerously-load-development-channels"\}\)/;
  const match = file.match(pattern);

  if (!match || match.index === undefined) {
    console.error(
      'patch: channelsMode: failed to find server dev-flag warning block'
    );
    return null;
  }

  const replacement = '';
  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;

  const newFile =
    file.slice(0, startIndex) + replacement + file.slice(endIndex);

  showDiff(file, newFile, replacement, startIndex, endIndex);
  return newFile;
};

/**
 * Combined patch — bypasses all channel gates and suppresses warnings:
 * 1. isChannelsEnabled() → true (tengu_harbor)
 * 2. gateChannelServer() → register after capability check
 * 3. isChannelPermissionRelayEnabled() → true (tengu_harbor_permissions)
 * 4. ChannelsNotice "Experimental" warning → neutral text
 * 5. ChannelsNotice server dev-flag warning → removed
 */
export const writeChannelsMode = (oldFile: string): string | null => {
  let newFile = patchChannelsEnabled(oldFile);
  if (!newFile) return null;

  newFile = patchGateFunction(newFile);
  if (!newFile) return null;

  newFile = patchPermissionRelay(newFile);
  if (!newFile) return null;

  newFile = patchChannelsNotice(newFile) ?? newFile;

  newFile = patchServerDevWarning(newFile) ?? newFile;

  return newFile;
};
