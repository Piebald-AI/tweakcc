# Returns a patched claude-code derivation given a tweakcc settings attrset.
# Used by both the NixOS and home-manager modules.
{
  pkgs,
  tweakccPkg,
  settings,
}: let
  settingsJson = builtins.toJSON {settings = settings;};
in
  pkgs.runCommand "claude-code-patched" {
    nativeBuildInputs = [tweakccPkg pkgs.makeBinaryWrapper pkgs.binutils];
    inherit settingsJson;
  } ''
    set -e
    cp -r ${pkgs.claude-code}/. $out
    chmod -R u+w $out

    export TWEAKCC_CONFIG_DIR=$(mktemp -d)
    echo "$settingsJson" > $TWEAKCC_CONFIG_DIR/config.json

    if [ -f "$out/bin/.claude-unwrapped" ]; then
      export TWEAKCC_CC_INSTALLATION_PATH=$out/bin/.claude-unwrapped
      tweakcc --apply

      # The original wrapper hardcodes the original store path in a compiled C binary.
      # Recreate the wrapper pointing to the patched .claude-unwrapped.
      pathPrefix=$(strings ${pkgs.claude-code}/bin/claude | grep -E '^/nix/store.*:/nix/store')
      rm $out/bin/claude
      makeBinaryWrapper $out/bin/.claude-unwrapped $out/bin/claude \
        --prefix PATH : "$pathPrefix"
    else
      export TWEAKCC_CC_INSTALLATION_PATH=$out/bin/claude
      tweakcc --apply
    fi
  ''
