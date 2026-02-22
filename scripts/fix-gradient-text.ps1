$f = 'd:\noida-main\src\components\InvoicesPage.css'
$c = Get-Content $f -Raw -Encoding UTF8

# Remove any lingering dark-only gradient text patterns and replace with theme variable
# Pattern: background: linear-gradient(..dark..) + -webkit-background-clip:text + -webkit-text-fill-color:transparent
# These are invisible on dark mode. Replace them with color: var(--text-primary)

# stat-item strong has double declaration: color + gradient, strip the gradient part
$c = $c -replace '(?ms)(\.stat-item strong\s*\{[^}]*?)background:\s*linear-gradient\(135deg,\s*#1e293b[^;]+;\s*\r?\n\s*-webkit-background-clip:\s*text;\s*\r?\n\s*-webkit-text-fill-color:\s*transparent;\s*\r?\n\s*background-clip:\s*text;', '$1'

# invoice-number h3 gradient (line ~525 area)
$c = $c -replace '(?ms)(\.invoice-number h3\s*\{[^}]*?)background:\s*linear-gradient\([^;]+;\s*\r?\n\s*-webkit-background-clip:\s*text;\s*\r?\n\s*-webkit-text-fill-color:\s*transparent;\s*\r?\n\s*background-clip:\s*text;', '$1color: var(--text-primary);'

# Any remaining gradient with dark colors + transparent fill - convert to plain text color
$c = $c -replace 'background:\s*linear-gradient\(135deg,\s*#(?:1e293b|1a202c|2d3748|334155)[^;]+;\s*\r?\n(\s*)-webkit-background-clip:\s*text;\s*\r?\n\s*-webkit-text-fill-color:\s*transparent;\s*\r?\n\s*background-clip:\s*text;', 'color: var(--text-primary);'

# Catch any remaining -webkit-text-fill-color:transparent in contexts that DON'T already have brand-gradient
# Do a multiline search for the trio of lines (background:linear-gradient + -webkit-background-clip:text + -webkit-text-fill-color:transparent) without brand-gradient
# Replace gradient source only - keep brand-gradient ones as-is
$c = $c -replace 'background:\s*linear-gradient\(135deg,\s*#(?:1e293b|1a202c|2d3748|334155|e2e8f0)[^;]*\);(\s*\r?\n\s*-webkit-background-clip:\s*text;\s*\r?\n\s*-webkit-text-fill-color:\s*transparent;\s*\r?\n\s*background-clip:\s*text;)', 'background: var(--brand-gradient);$1'

Set-Content $f $c -Encoding UTF8
Write-Host 'Done InvoicesPage.css gradient text fix'
