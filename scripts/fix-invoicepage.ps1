$f = 'd:\noida-main\src\components\InvoicePage.css'
$c = Get-Content $f -Raw -Encoding UTF8

# Page bg
$c = $c -replace 'background:\s*#f8fafc;', 'background: var(--bg-base);'
$c = $c -replace 'background:\s*#f8fafc\b', 'background: var(--bg-base)'

# White surfaces
$c = $c -replace 'background:\s*white;', 'background: var(--bg-surface);'
$c = $c -replace 'background-color:\s*white;', 'background-color: var(--bg-surface);'
$c = $c -replace 'background:\s*#ffffff;', 'background: var(--bg-surface);'
$c = $c -replace 'background-color:\s*#ffffff;', 'background-color: var(--bg-surface);'

# Near-white
$c = $c -replace 'background:\s*#f7fafc;', 'background: var(--bg-surface-2);'
$c = $c -replace 'background-color:\s*#f7fafc;', 'background-color: var(--bg-surface-2);'
$c = $c -replace 'background:\s*#f8fafc;', 'background: var(--bg-surface-2);'
$c = $c -replace 'background:\s*#edf2f7;', 'background: var(--bg-surface-2);'
$c = $c -replace 'background-color:\s*#edf2f7;', 'background-color: var(--bg-surface-2);'
$c = $c -replace 'background:\s*#fffaf0;', 'background: var(--warning-bg);'
$c = $c -replace 'background:\s*#fff5f5;', 'background: var(--danger-bg);'

# Type badges - keep coloured for visibility but adapt light-mode bg
$c = $c -replace 'background:\s*#e6fffa;', 'background: var(--success-bg);'
$c = $c -replace 'background:\s*#f0fff4;', 'background: var(--success-bg);'
$c = $c -replace 'background:\s*#fff5f5;', 'background: var(--danger-bg);'
$c = $c -replace 'background:\s*#faf5ff;', 'background: var(--info-bg);'

# Text
$c = $c -replace 'color:\s*#1a202c;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#2d3748;', 'color: var(--text-primary);'
$c = $c -replace 'color:\s*#4a5568;', 'color: var(--text-secondary);'
$c = $c -replace 'color:\s*#718096;', 'color: var(--text-secondary);'
$c = $c -replace 'color:\s*#a0aec0;', 'color: var(--text-muted);'

# Borders
$c = $c -replace 'border:\s*1px solid #e2e8f0;', 'border: 1px solid var(--border);'
$c = $c -replace 'border-top:\s*1px solid #e2e8f0;', 'border-top: 1px solid var(--border);'
$c = $c -replace 'border-bottom:\s*1px solid #e2e8f0;', 'border-bottom: 1px solid var(--border);'
$c = $c -replace 'border-bottom:\s*1px solid #f7fafc;', 'border-bottom: 1px solid var(--border);'
$c = $c -replace 'border:\s*2px dashed #e2e8f0;', 'border: 2px dashed var(--border-strong);'
$c = $c -replace 'border:\s*1px solid #fed7d7;', 'border: 1px solid var(--danger);'
$c = $c -replace 'border-color:\s*#cbd5e0;', 'border-color: var(--border-strong);'
$c = $c -replace 'border:\s*3px solid #e2e8f0;', 'border: 3px solid var(--border-strong);'

# Input focus/search input bg
$c = $c -replace '(\.search-input\s*\{[^}]+)background:\s*#f8fafc;', '$1background: var(--bg-surface-2);'
$c = $c -replace '(\.search-input:focus\s*\{[^}]+)background:\s*white;', '$1background: var(--bg-surface);'

# Spinner dark border
$c = $c -replace 'border:\s*3px solid #e2e8f0;', 'border: 3px solid var(--border-strong);'

# Print - keep white for print
# (leave the @media print block untouched)

Set-Content $f $c -Encoding UTF8
Write-Host 'Done InvoicePage.css'
