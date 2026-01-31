import { writable } from 'svelte/store';

// This creates a piece of data that 'broadcasts' its changes
export const progress = writable({
    status: 'Idle',
    loading: false
});