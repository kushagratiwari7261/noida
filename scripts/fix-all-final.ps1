$files = @(
    'd:\noida-main\src\components\NewShipments.css',
    'd:\noida-main\src\components\ActivityTable.css',
    'd:\noida-main\src\components\InvoicesPage.css',
    'd:\noida-main\src\components\InvoicePage.css'
)

foreach ($f in $files) {
    $c = Get-Content $f -Raw -Encoding UTF8

    # ── Remaining light surface backgrounds ──
    $c = $c -replace 'background(?:-color)?:\s*#f0f5ff;', 'background: var(--nav-active-bg);'
    $c = $c -replace 'background(?:-color)?:\s*#f9fbff;', 'background: var(--bg-inset);'
    $c = $c -replace 'background(?:-color)?:\s*#ffebee;', 'background: var(--danger-bg);'
    $c = $c -replace 'background(?:-color)?:\s*#e8f5e9;', 'background: var(--success-bg);'
    $c = $c -replace 'background(?:-color)?:\s*#fff3e0;', 'background: var(--warning-bg);'
    $c = $c -replace 'background(?:-color)?:\s*#f8f9fa;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background(?:-color)?:\s*#e0e0e0;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background(?:-color)?:\s*#d0d0d0;', 'background: var(--bg-inset);'
    $c = $c -replace 'background(?:-color)?:\s*#edf2f7;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background(?:-color)?:\s*#f7fafc;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background(?:-color)?:\s*#f8fafc;', 'background: var(--bg-surface-2);'

    # White/near-white missed by previous pass
    $c = $c -replace 'background:\s*white;', 'background: var(--bg-surface);'
    $c = $c -replace 'background-color:\s*white;', 'background-color: var(--bg-surface);'
    $c = $c -replace 'background(?:-color)?:\s*#fff\b;', 'background: var(--bg-surface);'
    $c = $c -replace 'background(?:-color)?:\s*#ffffff;', 'background: var(--bg-surface);'

    # ── Semantic text on coloured backgrounds (make theme-aware) ──
    $c = $c -replace 'color:\s*#c62828;', 'color: var(--danger);'
    $c = $c -replace 'color:\s*#c53030;', 'color: var(--danger);'
    $c = $c -replace 'color:\s*#991b1b;', 'color: var(--danger);'
    $c = $c -replace 'color:\s*#2e7d32;', 'color: var(--success);'
    $c = $c -replace 'color:\s*#276749;', 'color: var(--success);'
    $c = $c -replace 'color:\s*#285e61;', 'color: var(--success);'
    $c = $c -replace 'color:\s*#9b2c2c;', 'color: var(--danger);'
    $c = $c -replace 'color:\s*#553c9a;', 'color: var(--info);'
    $c = $c -replace 'color:\s*#2f855a;', 'color: var(--success);'
    $c = $c -replace 'color:\s*#e65100;', 'color: var(--warning);'
    $c = $c -replace 'color:\s*#92400e;', 'color: var(--warning);'

    # ── Remaining text colors that would be invisible on dark bg ──
    $c = $c -replace 'color:\s*#1a202c;', 'color: var(--text-primary);'
    $c = $c -replace 'color:\s*#2d3748;', 'color: var(--text-primary);'
    $c = $c -replace 'color:\s*#334155;', 'color: var(--text-primary);'
    $c = $c -replace 'color:\s*#1e293b;', 'color: var(--text-primary);'
    $c = $c -replace 'color:\s*#4a5568;', 'color: var(--text-secondary);'
    $c = $c -replace 'color:\s*#475569;', 'color: var(--text-secondary);'
    $c = $c -replace 'color:\s*#718096;', 'color: var(--text-secondary);'
    $c = $c -replace 'color:\s*#64748b;', 'color: var(--text-secondary);'
    $c = $c -replace 'color:\s*#a0aec0;', 'color: var(--text-muted);'
    $c = $c -replace 'color:\s*#94a3b8;', 'color: var(--text-muted);'

    # ── Border colours ──
    $c = $c -replace 'border(?:-bottom|-top|-left|-right)?:\s*1px solid #ddd;', 'border: 1px solid var(--border);'
    $c = $c -replace 'background-color:\s*#ddd;', 'background-color: var(--border);'
    $c = $c -replace 'border(?:-bottom|-top):\s*1px solid #eee;', 'border: 1px solid var(--border);'
    $c = $c -replace 'border(?:-bottom|-top|-left|-right)?:\s*1px solid #eee;', 'border: 1px solid var(--border);'
    $c = $c -replace 'border(?:-bottom|-top|-left|-right)?:\s*1px solid #e2e8f0;', 'border: 1px solid var(--border);'
    $c = $c -replace 'border:\s*1px solid #fed7d7;', 'border: 1px solid var(--danger);'
    $c = $c -replace 'border:\s*1px solid #ef5350;', 'border: 1px solid var(--danger);'
    $c = $c -replace 'border:\s*1px solid #4caf50;', 'border: 1px solid var(--success);'
    $c = $c -replace 'border-color:\s*#cbd5e0;', 'border-color: var(--border-strong);'
    $c = $c -replace 'height:\s*1px;\r?\n\s*background-color:\s*#ddd;', "height: 1px;`n  background-color: var(--border);"
    # Inline dividers
    $c = $c -replace '(\.divider\s*\{[^}]+)background-color:\s*#ddd;', '$1background-color: var(--border);'
    $c = $c -replace '(\.divider\s*\{[^}]+)background:\s*#eaeaea;', '$1background: var(--border);'

    # ── Gradient backgrounds that slip through ──
    $c = $c -replace 'background:\s*linear-gradient\(135deg, #fff(?:f|5f5|3e0|af0|bff)[^;]+;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background:\s*linear-gradient\(135deg, #f8fafc[^;]+;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background:\s*linear-gradient\(135deg, #f1f5f9[^;]+;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background:\s*linear-gradient\(135deg, #e2e8f0[^;]+;', 'background: var(--bg-surface-2);'
    $c = $c -replace 'background:\s*linear-gradient\(90deg, transparent, rgba\(255, 255, 255[^;]+;', 'background: transparent;'

    Set-Content $f $c -Encoding UTF8
    Write-Host "Done: $f"
}
