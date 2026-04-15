$ErrorActionPreference = 'Stop'

param(
    [int]$HoursBack = 24
)

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ==="
}

function Safe-GetProcessCount {
    param([string[]]$Names)
    @(Get-Process -Name $Names -ErrorAction SilentlyContinue).Count
}

function Get-ProcessRows {
    param([string[]]$Names)
    Get-Process -Name $Names -ErrorAction SilentlyContinue |
        Select-Object ProcessName, Id, StartTime, CPU, WorkingSet64 |
        Sort-Object ProcessName, Id
}

$findings = New-Object System.Collections.Generic.List[string]
$cutoff = (Get-Date).AddHours(-1 * $HoursBack)

Write-Section 'Defender Status'
try {
    $mp = Get-MpComputerStatus
    $status = [PSCustomObject]@{
        AMServiceEnabled        = $mp.AMServiceEnabled
        RealTimeProtection      = $mp.RealTimeProtectionEnabled
        AntispywareEnabled      = $mp.AntispywareEnabled
        AntivirusEnabled        = $mp.AntivirusEnabled
        BehaviorMonitorEnabled  = $mp.BehaviorMonitorEnabled
        IoavProtectionEnabled   = $mp.IoavProtectionEnabled
        LastQuickScan           = $mp.QuickScanEndTime
        NISSignatureVersion     = $mp.NISSignatureVersion
        AntivirusSignature      = $mp.AntivirusSignatureVersion
    }
    $status | Format-List | Out-String | Write-Host

    if (-not $mp.RealTimeProtectionEnabled) {
        $findings.Add('Real-time protection is disabled.')
    }
} catch {
    Write-Warning "Could not query Defender status: $($_.Exception.Message)"
    $findings.Add('Defender status unavailable.')
}

Write-Section 'Recent Defender Events'
try {
    $events = Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' -ErrorAction Stop |
        Where-Object {
            $_.TimeCreated -ge $cutoff -and $_.Id -in 1116,1117,1121,1122,5007
        } |
        Select-Object -First 12 TimeCreated, Id, LevelDisplayName, Message

    if ($events) {
        $events | Format-List | Out-String | Write-Host
        $findings.Add('Recent Defender detection/remediation/configuration events found. Review Protection History.')
    } else {
        Write-Host 'No recent Defender detection/remediation events in lookback window.'
    }
} catch {
    Write-Warning "Could not query Defender events: $($_.Exception.Message)"
    $findings.Add('Defender event log unavailable.')
}

Write-Section 'Process Snapshot'
$processGroups = @(
    @{ Name = 'node'; Names = @('node') ; Threshold = 20 },
    @{ Name = 'powershell'; Names = @('powershell','pwsh') ; Threshold = 10 },
    @{ Name = 'cmd'; Names = @('cmd') ; Threshold = 10 },
    @{ Name = 'script-host'; Names = @('wscript','cscript','mshta') ; Threshold = 0 },
    @{ Name = 'rundll32'; Names = @('rundll32') ; Threshold = 5 }
)

foreach ($group in $processGroups) {
    $rows = @(Get-ProcessRows -Names $group.Names)
    $count = $rows.Count
    Write-Host ("{0,-12} {1}" -f $group.Name, $count)
    if ($count -gt $group.Threshold) {
        $findings.Add("Process threshold exceeded for $($group.Name): $count")
    }
    if ($count -gt 0 -and $count -le 8) {
        $rows | Format-Table -AutoSize | Out-String | Write-Host
    }
}

Write-Section 'Important Listeners'
try {
    $listeners = Get-NetTCPConnection -State Listen -ErrorAction Stop |
        Where-Object { $_.LocalPort -in 3000,5432,80,443 } |
        Select-Object LocalAddress, LocalPort, OwningProcess, State |
        Sort-Object LocalPort, OwningProcess

    if ($listeners) {
        $listeners | Format-Table -AutoSize | Out-String | Write-Host
    } else {
        Write-Host 'No listeners found on tracked ports.'
    }
} catch {
    Write-Warning "Could not inspect listening ports: $($_.Exception.Message)"
    $findings.Add('Listening port inspection unavailable.')
}

Write-Section 'Summary'
if ($findings.Count -eq 0) {
    Write-Host 'No immediate host-defense findings from this check.'
    exit 0
}

$findings | ForEach-Object { Write-Host "- $_" }
exit 1