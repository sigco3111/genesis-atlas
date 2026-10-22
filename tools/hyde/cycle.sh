#!/bin/bash
L=$(cat lease_id); Y=$1
tools cloud_browser execute-js --lease-id="$L" --tab-id=1 --background --json --script-stdin < run_${Y}.js > launch_${Y}.json 2>&1
H=$(python3 -c "import json;print(json.load(open('launch_${Y}.json'))['structured']['handle'])")
sleep 40
tools cloud_browser execute-js --lease-id="$L" --tab-id=1 --json --collect-handle "$H" > resp_${Y}.json 2>&1
python3 -c "
import json
d=json.load(open('resp_${Y}.json'))
s=d.get('structured') or {}
st=s.get('status')
if st=='done':
    r=json.loads(s['result'])
    if 'b64' in r:
        open('pop_${Y}.b64','w').write(r['b64'])
        print('${Y} OK total', r.get('total'))
    else: print('${Y} FAILSTEP', r)
else: print('${Y} status', st)
"
