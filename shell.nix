{ pkgs ? import <nixpkgs> {} }:
let

  # try to keep this in line with Norsk
  # pinnedNixHash = "fa9a51752f1b5de583ad5213eb621be071806663";
  # pinnedNix =
  #   builtins.fetchGit {
  #     name = "nixpkgs-pinned";
  #     url = "https://github.com/NixOS/nixpkgs.git";
  #     rev = "${pinnedNixHash}";
  #   };

  nixpkgs = pkgs;

  ffmpegForTests = nixpkgs.ffmpeg-full;

  # ffmpegForTests = (nixpkgs.ffmpeg-full.override { 
  # withGme = false; 
  # withVmaf = true;

  # # https://github.com/NixOS/nixpkgs/commit/0f0b89fc7bcea595d006f8323f40bb75c8a230af#diff-553d3a02dcec4459499ae8606548394f86a283651d828b2661b232f0c0aed5caR31
  # x264 = nixpkgs.x264.overrideAttrs (old: {
  #   postPatch = old.postPatch
  #     + nixpkgs.lib.optionalString (nixpkgs.stdenv.isDarwin) ''
  #       substituteInPlace Makefile --replace '$(if $(STRIP), $(STRIP) -x $@)' '$(if $(STRIP), $(STRIP) -S $@)'
  #     '';
  # });
  
  #  });

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
   ];

  # shellHook = (if stdenv.isLinux then ''
  #   export BROWSER_FOR_TESTING=${pkgs.firefox}/bin/firefox
  # '' else '''') +
  # shellHook = (if stdenv.isLinux then ''
  #   export BROWSER_FOR_TESTING=${pkgs.google-chrome}/bin/google-chrome-stable
  # '' else '''') +
  shellHook = (if stdenv.isLinux then ''
    export BROWSER_FOR_TESTING=${chromium}/bin/chromium
  '' else '''') +
  ''
    export FFMPEG_FULL=${ffmpegForTests}
  '';
}

