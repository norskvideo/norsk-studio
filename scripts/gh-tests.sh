#!/usr/bin/env bash
LOG_LEVEL=error npm test --workspace workspaces/built-ins -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/built-ins.json
LOG_LEVEL=error npm test --workspace workspaces/vision-director -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/vd.json
cat $PWD/built-ins.json $PWD/vd.json | jq -s '{ 
  "content": "Norsk Studio Defaults - Tests",
  "username": "Not Jaynkings",
  "embeds": [ { "title": (if .[0].stats.failures == 0 then "Built-ins: Success" else "Built-ins: Failure" end)
              , "color": (if .[0].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": (if .[0].stats.failures == 0 then "All tests passed" else ("Failures \r\n===\r\n- " + ([.[0].failures.[].title] | join("\r\n- "))) end) 
              },
              { "title": (if .[1].stats.failures == 0 then "Vision Director: Success" else "Vision Director: Failure" end)
              , "color": (if .[1].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": (if .[1].stats.failures == 0 then "All tests passed" else ("Failures \r\n===\r\n- " + ([.[1].failures.[].title] | join("\r\n- "))) end) 
              }            
           ]
    }' > discord.json
cat discord.json
