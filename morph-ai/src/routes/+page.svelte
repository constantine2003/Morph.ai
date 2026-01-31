<script>
    import { enhance } from '$app/forms';
    import { onMount } from 'svelte';
    import mermaid from 'mermaid';
    // --- STEP 3: IMPORT THE STORE ---
    import { progress } from '$lib/stores/progress';

    export let form;

    // We no longer need "let loading = false" because we use $progress.loading

    $: if (form?.success) {
        setTimeout(() => {
            mermaid.init(undefined, document.querySelectorAll('.mermaid'));
        }, 100);
    }

    onMount(() => {
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });
    });
</script>

<main class="min-h-screen bg-slate-950 text-slate-200 p-8">
    <div class="max-w-4xl mx-auto">
        <header class="mb-12">
            <h1 class="text-5xl font-black text-white italic tracking-tighter">MORPH<span class="text-blue-500">.AI</span></h1>
            <p class="text-slate-400">Codebase intelligence dashboard.</p>
        </header>

        <form 
            method="POST" 
            action="?/analyzeRepo" 
            use:enhance={() => {
                // Set the store to loading
                $progress.loading = true;
                $progress.status = "Morphing...";

                return async ({ update }) => {
                    await update();
                    // Set the store to idle when finished
                    $progress.loading = false;
                    $progress.status = "Idle";
                };
            }} 
            class="flex gap-4"
        >
            <input 
                name="repoUrl" 
                placeholder="https://github.com/..." 
                class="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            
            <button 
                disabled={$progress.loading}
                class="bg-blue-600 px-8 rounded-lg font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
                {$progress.loading ? $progress.status : 'Morph'}
            </button>
        </form>

        {#if form?.success}
            <div class="mt-12 p-8 bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl">
                <article class="prose prose-invert prose-blue max-w-none">
                    {@html form.analysis.replace(/```mermaid([\s\S]*?)```/g, '<pre class="mermaid">$1</pre>')}
                </article>
            </div>
        {/if}
    </div>
</main>