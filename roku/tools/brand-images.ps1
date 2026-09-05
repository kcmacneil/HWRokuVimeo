# Regenerates the Roku channel artwork (icons, splash, logo) from roku/branding/hw-mark.png.
# Usage: powershell -File roku/tools/brand-images.ps1
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$src = [System.Drawing.Image]::FromFile((Join-Path $root "branding\hw-mark.png"))
$bg = [System.Drawing.ColorTranslator]::FromHtml("#101418")
$fg = [System.Drawing.Color]::White
$out = Join-Path $root "images"

function Render($w, $h, $markHeight, $label, $file) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $g.Clear($bg)

    $mw = [int]($src.Width * $markHeight / $src.Height)
    $labelH = 0
    if ($label) { $labelH = [int]($markHeight * 0.32) }
    $totalH = $markHeight + $labelH
    $y = [int](($h - $totalH) / 2)
    $g.DrawImage($src, [int](($w - $mw) / 2), $y, $mw, $markHeight)

    if ($label) {
        $font = New-Object System.Drawing.Font "Segoe UI", ([int]($labelH * 0.5)), ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
        $fmt = New-Object System.Drawing.StringFormat
        $fmt.Alignment = [System.Drawing.StringAlignment]::Center
        $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF 0, ($y + $markHeight), $w, $labelH
        $g.DrawString($label, $font, (New-Object System.Drawing.SolidBrush $fg), $rect, $fmt)
    }

    $bmp.Save((Join-Path $out $file), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "wrote images/$file ($w x $h)"
}

Render 540 405 300 "Hippocrates Wellness" "icon_focus_hd.png"
Render 246 140 100 "" "icon_focus_sd.png"
Render 1920 1080 520 "Hippocrates Wellness" "splash_hd.png"
Render 720 480 240 "Hippocrates Wellness" "splash_sd.png"
Render 72 72 64 "" "logo.png"
$src.Dispose()
