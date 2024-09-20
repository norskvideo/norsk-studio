#!/usr/bin/env bash
set -euo pipefail

cd "${0%/*}/../"

function setPackageVersion() {
    local -r packageName=${1}
    local -r version=${2}
    local packageJsonFile
    for packageJsonFile in workspaces/*/package.json; do
        jq 'if .dependencies."'$packageName'"? then .dependencies."'$packageName'" = "'$version'" else . end' $packageJsonFile > $packageJsonFile.tmp
        mv $packageJsonFile.tmp $packageJsonFile
    done
}

function main() {
    local package_name=$1;
    local package_version=$(jq -r '.version' workspaces/$package_name/package.json)

    echo "Updating $package_name to $package_version"
    setPackageVersion "@norskvideo/norsk-studio-$package_name" "$package_version"
}

main "$@"
