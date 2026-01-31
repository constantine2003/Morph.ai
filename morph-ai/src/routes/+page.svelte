<script>
    import { enhance } from '$app/forms';
    import { progress } from '$lib/stores/progress';
    import { onMount } from 'svelte';
    import mermaid from 'mermaid';
    import { marked } from 'marked'; // The translator

    export let form;

    onMount(() => {
        mermaid.initialize({ 
            startOnLoad: false, 
            theme: 'dark' 
        });
    });

    // This function handles the "Translation" from AI text to Pretty HTML
    function formatOutput(text) {
        if (!text) return '';
        const html = marked.parse(text);
        // This line finds the Mermaid code blocks and prepares them for drawing
        return html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, '<pre class="mermaid">$1</pre>');
    }

    $: if (form?.success) {
        setTimeout(async () => {
            // This triggers Mermaid to actually draw the diagrams
            await mermaid.run({
                nodes: document.querySelectorAll('.mermaid')
            });
        }, 200);
    }
</script>

<main class="min-h-screen bg-slate-950 text-slate-200 p-8 font-mono">
    <div class="max-w-4xl mx-auto">
        <header class="mb-12 border-l-4 border-blue-500 pl-6">
            <h1 class="text-5xl font-black text-white italic tracking-tighter">MORPH<span class="text-blue-500">.AI</span></h1>
            <p class="text-slate-400">v1.0 // Codebase Intelligence</p>
        </header>

        <form method="POST" action="?/analyzeRepo" use:enhance={() => {
            $progress.loading = true;
            $progress.status = "Analyzing Logic...";
            return async ({ update }) => {
                await update();
                $progress.loading = false;
            };
        }} class="flex gap-4 mb-8">
            <input 
                name="repoUrl" 
                placeholder="Paste GitHub Repo URL..." 
                class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button disabled={$progress.loading} class="bg-blue-600 px-8 rounded-lg font-bold hover:bg-blue-500 transition-all disabled:opacity-50">
                {$progress.loading ? 'ANALYZING...' : 'MORPH'}
            </button>
        </form>

        {#if $progress.loading}
            <div class="w-full bg-slate-800 h-1 mb-8 overflow-hidden rounded-full">
                <div class="bg-blue-500 h-full animate-[progress_2s_ease-in-out_infinite] w-1/2"></div>
            </div>
        {/if}

        {#if form?.success}
            <div class="p-8 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl prose prose-invert prose-blue max-w-none">
                {@html formatOutput(form.analysis)}
            </div>
        {/if}
    </div>
</main>

<style>
    @keyframes progress {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
    }
</style>