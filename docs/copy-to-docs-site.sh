#!/usr/bin/env bash
set -euo pipefail
cd "${0%/*}"
echo "Current working directory: $PWD"

declare thisRootDir=..
declare -r docSiteDir="$thisRootDir/../norsk-documentation"
declare -r studioRoot="$docSiteDir/sites/studio/modules/ROOT"
export STUDIO_LIBRARY_ROOT="${STUDIO_LIBRARY_ROOT:-"$(realpath "$thisRootDir")/node_modules/"}"

function main() {
    if [ ! -d "$studioRoot" ]; then
        echo "ERROR: $studioRoot does not exist"
        exit 1
    fi

    # Run the gen-docs npm script
    echo "Generating component documentation..."
    npm run --prefix $thisRootDir gen-docs

    echo "Copying docs to Antora structure..."
    mkdir -p $studioRoot/pages/components

    rm -f $studioRoot/pages/components/*.adoc

    echo "Copying Readme.adoc files..."
    find $thisRootDir/workspaces -name "Readme.adoc" | while read -r file; do
        dir=$(dirname "$file")
        if [ "$(basename "$dir")" = "src" ]; then
            component_name=$(basename $(dirname "$dir"))
        else
            component_name=$(basename "$dir")
        fi
        cp "$file" "$studioRoot/pages/components/${component_name}.adoc"
    done

    generate_nav_file
}

function generate_nav_file() {
    local nav_file="$studioRoot/nav.adoc"

    echo "* xref:index.adoc[Norsk Studio]" > $nav_file
    echo "** Components" >> $nav_file

    find $studioRoot/pages/components -name "*.adoc" | sort | while read -r file; do
        component_name=$(basename "$file" .adoc)
        echo "*** xref:components/${component_name}.adoc[${component_name}]" >> $nav_file
    done
}

main "$@"
