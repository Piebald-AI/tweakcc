{ config, lib, pkgs, ... }:
let
  cfg = config.programs.tweakcc;
  tweakccPkg = import ./package.nix { inherit pkgs; };
  patchedClaude = import ./patch.nix {
    inherit pkgs tweakccPkg;
    settings = cfg.settings;
  };
in
{
  options.programs.tweakcc = {
    enable = lib.mkEnableOption "tweakcc Claude Code customizer";

    settings = lib.mkOption {
      type = lib.types.attrs;
      default = { };
      description = ''
        tweakcc settings, passed as-is to tweakcc's config.json.
        See https://github.com/Piebald-AI/tweakcc for the full settings schema.
      '';
      example = lib.literalExpression ''
        {
          misc = {
            hideStartupBanner = true;
            expandThinkingBlocks = true;
          };
        }
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    environment.systemPackages = [ patchedClaude ];
  };
}
