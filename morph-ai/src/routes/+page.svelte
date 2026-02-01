<script lang="ts">
    import { enhance } from '$app/forms';
    import { progress } from '$lib/stores/progress';
    import { onMount } from 'svelte';
    import mermaid from 'mermaid';
    import { marked } from 'marked';
    import { jsPDF } from 'jspdf';

    export let form: any;

    let mdHover = false;
    let pdfHover = false;
    let txtHover = false;

    onMount(() => {
        mermaid.initialize({ 
            startOnLoad: false, 
            theme: 'dark',
            securityLevel: 'loose'
        });
    });

    async function formatOutput(text: string): Promise<string> {
        if (!text) return '';
        const html = await marked.parse(text);
        return html.replace(
            /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, 
            '<pre class="mermaid">$1</pre>'
        );
    }

    // Export Logic
    const downloadFile = async (type: 'md' | 'pdf' | 'txt') => {
        const content = form?.analysis;
        if (!content) return;

        const filename = `MorphAI-Analysis-${Date.now()}`;

        if (type === 'pdf') {
            const doc = new jsPDF();
            const margin = 10;
            const pageWidth = doc.internal.pageSize.getWidth() - (margin * 2);
            const pageHeight = doc.internal.pageSize.getHeight();

            doc.setFont("helvetica", "bold");
            doc.text("Morph.ai Analysis Report", margin, 20);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);

            // Convert Markdown to HTML, then to plain text for PDF
            const html = await marked.parse(content);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const textContent = tempDiv.innerText;

            const splitText = doc.splitTextToSize(textContent, pageWidth);
            let y = 30;
            const lineHeight = 7; // Approximate line height in jsPDF units
            for (let i = 0; i < splitText.length; i++) {
                if (y + lineHeight > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
                doc.text(splitText[i], margin, y);
                y += lineHeight;
            }
            doc.save(`${filename}.pdf`);
        } else {
            let exportContent = content;
            let mimeType = 'text/plain';
            if (type === 'md') {
                mimeType = 'text/markdown';
            } else if (type === 'txt') {
                // Convert Markdown to plain text for .txt export
                const html = await marked.parse(content);
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;
                exportContent = tempDiv.innerText;
            }
            const blob = new Blob([exportContent], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename}.${type}`;
            link.click();
            URL.revokeObjectURL(url);
        }
    };

    $: if (form?.success) {
        setTimeout(async () => {
            await mermaid.run({
                nodes: document.querySelectorAll('.mermaid')
            });
        }, 300);
    }
</script>

<main class="min-h-screen bg-slate-950 text-slate-200 p-8 font-mono">
    <div class="max-w-4xl mx-auto">
        <header class="mb-12 border-l-4 border-blue-500 pl-6">
            <h1 class="text-5xl font-black text-white italic tracking-tighter uppercase">
                Morph<span class="text-blue-500">.ai</span>
            </h1>
            <p class="text-slate-500 text-sm mt-2">v1.0.0-rc1. // ARCHITECTURAL INTELLIGENCE ENGINE</p>
        </header>

        <div class="mb-4 p-4 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 rounded-xl text-sm">
            <strong>Note:</strong> The AI may be prone to hallucination or making up details. For best results, please provide a public repository and always double-check the analysis output.
        </div>
        <form 
            method="POST" 
            action="?/analyzeRepo" 
            use:enhance={() => {
                $progress.loading = true;
                $progress.status = "Analyzing repository structure...";
                return async ({ update }) => {
                    await update();
                    $progress.loading = false;
                };
            }} 
            class="flex gap-3 mb-6"
        >
            <input 
                name="repoUrl" 
                placeholder="https://github.com/username/repo" 
                class="flex-1 bg-slate-900 border border-slate-800 rounded-xl p-4 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                required
            />
            <button 
                disabled={$progress.loading} 
                class="bg-blue-600 px-10 rounded-xl font-bold hover:bg-blue-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
                {$progress.loading ? 'WORKING...' : 'MORPH'}
            </button>
        </form>

        {#if form?.success && !$progress.loading}
            <div class="flex items-center gap-4 mb-6 p-4 bg-slate-900/50 border border-slate-800 rounded-xl animate-in fade-in zoom-in duration-500">
                <span class="text-xs font-bold text-slate-500 uppercase tracking-widest">Export Intelligence:</span>
                <div class="flex gap-2">
                    <button
                        on:click={() => downloadFile('md')}
                        class="export-btn font-bold px-4 py-2 rounded-lg text-blue-700 transition-all duration-200 hover:underline"
                    >
                        Markdown
                    </button>
                    <button
                        on:click={() => downloadFile('pdf')}
                        class="export-btn font-bold px-4 py-2 rounded-lg text-blue-700 transition-all duration-200 hover:underline"
                    >
                        PDF Report
                    </button>
                    <button
                        on:click={() => downloadFile('txt')}
                        class="export-btn font-bold px-4 py-2 rounded-lg text-blue-700 transition-all duration-200 hover:underline"
                    >
                        Plain Text
                    </button>
                </div>
            </div>
        {/if}

        {#if $progress.loading}
            <div class="mb-10 animate-in fade-in">
                <div class="flex justify-between text-xs text-blue-500 mb-2 font-bold uppercase tracking-widest">
                    <span>{$progress.status}</span>
                    <span>System Active</span>
                </div>
                <div class="w-full bg-slate-900 h-1 overflow-hidden rounded-full">
                    <div class="bg-blue-500 h-full animate-progress-bar"></div>
                </div>
            </div>
        {/if}

        {#if form?.success}
            <div class="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
                <div class="p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl prose prose-invert prose-blue max-w-none">
                    {#await formatOutput(form.analysis)}
                        <div class="flex items-center gap-3 text-slate-500">
                            <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                            <p>Formatting intelligence report...</p>
                        </div>
                    {:then cleanHtml}
                        {@html cleanHtml}
                    {/await}
                </div>
            </div>
        {:else if form?.error}
            <div class="p-4 bg-red-950/30 border border-red-900/50 text-red-400 rounded-xl text-sm">
                <strong>Error:</strong> {form.error}
            </div>
        {/if}
    </div>
</main>

<style>
    /* Removed .export-btn because @apply was failing */
    
    @keyframes progress-loading {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
    }
    
    .animate-progress-bar {
        width: 40%;
        animation: progress-loading 1.5s infinite linear;
    }

    :global(.mermaid) {
        background: #0f172a !important;
        padding: 2rem;
        border-radius: 1rem;
        margin: 2rem 0;
        display: flex;
        justify-content: center;
        border: 1px solid #1e293b;
    }
</style>