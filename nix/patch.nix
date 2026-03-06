# Returns a patched claude-code derivation given a tweakcc settings attrset.
# Used by both the NixOS and home-manager modules.
{ pkgs, tweakccPkg, settings }:
let
  settingsJson = builtins.toJSON settings;
in
pkgs.runCommand "claude-code-patched" {
  nativeBuildInputs = [ tweakccPkg ];
  inherit settingsJson;
} ''
  cp -r ${pkgs.claude-code}/. $out
  chmod -R u+w $out

  export TWEAKCC_CONFIG_DIR=$(mktemp -d)
  echo "$settingsJson" > $TWEAKCC_CONFIG_DIR/config.json

  if [ -f "$out/bin/.claude-unwrapped" ]; then
    export TWEAKCC_CC_INSTALLATION_PATH=$out/bin/.claude-unwrapped
  else
    export TWEAKCC_CC_INSTALLATION_PATH=$out/bin/claude
  fi

  tweakcc --apply
''
