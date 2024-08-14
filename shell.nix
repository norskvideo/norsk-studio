let
  
  # try to keep this in line with Norsk

  pinnedNixHash = "57610d2f8f0937f39dbd72251e9614b1561942d8"; # This hash is from 2024-06-01
  pinnedNix = builtins.fetchTarball "https://github.com/NixOS/nixpkgs/archive/${pinnedNixHash}.tar.gz";

  nixpkgs = import pinnedNix {};

  ffmpegForTests = nixpkgs.ffmpeg-full;

  chromium = (nixpkgs.chromium); # .override { channel = "dev"; });

  inherit (nixpkgs.stdenv.lib) optionals;
  inherit (nixpkgs)stdenv;
in

with nixpkgs;

mkShell {
  buildInputs = with pkgs; [
    nodejs-18_x
    nodePackages.typescript-language-server
    nodePackages."@tailwindcss/language-server"
    nodePackages.vscode-langservers-extracted
    esbuild # presumably we can get this from NPM too???
    rsync
    jq
   ];

  shellHook = (if stdenv.isLinux then ''
    export BROWSER_FOR_TESTING=${chromium}/bin/chromium
  '' else '''') +
  ''
    export FFMPEG_FULL=${ffmpegForTests}
  '';
}

