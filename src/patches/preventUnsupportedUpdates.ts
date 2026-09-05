/**
 * Gate automatic updates on publication of the target version's prompt snapshot.
 * Modern native updates resolve canaries and policy caps inside the installer,
 * so a guard must travel from the automatic caller to the final target check.
 * Manual install/update calls do not receive that guard. All required edits are
 * located before returning any source; a partial match never installs half a gate.
 */

const ID = '[$\\w]+';
const MARKER = '/* tweakcc:prevent-unsupported-updates:408 */';
const SNAPSHOT_ROOT =
  'https://raw.githubusercontent.com/Piebald-AI/tweakcc/refs/heads/main/data/prompts/prompts-';

/** Finds exactly one occurrence across the provided source modules. */
function locate(sources: readonly string[], pattern: RegExp) {
  const matches = sources.flatMap((source, module) =>
    Array.from(source.matchAll(new RegExp(pattern.source, 'g')), match => ({
      module,
      match,
      start: match.index!,
      end: match.index! + match[0].length,
    }))
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Selects an injected identifier absent from every input to avoid minifier collisions. */
function identifier(sources: readonly string[], label: string): string {
  let name = `__tweakcc408${label}`;
  while (sources.some(source => source.includes(name))) name += '_';
  return name;
}

/**
 * Runtime support predicate. A 5s deadline includes network failures; no response
 * or non-200 response blocks the update. Version validation prevents path/query
 * injection from the fetched target. This is prompt availability, not a promise
 * that every patch in a user's installed tweakcc release matches that version.
 */
function supportFunction(name: string): string {
  return `async function ${name}(version){if(typeof version!=="string"||!/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))return false;const controller=new AbortController();let timer;try{return await Promise.race([fetch(${JSON.stringify(SNAPSHOT_ROOT)}+encodeURIComponent(version)+".json",{method:"HEAD",signal:controller.signal}).then(response=>response.status===200,()=>false),new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(false)},5000)})])}catch{return false}finally{clearTimeout(timer);controller.abort()}}`;
}

/**
 * Patches a complete split native source corpus, preserving
 * source order and unrelated modules. Returns null for unknown or ambiguous
 * updater shapes, unchanged sources for an already-patched complete corpus.
 */
export function writePreventUnsupportedUpdatesModules(
  sources: readonly string[]
): string[] | null {
  if (sources.some(source => source.includes(MARKER))) {
    // Both sides are required: a copied single chunk is not a complete patch.
    return sources.filter(source => source.includes(MARKER)).length === 2
      ? [...sources]
      : null;
  }
  const support = identifier(sources, 'Supports');
  const guard = identifier(sources, 'Guard');
  const caller = locate(
    sources,
    new RegExp(
      `(${ID})\\("tengu_native_auto_updater_start",\\{\\}\\);try\\{let (${ID})=await (${ID})\\((${ID}),!1,(${ID})\\),`
    )
  );
  if (!caller) return null;
  const wrapperName = caller.match[3];
  const wrapper = locate(
    sources,
    new RegExp(
      `function ${wrapperName.replace(/\$/g, '\\$')}\\((${ID}),(${ID})=!1,(${ID})\\)\\{if\\(\\2\\)return (${ID})\\(\\1,\\2,\\3\\);let (${ID})=(${ID})\\.of\\((${ID})\\(\\)\\.host\\);if\\(\\5\\.inFlight\\)return (${ID})\\("installLatest: joining in-flight call"\\),\\5\\.inFlight;let (${ID})=\\4\\(\\1,\\2,\\3\\);`
    )
  );
  if (!wrapper) return null;
  const [, channel, force, context, workerName] = wrapper.match;
  const worker = locate(
    sources,
    new RegExp(
      `async function ${workerName.replace(/\$/g, '\\$')}\\((${ID}),(${ID})=!1,(${ID})\\)\\{let (${ID})=await (${ID})\\(\\1,\\2\\);`
    )
  );
  if (!worker || worker.module !== wrapper.module) return null;
  const installerName = worker.match[5];
  const installer = locate(
    sources,
    new RegExp(
      `async function ${installerName.replace(/\$/g, '\\$')}\\((${ID}),(${ID})=!1\\)\\{`
    )
  );
  const finalTarget = locate(
    sources,
    new RegExp(
      `if\\(!(${ID})&&(${ID})\\((${ID})\\)\\)return (${ID})\\("tengu_native_update_skipped_minimum_version"`
    )
  );
  const npmTarget = locate(
    sources,
    new RegExp(
      `if\\((${ID})\\)(${ID})\\("tengu_auto_updater_forced_downgrade",\\{from_version:(${ID})\\((${ID})\\),to_version:\\3\\((${ID})\\)\\}\\);`
    )
  );
  if (
    !installer ||
    !finalTarget ||
    !npmTarget ||
    installer.module !== worker.module ||
    finalTarget.module !== installer.module ||
    installer.start >= finalTarget.start ||
    finalTarget.match[1] !== installer.match[2] ||
    npmTarget.module !== caller.module ||
    caller.module === installer.module
  )
    return null;

  const edits = [
    {
      ...caller,
      text: caller.match[0].replace(
        `,!1,${caller.match[5]})`,
        `,!1,${caller.match[5]},${support})`
      ),
    },
    {
      ...wrapper,
      text: wrapper.match[0]
        .replace(
          `(${channel},${force}=!1,${context}){`,
          `(${channel},${force}=!1,${context},${guard}){if(${guard})return ${workerName}(${channel},${force},${context},${guard});`
        )
        .replaceAll(
          `${workerName}(${channel},${force},${context})`,
          `${workerName}(${channel},${force},${context},${guard})`
        ),
    },
    {
      ...worker,
      text: worker.match[0]
        .replace(
          `(${worker.match[1]},${worker.match[2]}=!1,${worker.match[3]})`,
          `(${worker.match[1]},${worker.match[2]}=!1,${worker.match[3]},${guard})`
        )
        .replace(
          `${installerName}(${worker.match[1]},${worker.match[2]})`,
          `${installerName}(${worker.match[1]},${worker.match[2]},${guard})`
        ),
    },
    { ...installer, text: installer.match[0].replace('){', `,${guard}){`) },
    {
      ...finalTarget,
      text:
        `if(${guard}&&!await ${guard}(${finalTarget.match[3]}))return{success:!0,wasSkipped:!0,latestVersion:${finalTarget.match[3]}};` +
        finalTarget.match[0],
    },
    {
      ...npmTarget,
      text:
        `if(!await ${support}(${npmTarget.match[5]}))return;` +
        npmTarget.match[0],
    },
  ];
  const result = [...sources];
  // Apply from right to left so locations remain valid even in the same module.
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result[edit.module] =
      result[edit.module].slice(0, edit.start) +
      edit.text +
      result[edit.module].slice(edit.end);
  }
  result[caller.module] += `\n${MARKER}\n${supportFunction(support)}\n`;
  result[installer.module] += `\n${MARKER}\n`;
  return result;
}

/**
 * Historical npm monolith path (2.1.20-era). Gate the candidate expression and
 * pin every automatic installer branch to that exact candidate. Evaluate
 * upstream identifiers as arguments, outside injected local scopes.
 * Native callers use the complete-corpus API instead of this npm-only matcher.
 */
export function writePreventUnsupportedUpdates(oldFile: string): string | null {
  if (oldFile.includes(MARKER)) return oldFile;
  const pattern = new RegExp(
    `(?:let|const|var) (${ID})=\\{[^{}]*ISSUES_EXPLAINER:[^{}]*BUILD_TIME:"[^"]+"\\}\\.VERSION,(${ID})=(${ID})\\(\\)\\?\\.autoUpdatesChannel\\?\\?"latest",(${ID})=await (${ID})\\(\\2\\),`
  );
  const location = locate([oldFile], pattern);
  if (!location) return null;
  const [, current, channel, , candidate, fetchVersion] = location.match;
  // The old updater fetches a version but installs a moving npm tag. Pin both
  // primary and fallback installer calls to the checked candidate; otherwise a
  // stable-channel check can even be followed by a global latest installation.
  const end = oldFile.indexOf('"tengu_auto_updater_success"', location.end);
  if (end < 0 || end - location.end > 10000) return null;
  const scope = oldFile.slice(location.end, end);
  if (scope.includes('function ')) return null;
  const local = locate(
    [scope],
    new RegExp(
      `\\("AutoUpdater: Using local update method"\\),${ID}="local",${ID}=await (${ID})\\(${channel.replace(/\$/g, '\\$')}\\)`
    )
  );
  const global = locate(
    [scope],
    new RegExp(
      `\\("AutoUpdater: Using global update method"\\),${ID}="global",${ID}=await (${ID})\\(\\)`
    )
  );
  if (!local || !global) return null;
  const localCall = `await ${local.match[1]}(${channel})`;
  const globalCall = `await ${global.match[1]}()`;
  if (
    scope.split(localCall).length !== 3 ||
    scope.split(globalCall).length !== 3
  )
    return null;
  const pinned = scope
    .replaceAll(localCall, `await ${local.match[1]}(${channel},${candidate})`)
    .replaceAll(globalCall, `await ${global.match[1]}(${candidate})`);
  const support = identifier([oldFile], 'Supports');
  const expression = `${candidate}=await ${fetchVersion}(${channel}),`;
  const replacement = `${candidate}=await(async(target,current)=>!target||await ${support}(target)?target:current)(await ${fetchVersion}(${channel}),${current}),`;
  const result =
    oldFile.slice(0, location.start) +
    location.match[0].replace(expression, replacement) +
    pinned +
    oldFile.slice(end);
  return result + `\n${MARKER}\n${supportFunction(support)}\n`;
}
