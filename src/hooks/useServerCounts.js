// Server-computed counts (rebuild Phase 1): one small RPC call replaces
// counting full tables in the browser. Null until loaded or when disabled —
// callers keep their client-computed numbers as the fallback, so a failed or
// slow RPC can never blank a card.
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const useServerCounts = (rpcName, args, enabled) => {
  const [data, setData] = useState(null);
  const argsKey = JSON.stringify(args || {});
  useEffect(() => {
    if (!enabled) {
      setData(null);
      return undefined;
    }
    // Scope switch: drop the previous scope's numbers immediately — the
    // client-computed fallback is scope-correct NOW, while stale server
    // counts from another scope are the "count doesn't match the surface"
    // bug class. Fresh RPC numbers replace the fallback when they land.
    setData(null);
    let alive = true;
    const run = async () => {
      try {
        const { data: result, error } = await supabase.rpc(rpcName, args || {});
        if (alive && !error && result) setData(result);
      } catch {
        // Fallback path (client-computed) stays in effect.
      }
    };
    run();
    const timer = setInterval(run, 60 * 1000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpcName, argsKey, enabled]);
  return data;
};
