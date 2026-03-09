Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Write-AppIcon {
  param(
    [int]$Size,
    [string]$OutputPath,
    [ValidateSet('folder-search','monogram-search','split-panel','tree-search')]
    [string]$Variant = 'folder-search'
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $bg = [System.Drawing.ColorTranslator]::FromHtml('#2F6F4F')
  $panel = [System.Drawing.ColorTranslator]::FromHtml('#F4F1E8')
  $accent = [System.Drawing.ColorTranslator]::FromHtml('#BFD9C9')
  $ink = [System.Drawing.ColorTranslator]::FromHtml('#214D38')
  $white = [System.Drawing.Color]::White

  $padding = [float]($Size * 0.08)
  $radius = [float]($Size * 0.2)
  $bgPath = New-RoundedRectPath -X $padding -Y $padding -Width ([float]($Size - $padding * 2)) -Height ([float]($Size - $padding * 2)) -Radius $radius
  $bgBrush = New-Object System.Drawing.SolidBrush $bg
  $graphics.FillPath($bgBrush, $bgPath)

  $fontFamily = New-Object System.Drawing.FontFamily 'Segoe UI'
  $font = New-Object System.Drawing.Font($fontFamily, [float]($Size * 0.2), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $stringFormat = New-Object System.Drawing.StringFormat
  $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
  $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textBrush = New-Object System.Drawing.SolidBrush $ink
  $panelBrush = New-Object System.Drawing.SolidBrush $panel
  $accentBrush = New-Object System.Drawing.SolidBrush $accent
  $pen = New-Object System.Drawing.Pen $white, ($Size * 0.034)

  switch ($Variant) {
    'folder-search' {
      $folderX = [float]($Size * 0.12)
      $folderY = [float]($Size * 0.26)
      $folderW = [float]($Size * 0.64)
      $folderH = [float]($Size * 0.42)
      $tabW = [float]($folderW * 0.34)
      $tabH = [float]($folderH * 0.18)
      $folderRadius = [float]($Size * 0.08)

      $tabPath = New-RoundedRectPath -X $folderX -Y ([float]($folderY - $tabH * 0.55)) -Width $tabW -Height ([float]($tabH * 1.2)) -Radius ([float]($folderRadius * 0.5))
      $folderPath = New-RoundedRectPath -X $folderX -Y $folderY -Width $folderW -Height $folderH -Radius $folderRadius
      $graphics.FillPath($panelBrush, $tabPath)
      $graphics.FillPath($panelBrush, $folderPath)
      $graphics.FillEllipse($accentBrush, ($Size * 0.56), ($Size * 0.56), ($Size * 0.2), ($Size * 0.2))
      $textRect = New-Object System.Drawing.RectangleF ($folderX + $folderW * 0.1), ($folderY + $folderH * 0.08), ($folderW * 0.56), ($folderH * 0.72)
      $graphics.DrawString('FN', $font, $textBrush, $textRect, $stringFormat)
      $lensSize = [float]($Size * 0.17)
      $lensX = [float]($Size * 0.58)
      $lensY = [float]($Size * 0.58)
      $graphics.DrawEllipse($pen, $lensX, $lensY, $lensSize, $lensSize)
      $graphics.DrawLine($pen, ($lensX + $lensSize * 0.74), ($lensY + $lensSize * 0.74), ($lensX + $lensSize * 1.12), ($lensY + $lensSize * 1.12))
      if ($tabPath) { $tabPath.Dispose() }
      if ($folderPath) { $folderPath.Dispose() }
    }
    'monogram-search' {
      $pillPath = New-RoundedRectPath -X ([float]($Size * 0.15)) -Y ([float]($Size * 0.18)) -Width ([float]($Size * 0.7)) -Height ([float]($Size * 0.64)) -Radius ([float]($Size * 0.14))
      $graphics.FillPath($panelBrush, $pillPath)
      $fontLarge = New-Object System.Drawing.Font($fontFamily, [float]($Size * 0.28), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $rect = New-Object System.Drawing.RectangleF ([float]($Size * 0.17)), ([float]($Size * 0.22)), ([float]($Size * 0.44)), ([float]($Size * 0.38))
      $graphics.DrawString('FN', $fontLarge, $textBrush, $rect, $stringFormat)
      $branchPen = New-Object System.Drawing.Pen $accent, ($Size * 0.04)
      $graphics.DrawLine($branchPen, ($Size * 0.58), ($Size * 0.3), ($Size * 0.58), ($Size * 0.56))
      $graphics.DrawLine($branchPen, ($Size * 0.58), ($Size * 0.4), ($Size * 0.72), ($Size * 0.32))
      $graphics.DrawLine($branchPen, ($Size * 0.58), ($Size * 0.46), ($Size * 0.72), ($Size * 0.54))
      $graphics.DrawEllipse($pen, ($Size * 0.56), ($Size * 0.58), ($Size * 0.16), ($Size * 0.16))
      $graphics.DrawLine($pen, ($Size * 0.68), ($Size * 0.7), ($Size * 0.79), ($Size * 0.81))
      $branchPen.Dispose()
      $fontLarge.Dispose()
      $pillPath.Dispose()
    }
    'split-panel' {
      $leftPath = New-RoundedRectPath -X ([float]($Size * 0.12)) -Y ([float]($Size * 0.18)) -Width ([float]($Size * 0.36)) -Height ([float]($Size * 0.52)) -Radius ([float]($Size * 0.08))
      $rightPath = New-RoundedRectPath -X ([float]($Size * 0.5)) -Y ([float]($Size * 0.26)) -Width ([float]($Size * 0.26)) -Height ([float]($Size * 0.26)) -Radius ([float]($Size * 0.13))
      $graphics.FillPath($panelBrush, $leftPath)
      $graphics.FillPath($accentBrush, $rightPath)
      $rect = New-Object System.Drawing.RectangleF ([float]($Size * 0.14)), ([float]($Size * 0.28)), ([float]($Size * 0.32)), ([float]($Size * 0.24))
      $graphics.DrawString('FN', $font, $textBrush, $rect, $stringFormat)
      $folderPen = New-Object System.Drawing.Pen $ink, ($Size * 0.028)
      $graphics.DrawRectangle($folderPen, ($Size * 0.18), ($Size * 0.52), ($Size * 0.18), ($Size * 0.1))
      $graphics.DrawLine($folderPen, ($Size * 0.18), ($Size * 0.52), ($Size * 0.23), ($Size * 0.46))
      $graphics.DrawLine($folderPen, ($Size * 0.23), ($Size * 0.46), ($Size * 0.31), ($Size * 0.46))
      $graphics.DrawEllipse($pen, ($Size * 0.55), ($Size * 0.31), ($Size * 0.15), ($Size * 0.15))
      $graphics.DrawLine($pen, ($Size * 0.67), ($Size * 0.43), ($Size * 0.78), ($Size * 0.54))
      $folderPen.Dispose()
      $leftPath.Dispose()
      $rightPath.Dispose()
    }
    'tree-search' {
      $panelPath = New-RoundedRectPath -X ([float]($Size * 0.14)) -Y ([float]($Size * 0.16)) -Width ([float]($Size * 0.72)) -Height ([float]($Size * 0.68)) -Radius ([float]($Size * 0.16))
      $graphics.FillPath($panelBrush, $panelPath)
      $treePen = New-Object System.Drawing.Pen $bg, ($Size * 0.034)
      $graphics.DrawLine($treePen, ($Size * 0.36), ($Size * 0.3), ($Size * 0.36), ($Size * 0.6))
      $graphics.DrawLine($treePen, ($Size * 0.36), ($Size * 0.38), ($Size * 0.26), ($Size * 0.46))
      $graphics.DrawLine($treePen, ($Size * 0.36), ($Size * 0.38), ($Size * 0.46), ($Size * 0.46))
      $graphics.FillEllipse($accentBrush, ($Size * 0.22), ($Size * 0.42), ($Size * 0.08), ($Size * 0.08))
      $graphics.FillEllipse($accentBrush, ($Size * 0.42), ($Size * 0.42), ($Size * 0.08), ($Size * 0.08))
      $graphics.FillEllipse($accentBrush, ($Size * 0.32), ($Size * 0.24), ($Size * 0.08), ($Size * 0.08))
      $rect = New-Object System.Drawing.RectangleF ([float]($Size * 0.16)), ([float]($Size * 0.58)), ([float]($Size * 0.36)), ([float]($Size * 0.14))
      $graphics.DrawString('FN', $font, $textBrush, $rect, $stringFormat)
      $graphics.DrawEllipse($pen, ($Size * 0.56), ($Size * 0.34), ($Size * 0.15), ($Size * 0.15))
      $graphics.DrawLine($pen, ($Size * 0.68), ($Size * 0.46), ($Size * 0.8), ($Size * 0.58))
      $treePen.Dispose()
      $panelPath.Dispose()
    }
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $pen.Dispose()
  $textBrush.Dispose()
  $accentBrush.Dispose()
  $panelBrush.Dispose()
  $bgBrush.Dispose()
  if ($font) { $font.Dispose() }
  $fontFamily.Dispose()
  $stringFormat.Dispose()
  if ($bgPath) { $bgPath.Dispose() }
  $graphics.Dispose()
  $bitmap.Dispose()
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$imagesDir = Join-Path $repoRoot '.official\fntree\app\ui\images'
New-Item -ItemType Directory -Force -Path $imagesDir | Out-Null

Write-AppIcon -Size 64 -OutputPath (Join-Path $imagesDir 'icon_64.png')
Write-AppIcon -Size 128 -OutputPath (Join-Path $imagesDir 'icon_128.png')
Write-AppIcon -Size 256 -OutputPath (Join-Path $imagesDir 'icon_256.png')
