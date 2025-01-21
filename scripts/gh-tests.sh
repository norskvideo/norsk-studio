#!/usr/bin/env bash
LOG_LEVEL=error npm run test --workspace workspaces/built-ins -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/built-ins.json
BUILT_INS=$?

LOG_LEVEL=error npm run test --workspace workspaces/source-swicher -- --reporter mocha-json-output-reporter --reporter-options output=$PWD/vd.json
VISION_DIRECTOR=$?

cat $PWD/built-ins.json $PWD/vd.json | jq -s \
                     --arg RUNNER "${RUNNER:-manual}" \
                     --arg CONTEXT "${CONTEXT:-empty}" \
                     --arg GITHUB_REF "${GITHUB_REF:-empty}" \
                     --arg GITHUB_RUN_ID "${GITHUB_RUN_ID:-empty}" \ '{ 
  "content": "",
  "avatar_url": "https://i.imgur.com/HzrYPqf.png",
  "username": "Jankings",
  "embeds": [ { "title": ""
              , "color": (if .[0].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": 
                ("[norsk-studio/" + $GITHUB_REF + "](https://github.com/norskvideo/norsk-studio/actions/runs/" + $GITHUB_RUN_ID + ")"
                + "\r\n"
                + (("**Workspace:** Built-Ins \r\n") 
                + "**Tests: **" 
                + ((.[0].stats.passes | tostring) +  " passed") 
                + (if .[0].stats.failures > 0 then 
                  ("\r\n**Failed:** \r\n- " + ([.[0].failures.[].fullTitle] | join("\r\n- "))) 
                  else 
                    ""
                 end)
                ))
              },
              { "title": ""
              , "color": (if .[1].stats.failures == 0 then 5763719 else 15548997 end)
              , "description": ("[norsk-studio/" + $GITHUB_REF + "](https://github.com/norskvideo/norsk-studio/actions/runs/" + $GITHUB_RUN_ID + ")"
                + "\r\n"
                + (("**Workspace:** Source Switcher \r\n") 
                + "**Tests: **" 
                + ((.[1].stats.passes | tostring) +  " passed") 
                +(if .[1].stats.failures > 0 then 
                  ("\r\n**Failed:** \r\n- " + ([.[1].failures.[].fullTitle] | join("\r\n- "))) 
                  else 
                    ""
                 end)
                ))
              },            
              { "title": ""
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

