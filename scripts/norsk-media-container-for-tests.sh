#!/usr/bin/env bash
set -eou pipefail

cd "${0%/*}"
cd ..

docker run \
  --name norsk-media-for-tests \
  --detach \
  --mount type=bind,source=$PWD,target=$PWD \
  --mount type=bind,source=$PWD/secrets/license.json,target=/mnt/license.json,readonly \
  --net=host norskvideo/norsk --license-file /mnt/license.json