#!/usr/bin/env bash
set -eou pipefail

cd "${0%/*}"
cd ..

docker run \
  --name norsk-media-for-tests \
  --rm \
  --detach \
  --mount type=bind,source=$PWD,target=$PWD \
  --mount type=bind,source=$PWD/secrets/license.json,target=/mnt/license.json,readonly \
  -p 1935:1935/TCP \
  -p 5001:5001/UDP \
  -p 5002:5002/UDP \
  -p 6790:6790/TCP \
  -p 6791:6791/TCP \
  -p 8080:8080/TCP \
  norskvideo/norsk --license-file /mnt/license.json
