$a = New-ScheduledTaskAction -Execute 'C:\Program Files\Git\usr\bin\bash.exe' -Argument 'C:/Users/Sara/Desktop/ve/.freebuff/truth-check.sh'
# Older New-ScheduledTaskTrigger builds have no -Monthly switch: create a
# one-time trigger and set a monthly repetition on it (1st of each month, 09:00).
$t = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddHours(9)
$t.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Days 30) -RepetitionDuration (New-TimeSpan -Days 3650)).Repetition
Register-ScheduledTask -TaskName 'VELTRUVIA Monthly Truth-Check' -Action $a -Trigger $t -Force | Out-Null
(Get-ScheduledTask -TaskName 'VELTRUVIA Monthly Truth-Check').State
