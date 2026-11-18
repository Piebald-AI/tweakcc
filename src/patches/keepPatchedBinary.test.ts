import { describe, expect, it } from 'vitest';

import { writeKeepPatchedBinary } from './keepPatchedBinary';

// The two re-verification points of the 2.1.295/2.1.296 native installer.
const installer =
  'async function it(e,n,r){let s=Oge(),{manifest:h,manifestAuthenticated:w,signatureVerified:b}=await nt(Ie,e,{signaturePolicy:rt(e,r),platform:s,startTime:Date.now(),purpose:"reverify"});if(!w)return t(`Manifest for retained ${e} is unauthenticated; activating the retained copy without a checksum comparison`,{level:"warn"}),{signatureVerified:!1,binaryMatches:!0,expectedChecksum:void 0};let y=h.platforms[s]?.checksum,S=y!==void 0&&await ke(n,y);if(!S)t(`Retained ${e} does not match its signed manifest checksum; re-downloading`);return{signatureVerified:b,binaryMatches:S,expectedChecksum:y}}' +
  'async function gt(e,{forceReinstall:n,explicitVersionRequested:r,requireEnforcingRelease:s}){let{stagingPath:h,installPath:w}=await ze(e),R=xn.of(B().host),F=R.get(e),M=!(F&&(F.enforcingRelease||!s)),N=M?void 0:F?.checksum,D=n||!await xt(e);if(!D&&M)try{let T=await it(e,w,{explicitVersionRequested:r,requireEnforcingRelease:s});if(N=T.expectedChecksum,!T.binaryMatches)D=!0}catch(T){throw T}else if(!D&&F?.checksum!==void 0){if(!await ke(w,F.checksum))t(`Retained ${e} no longer matches the checksum verified earlier in this process; re-downloading`,{level:"warn"}),R.delete(e),D=!0}return D}';

describe('writeKeepPatchedBinary', () => {
  const result = writeKeepPatchedBinary(installer, '/cfg/applied.json');

  it('accepts the recorded binary at the signed-manifest check', () => {
    expect(result).toContain(
      'S=y!==void 0&&await ke(n,y);if(!S&&y!==void 0&&await __tweakccKeepPatchedBinary(e,n))return t(`Retained ${e} is the binary tweakcc recorded; keeping it`),{signatureVerified:!1,binaryMatches:!0,expectedChecksum:void 0};if(!S)t(`Retained'
    );
  });

  it('accepts the recorded binary at the in-process checksum check', () => {
    expect(result).toContain(
      'if(!await ke(w,F.checksum)&&!(await __tweakccKeepPatchedBinary(e,w)&&(N=void 0,!0)))t(`Retained ${e} no longer matches'
    );
  });

  it('reads the record from the configured path', () => {
    expect(result).toContain('fs.readFileSync("/cfg/applied.json","utf8")');
  });

  it('is idempotent', () => {
    expect(writeKeepPatchedBinary(result!, '/cfg/applied.json')).toBe(result);
  });

  it('returns null when either check is missing', () => {
    expect(
      writeKeepPatchedBinary(
        installer.slice(0, installer.indexOf('async function gt')),
        '/x'
      )
    ).toBeNull();
  });
});
