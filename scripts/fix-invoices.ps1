$f = 'd:\noida-main\src\components\InvoicesPage.css'
$c = Get-Content $f -Raw -Encoding UTF8

# Page background
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc[^;]+;', 'background: var(--bg-base);'
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8f9fa[^;]+;', 'background: var(--bg-surface-2);'

# White / near-white surfaces
$c = $c -replace 'background:\s*linear-gradient\(135deg, #ffffff[^;]+;', 'background: var(--bg-surface);'
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc[^;]+;', 'background: var(--bg-surface-2);'
$c = $c -replace 'background:\s*white;', 'background: var(--bg-surface);'
$c = $c -replace 'background:\s*#fff;', 'background: var(--bg-surface);'
$c = $c -replace 'background:\s*#ffffff;', 'background: var(--bg-surface);'
$c = $c -replace 'background-color:\s*#ffffff;', 'background-color: var(--bg-surface);'
$c = $c -replace 'background-color:\s*white;', 'background-color: var(--bg-surface);'
$c = $c -replace 'background:\s*#f8fafc;', 'background: var(--bg-surface-2);'
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc 0%, #f1f5f9 100%\);', 'background: var(--bg-surface-2);'

# Card header
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc 0%', 'background: var(--bg-surface'
$c = $c -replace 'background:\s*linear-gradient\(90deg, transparent, rgba\(255, 255, 255[^;]+;', 'background: transparent;'

# Text colors
$c = $c -replace 'color:\s*#1e293b;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#1a202c;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#2d3748;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#334155;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#475569;', 'color: var(--text-secondary);'
$c = $c -replace 'color:\s*#64748b;', 'color: var(--text-secondary);'
$c = $c -replace 'color:\s*#94a3b8;', 'color: var(--text-muted);'

# Borders
$c = $c -replace 'border:\s*1px solid rgba\(226, 232, 240[^;]+;', 'border: 1px solid var(--border);'
$c = $c -replace 'border-color:\s*#cbd5e0;', 'border-color: var(--border-strong);'
$c = $c -replace 'border:\s*1px solid rgba\(226,\s*232,\s*240[^;]+;', 'border: 1px solid var(--border);'
$c = $c -replace 'border-top:\s*1px solid rgba\(226, 232, 240[^;]+;', 'border-top: 1px solid var(--border);'
$c = $c -replace 'border-bottom:\s*1px solid rgba\(241, 245, 249[^;]+;', 'border-bottom: 1px solid var(--border);'

# Search / select inputs
$c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc 0%, #f1f5f9 100%\);(\s*transition)', 'background: var(--bg-surface-2);$1'
$c = $c -replace '(\.search-input:focus\s*\{[^}]+)background:\s*white;', '$1background: var(--bg-surface);'
$c = $c -replace 'background:\s*linear-gradient\(135deg, #ffffff 0%, #fefefe 100%\);', 'background: var(--bg-surface);'

# footer of cards
$c = $c -replace '(invoice-card-footer[^}]+)background:\s*linear-gradient\([^;]+;', '$1background: var(--bg-surface-2);'

# disabled buttons
$c = $c -replace 'background:\s*linear-gradient\(135deg, #cbd5e0[^;]+;', 'background: var(--bg-surface-2);'

# Status badge backgrounds (keep their colours — they look good in both modes)

Set-Content $f $c -Encoding UTF8
Write-Host 'Done InvoicesPage.css'
