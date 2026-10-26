<#
  Sync shared components (components/*.html) into every page of the site.

    powershell -ExecutionPolicy Bypass -File .\tools\sync-components.ps1

  In a page, the region between the markers is regenerated (do not edit it by hand):
    <!-- @component header active=project -->
    <!-- /@component -->

  Component tokens:  {{root}}  -> relative path from the page to the site root ("./" or "../")
  Marker args:       active=<geo|ga|project|insight|exelient>  -> marks that main menu item as current
#>
$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path $PSScriptRoot -Parent   # this script lives in <site>/tools
$componentDir = Join-Path $siteRoot 'components'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$pattern = '(?s)(?<indent>[ \t]*)<!-- @component (?<name>[\w-]+)(?<args>[^>]*?)-->.*?<!-- /@component -->'

$pages = Get-ChildItem -Path $siteRoot -Filter *.html -Recurse | Where-Object {
  $_.FullName -notlike "$componentDir\*" -and $_.FullName -notlike "$siteRoot\.claude\*"
}

$total = 0
foreach ($page in $pages) {
  $html = [IO.File]::ReadAllText($page.FullName, $utf8)
  $relDir = $page.DirectoryName.Substring($siteRoot.Length).Trim('\')
  $depth = if ($relDir) { ($relDir -split '\\').Count } else { 0 }
  $prefix = if ($depth) { '../' * $depth } else { './' }
  $script:count = 0

  $evaluator = [Text.RegularExpressions.MatchEvaluator]{
    param($m)
    $name = $m.Groups['name'].Value
    $indent = $m.Groups['indent'].Value
    $argText = $m.Groups['args'].Value
    $file = Join-Path $componentDir "$name.html"
    if (-not (Test-Path $file)) { throw "Missing component '$name' used in $($page.FullName)" }
    $body = [IO.File]::ReadAllText($file, $utf8).TrimEnd() -replace '\{\{root\}\}', $prefix
    foreach ($arg in ($argText.Trim() -split '\s+' | Where-Object { $_ })) {
      $key, $value = $arg -split '=', 2
      if ($key -eq 'active') {
        $body = $body -replace "<a ([^>]*data-subnav=""$value"")", '<a class="active" aria-current="page" $1'
      }
    }
    $script:count++
    $lines = ($body -split "`r?`n") | ForEach-Object { if ($_) { "$indent$_" } else { '' } }
    "$indent<!-- @component $name$argText-->`n" + ($lines -join "`n") + "`n$indent<!-- /@component -->"
  }

  $result = [regex]::Replace($html, $pattern, $evaluator)
  if ($script:count -gt 0) {
    if ($result -ne $html) { [IO.File]::WriteAllText($page.FullName, $result, $utf8) }
    $state = if ($result -ne $html) { 'updated' } else { 'unchanged' }
    Write-Host ("{0,-45} {1} component(s), {2}" -f $page.FullName.Substring($siteRoot.Length + 1), $script:count, $state)
    $total += $script:count
  }
}
Write-Host "Done: $total component region(s) synced."
