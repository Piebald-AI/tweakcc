# Builds tweakcc from source.
#
# To compute pnpmDeps.hash after updating the lockfile:
#   nix build .#tweakcc --impure 2>&1 | grep 'got:' | awk '{print $2}'
{ pkgs }:
pkgs.stdenv.mkDerivation (finalAttrs: {
  pname = "tweakcc";
  version = "4.0.11";

  src = pkgs.lib.cleanSource ../.;

  nativeBuildInputs = [
    pkgs.nodejs
    pkgs.pnpm_9
    pkgs.pnpmConfigHook
    pkgs.makeWrapper
  ];

  pnpmDeps = pkgs.fetchPnpmDeps {
    inherit (finalAttrs) pname src;
    fetcherVersion = 1;
    hash = "sha256-vi7yf0XBgD/WRINNGeD3llSbNscz3UeRWkCagEL+DTg=";
  };

  buildPhase = "pnpm build";

  installPhase = ''
    mkdir -p $out/bin $out/lib/tweakcc
    cp -r dist/. $out/lib/tweakcc/
    cp -r node_modules $out/lib/tweakcc/node_modules
    makeWrapper ${pkgs.nodejs}/bin/node $out/bin/tweakcc \
      --add-flags $out/lib/tweakcc/index.mjs \
      --set NODE_PATH $out/lib/tweakcc/node_modules
  '';
})
