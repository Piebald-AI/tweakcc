// Code Mode's start-up opt-in from CC 2.1.332, runnable with stubbed
// dependencies, for the Code Mode availability patches' tests.

// Claude Code's table of entrypoints (CC 2.1.332, chunk-3h03n3jx.js).
export const KNOWN =
  'var u5s={cli:!0,mcp:!0,"sdk-cli":!0,"sdk-ts":!0,"sdk-py":!0,bench:!0,"claude-vscode":!0,"claude-code-github-action":!0,"local-agent":!0,local_agent:!0,"claude-desktop":!0,remote:!0,remote_baku:!0,remote_cowork:!0,remote_trigger:!0,remote_cowork_trigger:!0,remote_desktop:!0,remote_mobile:!0,remote_projects:!0,claude_in_slack:!0,"claude-in-slack":!0,"claude-in-teams":!0,"claude-desktop-3p":!0,"claude-security":!0,"ssh-remote":!0,"claude-coworker":!0,"claude-coworker-terminal":!0};var f5s=new Set(Object.keys(u5s));';

// The caveats check, the refusal check and the start-up settle from CC
// 2.1.332 (chunk-4mjjf5rb.js).
export const OPT_IN =
  'function z(){let e=ye();return e.codeModeCaveatsAcceptedV1===!0&&e.codeModeAutoModeCaveatAcceptedV1===!0}' +
  'var ce=new Set(["sdk-cli","sdk-ts","sdk-py"]);function I(e,n){if(!se())return"runtime";if(!gc())return"no_bash";if(s.CLAUDE_CODE_REMOTE)return"entrypoint";let t=ge();if((t?!ce.has(cs()??""):cs()!=="cli")||e.workerOrSpare||e.thinClient||s.ANTHROPIC_UNIX_SOCKET!==void 0)return"entrypoint";if(Yt()||e.teammate||e.remoteControl||s.CLAUDE_BRIDGE_REATTACH_SESSION!==void 0)return"unattended";if(!t&&(De(!1)||s.IS_DEMO!==void 0||s.CLAUBBIT))return"no_setup";if(t&&s.CLAUDE_AGENT_SDK_MCP_NO_PREFIX)return"unprefixed_tools";if(e.toolsLeaveReplOut)return"tools";if((n||GYi())&&IPt()!=="passed")return"engine";if(L())return"provider";if(O())return ge()?"headless_provider":"provider";let o=_()&&!ws.some((u)=>nn(u)&&ie(me(u)?.env));if(o&&W())return"credentials";if(y())return"compliance";if(R())return"otel";let i=e.cliModel===void 0?ct():e.cliModel==="default"?Jt(gAe()??sc()):Jt(e.cliModel);return Olr(i,o)?void 0:"model"}async function T_d(e){let n=ae();r.restarted=n!==void 0;let t=(Z)=>m({state:"refused",why:Z}),o=ee(),i=vHe.CLAUDE_CODE_EXPERIMENTAL_CODE_MODE!==void 0,u=n===g;if(n!==void 0&&n!==g&&i)return t(n);let M=ge();if(o.state!=="asked"){if(M&&o.state==="not_asked"&&p(D("flagSettings"))==="on")return r.askedIn="flagSettings",t(I(e,!1)==="entrypoint"?"entrypoint":o.turnedOffIn==="managed"?"admin":"turned_off");return m(o)}let v=I(e,!0),P=M&&o.source!=="flagSettings"&&v!=="entrypoint"?"not_passed":v;if(P!==void 0){if(P==="engine")l("repl_engine_check",IPt(),{held:!0});return t(P)}if(M){r.headlessLaunch=e,r.policyPrincipal=N(),m({state:"on",source:o.source}),Ele();return}let k=C();if(k||!z()){if(u)return t(k?"gate":"unsaved");return $Hl()}m({state:"on",source:o.source}),Ele()}';

const NAMES = [
  'se',
  'gc',
  's',
  'ge',
  'cs',
  'Yt',
  'De',
  'GYi',
  'IPt',
  'L',
  'O',
  '_',
  'ws',
  'nn',
  'ie',
  'me',
  'W',
  'y',
  'R',
  'ct',
  'gAe',
  'sc',
  'Jt',
  'Olr',
  'ae',
  'r',
  'm',
  'ee',
  'vHe',
  'g',
  'p',
  'D',
  'l',
  'N',
  'Ele',
  'C',
  'ye',
  '$Hl',
];

export interface Launch {
  headless?: boolean;
  remoteControl?: boolean;
  bgSession?: boolean;
  entrypoint?: string;
  source?: string;
  caveatsAccepted?: boolean;
}

/** Runs the start-up settle and returns the state it records. */
export const settle = async (code: string, launch: Launch = {}) => {
  const {
    headless = true,
    entrypoint = 'sdk-cli',
    source = 'flagSettings',
    caveatsAccepted = true,
    remoteControl = false,
    bgSession = false,
  } = launch;
  const states: { state: string; why?: string }[] = [];
  const stubs: Record<string, unknown> = {
    se: () => true,
    gc: () => true,
    s: {},
    ge: () => headless,
    cs: () => entrypoint,
    Yt: () => bgSession,
    De: () => false,
    GYi: () => false,
    IPt: () => 'passed',
    L: () => false,
    O: () => false,
    _: () => false,
    ws: [],
    nn: () => false,
    ie: () => false,
    me: () => undefined,
    W: () => false,
    y: () => false,
    R: () => false,
    ct: () => 'claude-opus-5-5',
    gAe: () => undefined,
    sc: () => 'claude-opus-5-5',
    Jt: (model: string) => model,
    Olr: () => true,
    ae: () => undefined,
    r: {},
    m: (state: { state: string; why?: string }) => states.push(state),
    ee: () => ({ state: 'asked', source }),
    vHe: { CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' },
    g: 'restart',
    p: () => 'unset',
    D: () => undefined,
    l: () => {},
    N: () => ({ read: true }),
    Ele: () => {},
    C: () => false,
    ye: () => ({
      codeModeCaveatsAcceptedV1: caveatsAccepted,
      codeModeAutoModeCaveatAcceptedV1: caveatsAccepted,
    }),
    $Hl: () => states.push({ state: 'dialog' }),
  };
  const run = new Function(...NAMES, 'launch', `${code};return T_d(launch);`);
  await run(...NAMES.map(name => stubs[name]), { remoteControl });
  return states.at(-1);
};
