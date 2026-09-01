# Fix VELTRUVIA .exe files to run as desktop apps
$desktop = [Environment]::GetFolderPath("Desktop")
$apps = @("VELTRUVIA Doctor", "VELTRUVIA Patient", "VELTRUVIA Lab", "VELTRUVIA Server")

foreach ($app in $apps) {
    $folder = Join-Path $desktop $app
    if (-not (Test-Path $folder)) { continue }
    
    Get-ChildItem -Path $folder -Filter "*.exe" | ForEach-Object {
        # Remove Zone.Identifier (Mark of the Web)
        $zoneFile = "$($_.FullName):Zone.Identifier"
        if (Test-Path $zoneFile) {
            Remove-Item $zoneFile -Force -ErrorAction SilentlyContinue
            Write-Host "Removed Zone.Identifier from: $($_.Name)"
        }
        
        # Unblock the file
        Unblock-File -Path $_.FullName -Confirm:$false -ErrorAction SilentlyContinue
        
        # Set read-only attribute to false
        $_.Attributes = 'Archive'
    }
    
    # Create a proper shortcut (.lnk) on Desktop
    $shortcutPath = Join-Path $desktop "$app.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $exePath = Get-ChildItem -Path $folder -Filter "*.exe" | Select-Object -First 1
    if ($exePath) {
        $shortcut.TargetPath = $exePath.FullName
        $shortcut.WorkingDirectory = $folder
        $shortcut.Description = "Launch $app"
        $shortcut.Save()
        Write-Host "Created shortcut: $app.lnk"
    }
}

Write-Host ""
Write-Host "Done! Desktop shortcuts created. Double-click them to launch."
