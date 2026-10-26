<#
  Re-indent HTML for readability: every element except <p> and <span> puts its opening tag,
  its content and its closing tag on separate lines (2-space indent per level).

    powershell -ExecutionPolicy Bypass -File .\tools\format-html.ps1                 # all pages + components
    powershell -ExecutionPolicy Bypass -File .\tools\format-html.ps1 index.html      # specific files

  Kept on one line:  <p>…</p>, <span>…</span>, <title>…</title> (with everything inside them),
                     void tags (<img>, <br>, <input>, <meta>…) and empty elements (<i class="x"></i>).
  Children of <html> are not indented (head/body stay at column 0).
  Run tools\sync-components.ps1 afterwards if components\*.html changed.
#>
param([string[]]$Files)
$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path $PSScriptRoot -Parent
$utf8 = New-Object System.Text.UTF8Encoding($false)

if (-not $Files) {
  $Files = Get-ChildItem -Path $siteRoot -Filter *.html -Recurse |
    Where-Object { $_.FullName -notlike "$siteRoot\.claude\*" } |
    ForEach-Object { $_.FullName }
}

$voidTags = 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'
$inlineTags = 'p', 'span', 'title'
$rawTags = 'script', 'style', 'textarea', 'pre'
$tokenRx = [regex]'(?s)<!--.*?-->|<!doctype[^>]*>|</?[a-zA-Z][\w-]*(?:\s[^>]*)?/?>|[^<]+'

function Get-TagName([string]$tag) {
  if ($tag -match '^</?([a-zA-Z][\w-]*)') { return $Matches[1].ToLower() }
  return ''
}

foreach ($file in $Files) {
  $path = (Resolve-Path $file).Path
  $src = [IO.File]::ReadAllText($path, $utf8)
  $tokens = $tokenRx.Matches($src)
  $lines = New-Object System.Collections.Generic.List[string]
  $stack = New-Object System.Collections.Generic.List[string]
  $depth = 0

  # Index of the token closing the element opened at $start (same-name nesting aware), or -1
  $findClose = {
    param($start, $name)
    $level = 0
    for ($k = $start; $k -lt $tokens.Count; $k++) {
      $v = $tokens[$k].Value
      if (-not $v.StartsWith('<') -or $v.StartsWith('<!')) { continue }
      if ((Get-TagName $v) -ne $name) { continue }
      if ($v.StartsWith('</')) { $level--; if ($level -eq 0) { return $k } }
      elseif (-not $v.EndsWith('/>')) { $level++ }
    }
    return -1
  }
  $emit = { param($text) $lines.Add(('  ' * $depth) + $text) }

  $i = 0
  while ($i -lt $tokens.Count) {
    $tok = $tokens[$i].Value

    if ($tok.StartsWith('<!')) { & $emit $tok.Trim(); $i++; continue }

    if (-not $tok.StartsWith('<')) {
      foreach ($part in ($tok -split '\r?\n')) { $t = $part.Trim(); if ($t) { & $emit $t } }
      $i++; continue
    }

    $name = Get-TagName $tok

    if ($tok.StartsWith('</')) {
      if ($stack.Count) {
        $open = $stack[$stack.Count - 1]; $stack.RemoveAt($stack.Count - 1)
        if ($open -ne 'html') { $depth-- }
      }
      & $emit $tok; $i++; continue
    }

    if ($voidTags -contains $name -or $tok.EndsWith('/>')) { & $emit $tok; $i++; continue }

    $close = & $findClose $i $name
    if ($close -lt 0) { & $emit $tok; $i++; continue }

    # <p>, <span>, <title>, raw-text elements: keep the whole element (and its children) on one line
    if ($inlineTags -contains $name -or $rawTags -contains $name) {
      $start = $tokens[$i].Index
      $end = $tokens[$close].Index + $tokens[$close].Length
      & $emit ($src.Substring($start, $end - $start).Trim())
      $i = $close + 1; continue
    }

    # Empty element (only whitespace inside): one line
    $empty = $true
    for ($k = $i + 1; $k -lt $close; $k++) { if ($tokens[$k].Value.Trim()) { $empty = $false; break } }
    if ($empty) { & $emit ($tok + $tokens[$close].Value); $i = $close + 1; continue }

    & $emit $tok
    $stack.Add($name)
    if ($name -ne 'html') { $depth++ }
    $i++
  }

  $out = ($lines -join "`n") + "`n"
  if ($out -ne $src) { [IO.File]::WriteAllText($path, $out, $utf8); Write-Host "formatted  $($path.Substring($siteRoot.Length + 1))" }
  else { Write-Host "unchanged  $($path.Substring($siteRoot.Length + 1))" }
}
