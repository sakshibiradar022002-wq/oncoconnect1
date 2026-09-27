Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like '*VELTRUVIA*' } | Format-List Subject, NotAfter, HasPrivateKey, Thumbprint
