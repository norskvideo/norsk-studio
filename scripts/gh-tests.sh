#!/usr/bin/env bash
LOG_LEVEL=error npm run test --workspace workspaces/built-ins -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/built-ins.json
BUILT_INS=$?

LOG_LEVEL=error npm run test --workspace workspaces/vision-director -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/vd.json
VISION_DIRECTOR=$?

cat $PWD/built-ins.json $PWD/vd.json | jq -s \
                     --arg RUNNER "${RUNNER:-manual}" \
                     --arg CONTEXT "${CONTEXT:-empty}" \
                     --arg GITHUB_REF "${GITHUB_REF:-empty}" \
                     --arg GITHUB_RUN_ID "${GITHUB_RUN_ID:-empty}" \ '{ 
  "content": "o",
  "avatar_url": "https://i.imgur.com/HzrYPqf.png",
  "username": "Evil Jenkins",
  "embeds": [ { "title": ""
              , "color": (if .[0].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": 
                ("###[norsk-studio/" + $GITHUB_REF + "](https://github.com/norskvideo/norsk-studio/actions/runs/" + $GITHUB_RUN_ID + ")"
                + "\r\n"
                + (("**Workspace:** Built-Ins \r\n") 
                + "**Tests: **" 
                +(if .[0].stats.failures == 0 then 
                  ((.[0].stats.passes | tostring) +  " passed") 
                 else 
                  ("Failed \r\n===\r\n- " + ([.[0].failures.[].title] | join("\r\n- "))) 
                 end))
                )
              },
              { "title": ""
              , "color": (if .[1].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": 
                ("###[norsk-studio/" + $GITHUB_REF + "](https://github.com/norskvideo/norsk-studio/actions/runs/" + $GITHUB_RUN_ID + ")"
                + "\r\n"
                + (("**Workspace:** Vision Director \r\n") 
                + "**Tests: **" 
                +(if .[1].stats.failures == 0 then 
                  ((.[1].stats.passes | tostring) +  " passed") 
                 else 
                  ("Failed \r\n===\r\n- " + ([.[1].failures.[].title] | join("\r\n- "))) 
                 end))
                )
              },            
              { "title": "Commits"
              , "color": 5763719 
              , "description": $CONTEXT
              }            
           ]
    }' > discord.json
cat discord.json

if [[ $BUILT_INS -eq 0 && $VISION_DIRECTOR -eq 0 ]]; then 
  exit 0;
else
  exit 1;
fi

