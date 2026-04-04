{
  description = "NoTIP crypto-sdk Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {

          buildInputs = with pkgs; [
            nodejs_24

            pre-commit
            sonar-scanner-cli

            gh
            curl
          ];

          shellHook = ''
            if [ -f "package.json" ]; then
              echo "Installing npm dependencies..."
              npm install --no-fund --no-audit
            fi

            if [ -f ".pre-commit-config.yaml" ]; then
              echo "Setting up pre-commit hooks..."
              pre-commit install --install-hooks
            fi

            echo "Environment ready."
          '';
        };
      }
    );
}
