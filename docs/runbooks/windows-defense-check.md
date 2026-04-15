# Windows Defense Check Runbook

## Scope

Provide a lightweight host-defense check before and after runtime-heavy local work.

## When To Run

1. Before load tests or heavy runtime validation.
2. After any Defender warning or blocked PowerShell activity.
3. When the machine suddenly slows down and you need a fast sanity check.

## Command

```powershell
npm run defense:check
```

## What It Checks

1. Microsoft Defender service and real-time protection status.
2. Recent Defender Operational log events relevant to detections and quarantine.
3. Counts of high-risk or high-noise local processes such as `node`, `powershell`, `cmd`, `wscript`, `cscript`, `mshta`, and `rundll32`.
4. Current listeners on important local ports including `3000` and `5432`.
5. Suspicious thresholds that should trigger manual review.

## Current Thresholds

1. More than 20 `node` processes.
2. More than 10 `powershell` processes.
3. Any running `wscript`, `cscript`, or `mshta` process.
4. Recent Defender detection or remediation events in the configured lookback window.

## What To Do If It Flags Problems

1. Stop active repo scripts.
2. Stop the dev server.
3. Review Protection History in Windows Security.
4. Confirm whether the flagged process is expected repo work or something unrelated.
5. If in doubt, do not allow or restore blocked items until reviewed.

## Notes

1. This check is a local operator sanity tool, not a full EDR replacement.
2. It is tuned to catch the kinds of local process storms and suspicious-script signals that have already affected this workspace.
