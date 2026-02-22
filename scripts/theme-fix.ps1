param([string]$FilePath)

$content = Get-Content $FilePath -Raw -Encoding UTF8

# ── Background surfaces ──
$content = $content -replace 'background:\s*white\b', 'background: var(--bg-surface)'
$content = $content -replace 'background-color:\s*white\b', 'background-color: var(--bg-surface)'
$content = $content -replace 'background:\s*#fff\b', 'background: var(--bg-surface)'
$content = $content -replace 'background-color:\s*#fff\b', 'background-color: var(--bg-surface)'
$content = $content -replace 'background-color:\s*#ffffff\b', 'background-color: var(--bg-surface)'
$content = $content -replace 'background:\s*#ffffff\b', 'background: var(--bg-surface)'

# f8 / f9 / f1 light greys -> inset / surface-2
$content = $content -replace 'background(?:-color)?:\s*#f8f(?:9fa|afc|5f5|f9f9)\b', 'background: var(--bg-surface-2)'
$content = $content -replace 'background(?:-color)?:\s*#f5f(?:5f5|7f9|7fa|7f9)\b', 'background: var(--bg-surface-2)'
$content = $content -replace 'background(?:-color)?:\s*#f0f(?:5ff|8ff|9ff)\b', 'background: var(--bg-inset)'
$content = $content -replace 'background(?:-color)?:\s*#f9f(?:bff|bfc)\b', 'background: var(--bg-inset)'
$content = $content -replace 'background(?:-color)?:\s*#f1f5f9\b', 'background: var(--bg-surface-2)'
$content = $content -replace 'background(?:-color)?:\s*#f8fafc\b', 'background: var(--bg-surface-2)'
$content = $content -replace 'background(?:-color)?:\s*#eef2ff\b', 'background: var(--nav-active-bg)'

# gradient replaces that are pure white to white
$content = $content -replace 'linear-gradient\(135deg,\s*#ffffff[^)]*\)', 'var(--bg-surface)'
$content = $content -replace 'linear-gradient\(135deg,\s*#f8fafc[^)]*\)', 'var(--bg-surface-2)'
$content = $content -replace 'linear-gradient\(135deg,\s*#f8f9fa[^)]*\)', 'var(--bg-surface-2)'
$content = $content -replace 'linear-gradient\(to right,\s*#f8f9fa,[^)]+\)', 'var(--bg-surface-2)'

# ── Text ──
$content = $content -replace 'color:\s*#2c3e50\b', 'color: var(--text-primary)'
$content = $content -replace 'color:\s*#1e293b\b', 'color: var(--text-primary)'
$content = $content -replace 'color:\s*#1a202c\b', 'color: var(--text-primary)'
$content = $content -replace 'color:\s*#334155\b', 'color: var(--text-primary)'
$content = $content -replace 'color:\s*#2d3748\b', 'color: var(--text-primary)'
$content = $content -replace 'color:\s*#34495e\b', 'color: var(--text-secondary)'
$content = $content -replace 'color:\s*#475569\b', 'color: var(--text-secondary)'
$content = $content -replace 'color:\s*#64748b\b', 'color: var(--text-secondary)'
$content = $content -replace 'color:\s*#555\b', 'color: var(--text-secondary)'
$content = $content -replace 'color:\s*#6b7280\b', 'color: var(--text-secondary)'
$content = $content -replace 'color:\s*#8f9bb3\b', 'color: var(--text-muted)'
$content = $content -replace 'color:\s*#7f8c8d\b', 'color: var(--text-muted)'
$content = $content -replace 'color:\s*#94a3b8\b', 'color: var(--text-muted)'
$content = $content -replace 'color:\s*#9ca3af\b', 'color: var(--text-muted)'
$content = $content -replace 'color:\s*#333\b', 'color: var(--text-primary)'

# ── Borders ──
$content = $content -replace 'border(?:[^-])([^:]*?):\s*1px solid #e[0-9a-f]{5}\b', 'border$1: 1px solid var(--border)'
$content = $content -replace 'border(?:[^-])([^:]*?):\s*1px solid #d[0-9a-f]{5}\b', 'border$1: 1px solid var(--border-strong)'
$content = $content -replace 'border-bottom:\s*2px solid #eee\b', 'border-bottom: 2px solid var(--border)'
$content = $content -replace 'border-bottom:\s*1px solid #eee\b', 'border-bottom: 1px solid var(--border)'
$content = $content -replace 'border:\s*1px solid #e4e9f2\b', 'border: 1px solid var(--border)'
$content = $content -replace 'border:\s*1px solid #e0e0e0\b', 'border: 1px solid var(--border)'
$content = $content -replace 'border:\s*1px solid #eaeaea\b', 'border: 1px solid var(--border)'
$content = $content -replace 'border:\s*1px solid #ddd\b', 'border: 1px solid var(--border-strong)'
$content = $content -replace 'border:\s*1px solid #dce1e6\b', 'border: 1px solid var(--border-strong)'
$content = $content -replace 'border:\s*1px solid rgba\(226, 232, 240, 0\.8\)', 'border: 1px solid var(--border)'
$content = $content -replace 'border-color:\s*#cbd5e0\b', 'border-color: var(--border-strong)'
$content = $content -replace 'border-color:\s*#e0e0e0\b', 'border-color: var(--border)'

# ── Form inputs ──
$content = $content -replace '(\.form-group input,\s*\n\s*\.form-group select,\s*\n\s*\.form-group textarea\s*\{)', '$1
  background: var(--bg-surface);
  color: var(--text-primary);'

# ── Table headers ──
$content = $content -replace 'background-color:\s*#f5f(?:7f[a9]|5f5)\b', 'background: var(--bg-surface-2)'

# ── Navigation backgrounds ──
$content = $content -replace 'background(?:-color)?:\s*#f7f9f[c]\b', 'background: var(--bg-surface-2)'
$content = $content -replace 'background(?:-color)?:\s*#f7f9fa\b', 'background: var(--bg-surface-2)'

# ── Modal/card whites ──
$content = $content -replace 'background:\s*white;', 'background: var(--bg-surface);'

Set-Content $FilePath $content -Encoding UTF8
Write-Host "Done: $FilePath"
