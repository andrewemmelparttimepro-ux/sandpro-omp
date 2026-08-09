// Feature flags for the rebuild rollout. Read-only from clients (app_flags
// table, RLS select-only); flipped via SQL so a rollback needs no deploy.
// Flags refresh every 5 minutes, so a flip reaches open sessions within that
// window and new sessions immediately.
import { useEffect, useReducer } from 'react';
import { supabase } from './supabase';

const state = { flags: {}, loaded: false, listeners: new Set() };

export const refreshFlags = async () => {
  try {
    const { data, error } = await supabase.from('app_flags').select('key,enabled');
    if (error || !data) return;
    state.flags = Object.fromEntries(data.map((row) => [row.key, Boolean(row.enabled)]));
    state.loaded = true;
    state.listeners.forEach((fn) => fn());
  } catch {
    // Keep the last known flags; never break a surface over a flag fetch.
  }
};

// Non-hook access for data-layer code paths.
let loadPromise = null;
export const ensureFlagsLoaded = () => {
  if (state.loaded) return Promise.resolve();
  if (!loadPromise) loadPromise = refreshFlags().finally(() => { loadPromise = null; });
  return loadPromise;
};
export const getFlag = (key) => Boolean(state.flags[key]);

export const useAppFlag = (key) => {
  const [, force] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    const listener = () => force();
    state.listeners.add(listener);
    if (!state.loaded) refreshFlags();
    const timer = setInterval(refreshFlags, 5 * 60 * 1000);
    return () => {
      state.listeners.delete(listener);
      clearInterval(timer);
    };
  }, []);
  return Boolean(state.flags[key]);
};
