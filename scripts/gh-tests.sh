#!/usr/bin/env bash
LOG_LEVEL=error npm run test --workspace workspaces/built-ins -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/built-ins.json
BUILT_INS=$?

LOG_LEVEL=error npm run test --workspace workspaces/vision-director -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/vd.json
VISION_DIRECTOR=$?

cat $PWD/built-ins.json $PWD/vd.json | jq -s '{ 
  "content": "Norsk Studio Defaults - Tests",
  "avatar_url": "https://i.imgur.com/HzrYPqf.png",
  "username": "Evil Jenkins",
  "embeds": [ { "title": (if .[0].stats.failures == 0 then "Built-ins: Success" else "Built-ins: Failure" end)
              , "color": (if .[0].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": (if .[0].stats.failures == 0 then ((.[0].stats.passes | tostring) + " tests passed") else ("Failures \r\n===\r\n- " + ([.[0].failures.[].title] | join("\r\n- "))) end) 
              },
              { "title": (if .[1].stats.failures == 0 then "Vision Director: Success" else "Vision Director: Failure" end)
              , "color": (if .[1].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": (if .[1].stats.failures == 0 then ((.[1].stats.passes | tostring) + " tests passed") else ("Failures \r\n===\r\n- " + ([.[1].failures.[].title] | join("\r\n- "))) end) 
              }            
           ]
    }' > discord.json
cat discord.json

if [[ $BUILT_INS -eq 0 && $VISION_DIRECTOR -eq 0 ]]; then 
  exit 0;
else
  exit 1;
fi

