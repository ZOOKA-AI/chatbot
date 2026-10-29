param(
  [switch]$CopyToClipboard
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$promptPath = Join-Path $repoRoot ".github\prompts\zooka-saas-development.prompt.md"

if (-not (Test-Path -LiteralPath $promptPath -PathType Leaf)) {
  throw "Copilot prompt not found: $promptPath"
}

$prompt = Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($prompt)) {
  throw "Copilot prompt is empty: $promptPath"
}

Write-Output "Zooka AI Copilot task: $promptPath"
Write-Output "Repository: $repoRoot"
Write-Output "This helper only displays or copies the prompt. It does not deploy, migrate, or delete Vercel resources."

if ($CopyToClipboard) {
  Set-Clipboard -Value $prompt
  Write-Output "Prompt copied to clipboard. Paste it into Copilot Chat with the repository open."
} else {
  Write-Output "Use -CopyToClipboard to copy the full task brief."
}
