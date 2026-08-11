import { useEffect, useState } from 'react';
import { UploadCloud, RefreshCw, Trash2, WifiOff } from 'lucide-react';

// The outbox's honest face: a persistent chip whenever work is waiting to
// send, expandable to review, retry, or discard. Renders nothing when the
// queue is empty — zero chrome for the common case.
export const OutboxChip = ({ outbox, onDrainNow }) => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => outbox.subscribe(setItems), [outbox]);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (items.length === 0) return null;

  const failed = items.filter((item) => item.status === 'failed');

  return (
    <div className="outbox-chip-wrap">
      {open && (
        <div className="outbox-panel">
          <div className="outbox-panel-head">
            <strong>Outbox</strong>
            <span>{online ? 'Online — sending' : 'Offline — will send when signal returns'}</span>
          </div>
          {items.map((item) => (
            <div className="outbox-item" key={item.id}>
              <div className="outbox-item-main">
                <span className="outbox-item-kind">{item.kind === 'ncr' ? 'NCR' : 'TASK'}</span>
                <span className="outbox-item-title">{item.title}</span>
                {item.files?.length > 0 && <span className="outbox-item-files">{item.files.length} file{item.files.length === 1 ? '' : 's'}</span>}
              </div>
              {item.lastError && <div className="outbox-item-error">{item.lastError}</div>}
              <div className="outbox-item-actions">
                {item.status === 'failed' && (
                  <button type="button" onClick={() => outbox.retryFailed(item.id).then(onDrainNow)}>
                    <RefreshCw size={11} /> Retry
                  </button>
                )}
                <button type="button" className="danger" onClick={() => outbox.discard(item.id)}>
                  <Trash2 size={11} /> Discard
                </button>
              </div>
            </div>
          ))}
          {online && failed.length === 0 && (
            <button type="button" className="outbox-send-now" onClick={onDrainNow}>
              <UploadCloud size={13} /> Send now
            </button>
          )}
        </div>
      )}
      <button type="button" className={`outbox-chip ${online ? '' : 'offline'}`} onClick={() => setOpen((value) => !value)} aria-label={`Outbox: ${items.length} waiting to send`}>
        {online ? <UploadCloud size={14} /> : <WifiOff size={14} />}
        <span>{items.length} waiting to send</span>
      </button>
    </div>
  );
};
