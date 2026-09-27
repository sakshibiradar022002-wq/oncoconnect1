$a = New-ScheduledTaskAction -Execute 'C:\Program Files\Git\usr\bin\bash.exe' -Argument 'C:/Users/Sara/Desktop/ve/.freebuff/offsite-pull.sh'
$t = New-ScheduledTaskTrigger -Daily -At 08:15
Register-ScheduledTask -TaskName 'VELTRUVIA Offsite Backup Pull' -Action $a -Trigger $t -Force | Out-Null
(Get-ScheduledTask -TaskName 'VELTRUVIA Offsite Backup Pull').State
