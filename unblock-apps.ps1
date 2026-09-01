# Unblock all VELTRUVIA exe files to remove Windows SmartScreen warnings
$desktop = [Environment]::GetFolderPath("Desktop")
$folders = @("VELTRUVIA Doctor", "VELTRUVIA Patient", "VELTRUVIA Lab", "VELTRUVIA Server")
foreach ($folder in $folders) {
    $path = Join-Path $desktop $folder
    if (Test-Path $path) {
        Get-ChildItem -Path $path -Filter "*.exe" | ForEach-Object {
            Unblock-File -Path $_.FullName -Confirm:$false
            Write-Host "Unblocked: $($_.Name)"
        }
    }
}
Write-Host "Done! All apps unblocked."
