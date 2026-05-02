param (
    [string]$OutputPath = "$env:TEMP\gemini-screenshot.png"
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$top    = $screen.Bounds.Top
$left   = $screen.Bounds.Left
$width  = $screen.Bounds.Width
$height = $screen.Bounds.Height

$bmp = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($left, $top, 0, 0, $bmp.Size)

$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bmp.Dispose()

Write-Output "Screenshot saved to: $OutputPath"
