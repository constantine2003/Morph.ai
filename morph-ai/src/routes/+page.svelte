<script lang="ts">
    import { enhance } from '$app/forms';
    import { progress } from '$lib/stores/progress';
    import { onMount, tick } from 'svelte';
    import mermaid from 'mermaid';
    import { marked } from 'marked';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import morphIcon from '$lib/assets/morph-icon.svg?raw';
    
    export let form: any;

    let copied = false;
    let repoInputValue = '';
    let focused = false;
    let formRef: HTMLFormElement;

    // ── History ────────────────────────────────────────────────
    interface HistoryItem {
        id: string;
        repoUrl: string;
        repoName: string;
        analysis: string;
        hasGitHubData: boolean;
        timestamp: number;
    }

    let history: HistoryItem[] = [];
    let historyOpen = false;
    let activeHistoryId: string | null = null;
    let currentAnalysis: string | null = null;
    let currentRepoUrl: string | null = null;
    let currentHasGitHubData = false;

    function loadHistory() {
        try {
            const raw = localStorage.getItem('morph-history');
            history = raw ? JSON.parse(raw) : [];
        } catch { history = []; }
    }

    function saveToHistory(item: Omit<HistoryItem, 'id'>) {
        const id = `h-${Date.now()}`;
        const newItem: HistoryItem = { ...item, id };
        // Dedupe by repoUrl — remove any older entry for same repo
        history = [newItem, ...history.filter(h => h.repoUrl !== item.repoUrl)].slice(0, 20);
        try { localStorage.setItem('morph-history', JSON.stringify(history)); } catch {}
        activeHistoryId = id;
    }

    function loadFromHistory(item: HistoryItem) {
        currentAnalysis = item.analysis;
        currentRepoUrl = item.repoUrl;
        currentHasGitHubData = item.hasGitHubData;
        repoInputValue = item.repoUrl;
        activeHistoryId = item.id;
        historyOpen = false;
        tick().then(() => renderMermaid());
    }

    function deleteHistoryItem(id: string, e: MouseEvent) {
        e.stopPropagation();
        history = history.filter(h => h.id !== id);
        try { localStorage.setItem('morph-history', JSON.stringify(history)); } catch {}
        if (activeHistoryId === id) {
            activeHistoryId = null;
            currentAnalysis = null;
        }
    }

    function repoNameFromUrl(url: string): string {
        const m = url.match(/github\.com\/([^\/]+\/[^\/\s?#]+)/);
        return m ? m[1] : url.replace(/^https?:\/\//, '');
    }

    function timeAgo(ts: number): string {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (m < 1) return 'just now';
        if (m < 60) return `${m}m ago`;
        if (h < 24) return `${h}h ago`;
        return `${d}d ago`;
    }

    // ── Share link ─────────────────────────────────────────────
    let shareToast = false;

    function copyShareLink() {
        const url = new URL(window.location.href);
        url.searchParams.set('repo', currentRepoUrl || repoInputValue);
        navigator.clipboard.writeText(url.toString());
        shareToast = true;
        setTimeout(() => shareToast = false, 2500);
    }

    // ── Zoom modal ─────────────────────────────────────────────
    let zoomOpen = false;
    let zoomSvgHtml = '';
    let zoomScale = 1;
    let zoomX = 0;
    let zoomY = 0;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    function openZoom(svgHtml: string) {
        const tmp = document.createElement('div');
        tmp.innerHTML = svgHtml;
        const svg = tmp.querySelector('svg');
        if (svg) {
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.removeAttribute('style');
            if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', '0 0 800 400');
        }
        zoomSvgHtml = tmp.innerHTML;
        zoomScale = 1; zoomX = 0; zoomY = 0;
        zoomOpen = true;
    }
    function closeZoom() { zoomOpen = false; }
    function onZoomWheel(e: WheelEvent) {
        e.preventDefault();
        zoomScale = Math.min(Math.max(zoomScale * (e.deltaY > 0 ? 0.9 : 1.1), 0.25), 10);
    }
    function onPanStart(e: MouseEvent) {
        if (e.button !== 0) return;
        isPanning = true;
        panStart = { x: e.clientX - zoomX, y: e.clientY - zoomY };
    }
    function onPanMove(e: MouseEvent) {
        if (!isPanning) return;
        zoomX = e.clientX - panStart.x;
        zoomY = e.clientY - panStart.y;
    }
    function onPanEnd() { isPanning = false; }
    function resetZoom() { zoomScale = 1; zoomX = 0; zoomY = 0; }

    // ── Mermaid ────────────────────────────────────────────────
    onMount(() => {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
                primaryColor: '#2d2654', primaryTextColor: '#e8e6ff',
                primaryBorderColor: '#7c6ee0', lineColor: '#6d5acd',
                secondaryColor: '#1e1a3a', tertiaryColor: '#252048',
                background: '#181530', mainBkg: '#2d2654',
                nodeBorder: '#7c6ee0', clusterBkg: '#1e1a3a',
                titleColor: '#e8e6ff', edgeLabelBackground: '#2d2654',
                fontFamily: 'Geist, Inter, system-ui, sans-serif', fontSize: '14px',
            },
            securityLevel: 'loose',
            flowchart: { htmlLabels: false, curve: 'basis' },
        });

        loadHistory();

        // Share link: auto-analyze if ?repo= is in URL
        const repoParam = $page.url.searchParams.get('repo');
        if (repoParam) {
            repoInputValue = repoParam.startsWith('http') ? repoParam : `https://${repoParam}`;
            tick().then(() => formRef?.requestSubmit());
        }
    });

    function sanitizeMermaid(raw: string): string {
        return raw
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/<[^>]*>/g, '')
            .replace(/\["([^"]+)"\]/g, '[$1]')
            .replace(/\[([^\]]+)\]/g, (_: string, label: string) => {
                const clean = label
                    .replace(/\(([^)]*)\)/g, ' $1')
                    .replace(/e\.g\.,?\s*/g, '')
                    .replace(/[,;:]/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                return `[${clean}]`;
            })
            .split('\n').map((l: string) => l.trimEnd()).join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function renderMermaid() {
        await tick();
        await new Promise(r => setTimeout(r, 150));
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('.mermaid-pending'));
        for (const node of nodes) {
            const raw = node.getAttribute('data-diagram') || '';
            const cleaned = sanitizeMermaid(raw);
            try {
                const id = `mmd-${Math.random().toString(36).slice(2, 9)}`;
                const { svg } = await mermaid.render(id, cleaned);
                const tmp = document.createElement('div');
                tmp.innerHTML = svg;
                const svgEl = tmp.querySelector('svg');
                if (svgEl) {
                    const vb = svgEl.getAttribute('viewBox');
                    svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
                    svgEl.style.width = '100%'; svgEl.style.height = 'auto';
                    if (vb) svgEl.setAttribute('viewBox', vb);
                }
                node.innerHTML = tmp.innerHTML;
                node.classList.remove('mermaid-pending');
                node.classList.add('mermaid-ok');
                node.style.cursor = 'zoom-in';
                node.title = 'Click to expand';
                node.addEventListener('click', () => openZoom(node.innerHTML));
            } catch (e) {
                node.classList.remove('mermaid-pending');
                node.classList.add('mermaid-failed');
                node.innerHTML = `<div class="mermaid-err"><p>⚠ Could not render diagram</p><pre>${cleaned.replace(/</g, '&lt;')}</pre></div>`;
            }
        }
    }

    // ── Format output + section copy buttons ──────────────────
    async function formatOutput(text: string): Promise<string> {
        if (!text) return '';
        const html = await marked.parse(text, { breaks: false });
        let result = html.replace(
            /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
            (_, code) => {
                const escaped = code.replace(/"/g, '&quot;');
                return `<div class="mermaid-pending mermaid-wrap" data-diagram="${escaped}"><span class="mermaid-loading">Rendering diagram…</span></div>`;
            }
        );
        // Inject copy button into each h2
        result = result.replace(
            /<h2>([\s\S]*?)<\/h2>/g,
            (_, inner) => `<h2>${inner}<button class="section-copy-btn" data-section-heading="${inner.replace(/"/g, '&quot;')}" title="Copy section">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button></h2>`
        );
        return result;
    }

    // Section copy — delegate from the prose container
    function handleProseCopy(e: MouseEvent) {
        const btn = (e.target as HTMLElement).closest('.section-copy-btn') as HTMLElement | null;
        if (!btn) return;
        e.stopPropagation();
        const heading = btn.getAttribute('data-section-heading') || '';
        if (!currentAnalysis) return;

        // Extract the section content from the raw markdown
        const lines = currentAnalysis.split('\n');
        const startIdx = lines.findIndex(l => l.startsWith('## ') && l.includes(heading.replace(/<[^>]*>/g, '').trim().slice(0, 20)));
        if (startIdx === -1) { navigator.clipboard.writeText(currentAnalysis); return; }
        const endIdx = lines.findIndex((l, i) => i > startIdx && l.startsWith('## '));
        const section = lines.slice(startIdx, endIdx === -1 ? undefined : endIdx).join('\n').trim();
        navigator.clipboard.writeText(section);

        // Flash the button
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1500);
    }

    // ── Global copy ────────────────────────────────────────────
    async function copyToClipboard() {
        if (!currentAnalysis) return;
        await navigator.clipboard.writeText(currentAnalysis);
        copied = true;
        setTimeout(() => (copied = false), 2000);
    }

    // ── Download ───────────────────────────────────────────────
    const downloadFile = async (type: 'md' | 'pdf' | 'txt') => {
        const content = currentAnalysis;
        if (!content) return;
        const filename = `MorphAI-${Date.now()}`;
        if (type === 'pdf') {
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ unit: 'mm', format: 'a4' });
            const margin = 15;
            const pageWidth = doc.internal.pageSize.getWidth() - margin * 2;
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFillColor(14, 14, 26); doc.rect(0, 0, doc.internal.pageSize.getWidth(), pageHeight, 'F');
            doc.setTextColor(109, 90, 205); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
            doc.text('Morph.ai', margin, 18);
            doc.setTextColor(100, 95, 140); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
            doc.text('Architectural Intelligence', margin, 25);
            doc.text(`${new Date().toUTCString()}`, margin, 31);
            doc.setDrawColor(40, 35, 65); doc.line(margin, 35, doc.internal.pageSize.getWidth() - margin, 35);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = await marked.parse(content);
            const lines = doc.splitTextToSize(tempDiv.innerText, pageWidth);
            doc.setTextColor(210, 205, 245); doc.setFontSize(9.5);
            let y = 43;
            for (const line of lines) {
                if (y > pageHeight - margin) { doc.addPage(); doc.setFillColor(14,14,26); doc.rect(0,0,doc.internal.pageSize.getWidth(),pageHeight,'F'); y = margin; }
                if (/^[🧠⚙️🏗️🔄📁🔐⚠️##]/.test(line)) { doc.setFont('helvetica','bold'); doc.setTextColor(109,90,205); }
                else { doc.setFont('helvetica','normal'); doc.setTextColor(210,205,245); }
                doc.text(line, margin, y); y += 5.5;
            }
            doc.save(`${filename}.pdf`);
        } else {
            let exportContent = content;
            const mimeType = type === 'md' ? 'text/markdown' : 'text/plain';
            if (type === 'txt') {
                const d = document.createElement('div'); d.innerHTML = await marked.parse(content);
                exportContent = d.innerText;
            }
            const blob = new Blob([exportContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `${filename}.${type}`; a.click();
            URL.revokeObjectURL(url);
        }
    };

    // ── Reactive: handle new form result ──────────────────────
    $: if (form?.success && form.analysis) {
        currentAnalysis = form.analysis;
        currentRepoUrl = form.repoUrl;
        currentHasGitHubData = form.hasGitHubData;
        saveToHistory({
            repoUrl: form.repoUrl,
            repoName: repoNameFromUrl(form.repoUrl),
            analysis: form.analysis,
            hasGitHubData: form.hasGitHubData,
            timestamp: Date.now(),
        });
        renderMermaid();
    }

    // ── Loading steps ──────────────────────────────────────────
    const statusMessages = ['Fetching repository…','Reading file tree…','Identifying stack…','Mapping architecture…','Writing report…','Almost done…'];
    let statusIndex = 0;
    let statusInterval: ReturnType<typeof setInterval> | null = null;
    let wasLoading = false;

    $: {
        if ($progress.loading && !wasLoading) {
            wasLoading = true; statusIndex = 0; $progress.status = statusMessages[0];
            if (statusInterval) clearInterval(statusInterval);
            statusInterval = setInterval(() => {
                statusIndex = Math.min(statusIndex + 1, statusMessages.length - 1);
                $progress.status = statusMessages[statusIndex];
            }, 1800);
        } else if (!$progress.loading && wasLoading) {
            wasLoading = false;
            if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
        }
    }

    $: showResult = !!currentAnalysis && !$progress.loading;
</script>

<svelte:head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="page">
    <div class="bg-glow" aria-hidden="true"></div>

    <!-- History sidebar -->
    {#if historyOpen}
        <div class="sidebar-backdrop" on:click={() => historyOpen = false} role="presentation"></div>
        <aside class="sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">History</span>
                <button class="sidebar-close" on:click={() => historyOpen = false}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            {#if history.length === 0}
                <div class="sidebar-empty">No analyses yet. Run your first repo!</div>
            {:else}
                <ul class="sidebar-list">
                    {#each history as item}
                        <li
                            class="sidebar-item"
                            class:active={activeHistoryId === item.id}
                            on:click={() => loadFromHistory(item)}
                            role="button"
                            tabindex="0"
                            on:keydown={(e) => e.key === 'Enter' && loadFromHistory(item)}
                        >
                            <div class="sidebar-item-name">{item.repoName}</div>
                            <div class="sidebar-item-meta">{timeAgo(item.timestamp)}</div>
                            <button class="sidebar-delete" on:click={(e) => deleteHistoryItem(item.id, e)} title="Remove">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </li>
                    {/each}
                </ul>
                <button class="sidebar-clear" on:click={() => { history = []; localStorage.removeItem('morph-history'); }}>
                    Clear all history
                </button>
            {/if}
        </aside>
    {/if}

    <div class="container">
        <nav>
            <div class="nav-brand">
                <span class="nav-logo">{@html morphIcon}</span>
                <span class="nav-name">morph<span class="nav-dot">.</span>ai</span>
            </div>
            <div class="nav-right">
                {#if history.length > 0}
                    <button class="nav-history-btn" on:click={() => historyOpen = !historyOpen}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        History
                        <span class="history-count">{history.length}</span>
                    </button>
                {/if}
                <div class="nav-badge">
                    <span class="badge-dot" class:pulse={$progress.loading}></span>
                    <span>{$progress.loading ? 'Analyzing' : 'Ready'}</span>
                </div>
            </div>
        </nav>

        <section class="hero">
            <div class="hero-eyebrow">Architectural Intelligence</div>
            <h1 class="hero-title">
                Understand any<br/>
                <span class="hero-gradient">codebase instantly</span>
            </h1>
            <p class="hero-sub">
                Paste a GitHub URL. Get a complete architectural breakdown —<br class="hero-br"/>
                stack, structure, data flow, and patterns.
            </p>
        </section>

        <form
            bind:this={formRef}
            method="POST"
            action="?/analyzeRepo"
            use:enhance={() => {
                $progress.loading = true;
                currentAnalysis = null;
                return async ({ update }) => { await update(); $progress.loading = false; };
            }}
            class="search-form"
        >
            <div class="search-box" class:focused>
                <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                </svg>
                <input
                    name="repoUrl"
                    bind:value={repoInputValue}
                    on:focus={() => focused = true}
                    on:blur={() => focused = false}
                    placeholder="github.com/username/repository"
                    autocomplete="off" spellcheck="false" required
                />
                {#if repoInputValue}
                    <button type="button" class="clear-btn" on:click={() => repoInputValue = ''}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                {/if}
            </div>
            <button type="submit" class="analyze-btn" disabled={$progress.loading}>
                {#if $progress.loading}
                    <span class="spin-ring"></span>
                {:else}
                    <span>Analyze</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                {/if}
            </button>
        </form>

        <p class="disclaimer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            AI outputs may be inaccurate. Always verify with your codebase.
        </p>

        {#if $progress.loading}
            <div class="loading-card">
                <div class="loading-top">
                    <div class="loading-steps">
                        {#each statusMessages as msg, i}
                            <div class="loading-step" class:active={i === statusIndex} class:done={i < statusIndex}>
                                <span class="step-indicator">
                                    {#if i < statusIndex}
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    {:else if i === statusIndex}
                                        <span class="step-dot-pulse"></span>
                                    {:else}
                                        <span class="step-dot-idle"></span>
                                    {/if}
                                </span>
                                <span class="step-label">{msg}</span>
                            </div>
                        {/each}
                    </div>
                    <div class="loading-visual">
                        <div class="loading-ring"></div>
                        <div class="loading-ring ring-2"></div>
                        <div class="loading-ring ring-3"></div>
                    </div>
                </div>
                <div class="loading-bar-track"><div class="loading-bar-fill"></div></div>
            </div>
        {/if}

        {#if form?.error}
            <div class="error-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{form.error}</span>
            </div>
        {/if}

        {#if showResult}
            <div class="toolbar">
                <div class="toolbar-left">
                    <span class="toolbar-label">Report</span>
                    {#if currentHasGitHubData}
                        <span class="chip chip-green">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                            GitHub data
                        </span>
                    {:else}
                        <span class="chip chip-yellow">URL only</span>
                    {/if}
                </div>
                <div class="toolbar-right">
                    <!-- Retry -->
                    <button class="tool-btn" on:click={() => formRef?.requestSubmit()} title="Re-analyze">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        Retry
                    </button>
                    <!-- Share -->
                    <button class="tool-btn" class:share-active={shareToast} on:click={copyShareLink}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        {shareToast ? 'Copied!' : 'Share'}
                    </button>
                    <div class="divider-v"></div>
                    <!-- Copy all -->
                    <button class="tool-btn" on:click={copyToClipboard}>
                        {#if copied}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            Copied
                        {:else}
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            Copy
                        {/if}
                    </button>
                    <div class="divider-v"></div>
                    <button class="tool-btn" on:click={() => downloadFile('md')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        .md
                    </button>
                    <button class="tool-btn" on:click={() => downloadFile('pdf')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        .pdf
                    </button>
                    <button class="tool-btn" on:click={() => downloadFile('txt')}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        .txt
                    </button>
                </div>
            </div>

            <div class="report">
                {#await formatOutput(currentAnalysis || '')}
                    <div class="format-spinner"><span class="spin-ring"></span></div>
                {:then cleanHtml}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="prose" on:click={handleProseCopy}>{@html cleanHtml}</div>
                {/await}
            </div>

        {:else if !form?.error && !$progress.loading}
            <div class="features">
                {#each [
                    { icon: '⬡', title: 'Architecture map', desc: 'Visual data flow diagrams generated automatically from your repo structure.' },
                    { icon: '◈', title: 'Stack detection', desc: 'Identifies every framework, library, and tool in use across the codebase.' },
                    { icon: '◎', title: 'Pattern analysis', desc: 'Surfaces design patterns, anti-patterns, and structural observations.' }
                ] as f}
                    <div class="feature-card">
                        <div class="feature-icon">{f.icon}</div>
                        <div class="feature-title">{f.title}</div>
                        <div class="feature-desc">{f.desc}</div>
                    </div>
                {/each}
            </div>
        {/if}

        <!-- Zoom modal -->
        {#if zoomOpen}
            <div class="zoom-backdrop" on:click={closeZoom} on:keydown={(e) => e.key === 'Escape' && closeZoom()} role="dialog" aria-modal="true" tabindex="-1">
                <div class="zoom-toolbar" on:click|stopPropagation>
                    <span class="zoom-label">Diagram</span>
                    <div class="zoom-controls">
                        <button class="zoom-ctrl-btn" on:click={() => zoomScale = Math.min(zoomScale * 1.25, 10)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <span class="zoom-pct">{Math.round(zoomScale * 100)}%</span>
                        <button class="zoom-ctrl-btn" on:click={() => zoomScale = Math.max(zoomScale * 0.8, 0.25)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </button>
                        <button class="zoom-ctrl-btn reset" on:click={resetZoom}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        </button>
                        <button class="zoom-ctrl-btn close" on:click={closeZoom}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="zoom-stage" on:click|stopPropagation on:wheel|nonpassive={onZoomWheel} on:mousedown={onPanStart} on:mousemove={onPanMove} on:mouseup={onPanEnd} on:mouseleave={onPanEnd} style="cursor:{isPanning?'grabbing':'grab'}">
                    <div class="zoom-content" style="transform:translate({zoomX}px,{zoomY}px) scale({zoomScale});transform-origin:center center;">
                        {@html zoomSvgHtml}
                    </div>
                </div>
                <p class="zoom-hint">Scroll to zoom · Drag to pan · Click outside to close</p>
            </div>
        {/if}

    </div>
</div>

<style>
    :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
    :global(body) { background: #0e0e16; }

    .page { min-height: 100vh; background: #0e0e16; color: #c9c7e8; font-family: 'Geist', 'Inter', system-ui, sans-serif; position: relative; overflow-x: hidden; }
    .bg-glow { pointer-events: none; position: fixed; top: -30vh; left: 50%; transform: translateX(-50%); width: 900px; height: 600px; background: radial-gradient(ellipse at center, rgba(109,90,205,0.12) 0%, transparent 70%); z-index: 0; }
    .container { position: relative; z-index: 1; max-width: 780px; margin: 0 auto; padding: 0 1.5rem 6rem; }

    /* Nav */
    nav { display: flex; align-items: center; justify-content: space-between; padding: 1.75rem 0 3rem; }
    .nav-brand { display: flex; align-items: center; gap: 0.6rem; }
    .nav-logo { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800; color: white; }
    .nav-name { font-size: 1rem; font-weight: 700; color: #e8e6ff; letter-spacing: -0.02em; }
    .nav-dot { color: #6d5acd; }
    .nav-right { display: flex; align-items: center; gap: 0.75rem; }
    .nav-badge { display: flex; align-items: center; gap: 0.45rem; font-size: 0.72rem; color: #5a576e; font-weight: 500; }
    .badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #3a3750; transition: all 0.3s; }
    .badge-dot.pulse { background: #6d5acd; animation: badge-pulse 1.5s ease-out infinite; }
    @keyframes badge-pulse { 0% { box-shadow: 0 0 0 0 rgba(109,90,205,0.5); } 70% { box-shadow: 0 0 0 6px rgba(109,90,205,0); } 100% { box-shadow: 0 0 0 0 rgba(109,90,205,0); } }
    .nav-history-btn { display: flex; align-items: center; gap: 0.4rem; background: #13121e; border: 1px solid #1e1c2e; color: #8b87a8; font-family: inherit; font-size: 0.72rem; font-weight: 500; padding: 0.35rem 0.75rem; border-radius: 8px; cursor: pointer; transition: all 0.15s; }
    .nav-history-btn:hover { border-color: #6d5acd; color: #c9c7e8; }
    .history-count { background: #6d5acd; color: white; font-size: 0.6rem; font-weight: 700; padding: 0.1rem 0.35rem; border-radius: 999px; }

    /* Sidebar */
    .sidebar-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.5); backdrop-filter: blur(4px); }
    .sidebar { position: fixed; top: 0; right: 0; bottom: 0; z-index: 201; width: 300px; background: #0e0d1a; border-left: 1px solid #1e1c2e; display: flex; flex-direction: column; animation: slide-in 0.2s ease; }
    @keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .sidebar-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.25rem 1rem; border-bottom: 1px solid #1e1c2e; flex-shrink: 0; }
    .sidebar-title { font-size: 0.8rem; font-weight: 700; color: #c9c7e8; letter-spacing: 0.05em; text-transform: uppercase; }
    .sidebar-close { background: none; border: none; color: #4a4760; cursor: pointer; padding: 0.25rem; border-radius: 4px; display: flex; align-items: center; transition: color 0.15s; }
    .sidebar-close:hover { color: #c9c7e8; }
    .sidebar-empty { padding: 2rem 1.25rem; font-size: 0.78rem; color: #3d3a52; text-align: center; }
    .sidebar-list { flex: 1; overflow-y: auto; padding: 0.5rem; list-style: none; }
    .sidebar-item { position: relative; padding: 0.75rem 0.9rem; border-radius: 8px; cursor: pointer; transition: background 0.15s; border: 1px solid transparent; margin-bottom: 0.25rem; }
    .sidebar-item:hover { background: #13121e; border-color: #1e1c2e; }
    .sidebar-item.active { background: #1a1830; border-color: rgba(109,90,205,0.4); }
    .sidebar-item-name { font-size: 0.78rem; font-weight: 500; color: #c9c7e8; font-family: 'Geist Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0.2rem; padding-right: 1.5rem; }
    .sidebar-item-meta { font-size: 0.65rem; color: #3d3a52; }
    .sidebar-delete { position: absolute; top: 0.6rem; right: 0.6rem; background: none; border: none; color: #2e2c42; cursor: pointer; padding: 0.2rem; border-radius: 3px; display: flex; align-items: center; opacity: 0; transition: all 0.15s; }
    .sidebar-item:hover .sidebar-delete { opacity: 1; }
    .sidebar-delete:hover { color: #f87171; background: rgba(248,113,113,0.1); }
    .sidebar-clear { margin: 0.5rem; padding: 0.6rem; background: none; border: 1px solid #1e1c2e; border-radius: 8px; color: #3d3a52; font-family: inherit; font-size: 0.72rem; cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
    .sidebar-clear:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }

    /* Hero */
    .hero { margin-bottom: 2.5rem; }
    .hero-eyebrow { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #6d5acd; margin-bottom: 1rem; }
    .hero-title { font-size: clamp(2.2rem, 5vw, 3.2rem); font-weight: 800; color: #edeaf8; line-height: 1.12; letter-spacing: -0.03em; margin-bottom: 1.1rem; }
    .hero-gradient { background: linear-gradient(120deg, #9b7ff0 0%, #c084fc 50%, #818cf8 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .hero-sub { font-size: 0.98rem; color: #6b6880; line-height: 1.65; }
    @media (max-width: 600px) { .hero-br { display: none; } }

    /* Search */
    .search-form { display: flex; gap: 0.6rem; margin-bottom: 0.75rem; }
    .search-box { flex: 1; display: flex; align-items: center; gap: 0.6rem; background: #13121e; border: 1px solid #232133; border-radius: 10px; padding: 0 1rem; transition: border-color 0.2s, box-shadow 0.2s; }
    .search-box.focused { border-color: #6d5acd; box-shadow: 0 0 0 3px rgba(109,90,205,0.12); }
    .search-icon { color: #3d3a52; flex-shrink: 0; }
    .search-box input { flex: 1; background: transparent; border: none; outline: none; color: #dbd8f5; font-family: 'Geist Mono', monospace; font-size: 0.875rem; padding: 0.95rem 0; }
    .search-box input::placeholder { color: #2e2c42; }
    .clear-btn { background: none; border: none; color: #3d3a52; cursor: pointer; padding: 0.25rem; display: flex; align-items: center; border-radius: 4px; transition: color 0.15s; }
    .clear-btn:hover { color: #9b7ff0; background: rgba(109,90,205,0.1); }
    .analyze-btn { display: flex; align-items: center; gap: 0.5rem; background: #6d5acd; border: none; color: white; font-family: inherit; font-size: 0.875rem; font-weight: 600; padding: 0 1.4rem; border-radius: 10px; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 0 0 1px rgba(109,90,205,0.3); min-width: 108px; justify-content: center; min-height: 48px; }
    .analyze-btn:hover:not(:disabled) { background: #7d6bdd; box-shadow: 0 4px 16px rgba(109,90,205,0.35); }
    .analyze-btn:active:not(:disabled) { transform: scale(0.98); }
    .analyze-btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* Disclaimer */
    .disclaimer { display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: #3d3a52; margin-bottom: 2.5rem; }

    /* Loading */
    .loading-card { background: #13121e; border: 1px solid #1e1c2e; border-radius: 14px; padding: 1.75rem; margin-bottom: 1.5rem; }
    .loading-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    .loading-steps { display: flex; flex-direction: column; gap: 0.6rem; }
    .loading-step { display: flex; align-items: center; gap: 0.6rem; font-size: 0.78rem; color: #3d3a52; transition: color 0.3s; }
    .loading-step.active { color: #c9c7e8; }
    .loading-step.done { color: #5a576e; }
    .step-indicator { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .step-indicator svg { color: #6d5acd; }
    .step-dot-pulse { width: 6px; height: 6px; border-radius: 50%; background: #6d5acd; animation: badge-pulse 1.2s ease-out infinite; display: block; }
    .step-dot-idle { width: 5px; height: 5px; border-radius: 50%; background: #232133; border: 1px solid #2e2c42; display: block; }
    .loading-visual { position: relative; width: 52px; height: 52px; flex-shrink: 0; }
    .loading-ring { position: absolute; inset: 0; border-radius: 50%; border: 1.5px solid transparent; border-top-color: #6d5acd; animation: ring-spin 1.2s linear infinite; }
    .ring-2 { inset: 8px; border-top-color: #9b7ff0; animation-duration: 1.8s; animation-direction: reverse; }
    .ring-3 { inset: 16px; border-top-color: #c084fc; animation-duration: 2.4s; }
    @keyframes ring-spin { to { transform: rotate(360deg); } }
    .loading-bar-track { height: 2px; background: #1e1c2e; border-radius: 999px; overflow: hidden; }
    @keyframes bar-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
    .loading-bar-fill { height: 100%; width: 30%; background: linear-gradient(90deg, transparent, #6d5acd, #c084fc, transparent); animation: bar-sweep 1.8s ease-in-out infinite; }

    /* Error */
    .error-card { display: flex; align-items: center; gap: 0.6rem; padding: 0.9rem 1.1rem; background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; font-size: 0.84rem; color: #f87171; margin-bottom: 1.5rem; }

    /* Toolbar */
    .toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0; flex-wrap: wrap; gap: 0.5rem; }
    .toolbar-left { display: flex; align-items: center; gap: 0.6rem; }
    .toolbar-right { display: flex; align-items: center; gap: 0.15rem; }
    .toolbar-label { font-size: 0.72rem; font-weight: 600; color: #4a4760; text-transform: uppercase; letter-spacing: 0.08em; }
    .chip { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; font-weight: 500; padding: 0.2rem 0.55rem; border-radius: 999px; border: 1px solid; }
    .chip-green { color: #4ade80; border-color: rgba(74,222,128,0.25); background: rgba(74,222,128,0.07); }
    .chip-yellow { color: #fbbf24; border-color: rgba(251,191,36,0.25); background: rgba(251,191,36,0.07); }
    .tool-btn { display: flex; align-items: center; gap: 0.35rem; background: transparent; border: none; color: #5a576e; font-family: inherit; font-size: 0.75rem; font-weight: 500; padding: 0.4rem 0.65rem; border-radius: 6px; cursor: pointer; transition: color 0.15s, background 0.15s; white-space: nowrap; }
    .tool-btn:hover { color: #c9c7e8; background: rgba(255,255,255,0.04); }
    .tool-btn.share-active { color: #4ade80; }
    .divider-v { width: 1px; height: 16px; background: #1e1c2e; margin: 0 0.2rem; }

    /* Report */
    .report { background: #13121e; border: 1px solid #1e1c2e; border-radius: 0 0 14px 14px; border-top: none; padding: 2rem 2.25rem 2.5rem; margin-bottom: 2rem; }
    .format-spinner { display: flex; justify-content: center; padding: 3rem; }

    /* Prose */
    :global(.prose) { color: #8b8799; font-size: 0.9rem; line-height: 1.8; font-family: 'Geist', system-ui, sans-serif; }
    :global(.prose h2) { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6d5acd; margin-top: 2.5rem; margin-bottom: 0.9rem; display: flex; align-items: center; gap: 0.5rem; position: relative; }
    :global(.prose h2::after) { content: ''; flex: 1; height: 1px; background: #1e1c2e; }
    :global(.prose h3) { font-size: 0.88rem; font-weight: 600; color: #c9c7e8; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    :global(.prose p) { margin-bottom: 0.85rem; }
    :global(.prose strong) { color: #dbd8f5; font-weight: 600; }
    :global(.prose a) { color: #9b7ff0; text-underline-offset: 3px; }
    :global(.prose a:hover) { color: #c084fc; }
    :global(.prose code) { font-family: 'Geist Mono', monospace; font-size: 0.8em; background: #1a1830; color: #a78bfa; padding: 0.15em 0.45em; border-radius: 4px; border: 1px solid #2a2740; }
    :global(.prose pre) { background: #0c0b14 !important; border: 1px solid #1e1c2e; border-radius: 10px; padding: 1.25rem 1.5rem; overflow-x: auto; margin: 1.25rem 0; }
    :global(.prose pre code) { background: none; border: none; padding: 0; color: #a78bfa; font-size: 0.82rem; }
    :global(.prose ul, .prose ol) { padding-left: 1.4rem; margin-bottom: 0.85rem; }
    :global(.prose li) { margin-bottom: 0.35rem; }
    :global(.prose li::marker) { color: #3d3a52; }
    :global(.prose blockquote) { border-left: 2px solid #6d5acd; padding-left: 1.1rem; margin-left: 0; color: #5a576e; font-style: italic; }
    :global(.prose hr) { border: none; border-top: 1px solid #1e1c2e; margin: 1.5rem 0; }
    
    /* Section copy button */
    :global(.section-copy-btn) { background: none; border: 1px solid #1e1c2e; color: #3d3a52; border-radius: 4px; padding: 0.2rem 0.3rem; cursor: pointer; display: inline-flex; align-items: center; margin-left: 0.25rem; transition: all 0.15s; flex-shrink: 0; }
    :global(.section-copy-btn:hover) { color: #9b7ff0; border-color: rgba(109,90,205,0.4); background: rgba(109,90,205,0.08); }
    :global(.section-copy-btn.copied) { color: #4ade80; border-color: rgba(74,222,128,0.4); }

    /* Mermaid */
    :global(.mermaid-wrap) { display: block; width: 100%; overflow-x: auto; background: #0c0b14; border: 1px solid #1e1c2e; border-radius: 10px; padding: 1.5rem; margin: 1.25rem 0; min-height: 60px; }
    :global(.mermaid-ok) { display: block; width: 100%; transition: opacity 0.15s; }
    :global(.mermaid-ok:hover) { opacity: 0.85; }
    :global(.mermaid-ok svg) { display: block; width: 100% !important; max-width: 100%; height: auto !important; }
    :global(.mermaid-loading) { color: #3d3a52; font-size: 0.75rem; display: block; padding: 0.5rem; }
    :global(.mermaid-err p) { color: #f87171; font-size: 0.72rem; margin-bottom: 0.5rem; }
    :global(.mermaid-err pre) { font-size: 0.68rem; color: #4a4760; white-space: pre-wrap; word-break: break-all; }

    /* Zoom modal */
    .zoom-backdrop { position: fixed; inset: 0; z-index: 1000; background: #0c0b18; display: flex; flex-direction: column; align-items: stretch; animation: fade-in 0.15s ease; }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
    .zoom-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; background: #13121e; border-bottom: 1px solid #1e1c2e; flex-shrink: 0; }
    .zoom-label { font-size: 0.72rem; font-weight: 600; color: #4a4760; letter-spacing: 0.1em; text-transform: uppercase; }
    .zoom-controls { display: flex; align-items: center; gap: 0.25rem; }
    .zoom-pct { font-size: 0.72rem; font-weight: 600; color: #6d5acd; min-width: 3.5rem; text-align: center; font-family: 'Geist Mono', monospace; }
    .zoom-ctrl-btn { background: transparent; border: 1px solid #1e1c2e; color: #5a576e; width: 30px; height: 30px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; }
    .zoom-ctrl-btn:hover { color: #c9c7e8; background: rgba(255,255,255,0.05); border-color: #2e2c42; }
    .zoom-ctrl-btn.reset:hover { color: #9b7ff0; }
    .zoom-ctrl-btn.close:hover { color: #f87171; border-color: rgba(248,113,113,0.3); }
    .zoom-stage { flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; user-select: none; background-image: radial-gradient(circle, #2a2645 1px, transparent 1px); background-size: 28px 28px; background-color: #0c0b18; }
    .zoom-content { will-change: transform; transition: transform 0.05s linear; max-width: 90vw; }
    :global(.zoom-content svg) { display: block !important; width: auto !important; min-width: min(600px, 80vw); max-width: 82vw !important; height: auto !important; max-height: 72vh !important; filter: drop-shadow(0 0 40px rgba(109,90,205,0.15)); }
    .zoom-hint { text-align: center; font-size: 0.68rem; color: #2e2c42; padding: 0.6rem; flex-shrink: 0; }

    /* Features */
    .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 2rem; }
    @media (max-width: 640px) { .features { grid-template-columns: 1fr; } }
    .feature-card { background: #13121e; border: 1px solid #1e1c2e; border-radius: 12px; padding: 1.4rem; transition: border-color 0.2s; }
    .feature-card:hover { border-color: #2e2c42; }
    .feature-icon { font-size: 1.3rem; margin-bottom: 0.75rem; color: #6d5acd; opacity: 0.7; }
    .feature-title { font-size: 0.85rem; font-weight: 600; color: #c9c7e8; margin-bottom: 0.4rem; }
    .feature-desc { font-size: 0.78rem; color: #4a4760; line-height: 1.6; }

    /* Spinner */
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin-ring { display: inline-block; width: 15px; height: 15px; border: 2px solid rgba(255,255,255,0.2); border-top-color: white; border-radius: 50%; animation: spin 0.65s linear infinite; }
</style>