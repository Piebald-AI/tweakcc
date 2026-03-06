{
  description = "tweakcc - Claude Code customizer with NixOS module support";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin"];
    forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
  in {
    packages = forAllSystems (pkgs: {
      tweakcc = import ./nix/package.nix {inherit pkgs;};
      default = self.packages.${pkgs.system}.tweakcc;
    });

    nixosModules.default = import ./nix/nixos.nix;
    homeManagerModules.default = import ./nix/hm.nix;
  };
}
