import { useState, useEffect, useRef } from 'react';
import {
  X, Send, Paperclip, Check, AlertTriangle, Clock, MessageSquare,
  Activity, Zap, Calendar, ChevronDown, Download, Upload, FileText,
  Image, File, Film, Music, Archive, TrendingUp, Layers, ArrowLeft,
  Target, CheckCircle2, Building2, Plus, Edit3, Trash2, Flag
} from 'lucide-react';
import { getUser, getStatusColor, getStatusLabel, getStatusBg, getPriorityColor, formatDate, timeAgo, isOverdue, STATUS_CONFIG, generateId, USERS } from './data';

// ============================================================================
// AVATAR
// ============================================================================
export const Avatar = ({ user, size = 32 }) => (
  <div className="avatar" style={{ width: size, height: size, background: user?.color || "#F97316", fontSize: size * 0.35 }}>
    {user?.initials || "??"}
  </div>
);

// ============================================================================
// BADGE
// ============================================================================
export const Badge = ({ children, color = "#F97316", outline = false }) => (
  <span className="badge" style={{
    background: outline ? "transparent" : color + "22",
    color: color,
    border: outline ? `1px solid ${color}44` : "none"
  }}>
    {children}
  </span>
);

// ============================================================================
// PROGRESS BAR
// ============================================================================
export const ProgressBar = ({ value, color = "#F97316", height = 4 }) => (
  <div className="progress-track" style={{ height }}>
    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
  </div>
);

// ============================================================================
// KPI CARD
// ============================================================================
export const KPICard = ({ icon: Icon, label, value, sub, color = "#F97316", onClick }) => (
  <div className={`card ${onClick ? 'card-hover cursor-pointer' : ''}`} onClick={onClick} style={{ flex: 1, minWidth: 140 }}>
    <div style={{ padding: 16 }}>
      <div className="flex items-center gap-8" style={{ marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={color} />
        </div>
        <span className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      </div>
      <div className="text-2xl font-bold text-primary" style={{ lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  </div>
);

// ============================================================================
// OBJECTIVE CARD (mini card for grids)
// ============================================================================
export const ObjectiveCard = ({ obj, onClick }) => {
  const owner = getUser(obj.ownerId);
  const overdue = isOverdue(obj);
  const msgCount = obj.messages?.length || 0;

  return (
    <div className="card card-hover cursor-pointer" onClick={onClick}
      style={{ borderColor: obj.blockerFlag ? "#EF444444" : overdue ? "#F59E0B44" : undefined }}>
      <div style={{ padding: 16 }}>
        {obj.blockerFlag && <div style={{ position: "absolute", top: 8, right: 8 }}><AlertTriangle size={14} color="#EF4444" /></div>}
        <div className="flex items-center gap-6" style={{ marginBottom: 10 }}>
          <Badge color={getStatusColor(obj.status)}>{getStatusLabel(obj.status)}</Badge>
          <Badge color={getPriorityColor(obj.priority)} outline>{obj.priority}</Badge>
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-10)", margin: 0, lineHeight: 1.3, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {obj.title}
        </h3>
        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={3} />
        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
          <div className="flex items-center gap-6">
            <Avatar user={owner} size={22} />
            <span className="text-xs text-muted">{owner.name.split(" ")[0]}</span>
          </div>
          <div className="flex items-center gap-8">
            {msgCount > 0 && <div className="flex items-center gap-4"><MessageSquare size={11} color="var(--accent-7)" /><span className="text-xs text-muted">{msgCount}</span></div>}
            {obj.files?.length > 0 && <div className="flex items-center gap-4"><Paperclip size={11} color="var(--accent-7)" /><span className="text-xs text-muted">{obj.files.length}</span></div>}
            <span className="text-xs" style={{ color: overdue ? "var(--warning)" : "var(--accent-7)", fontWeight: overdue ? 600 : 400 }}>
              {formatDate(obj.dueDate)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// TOAST SYSTEM
// ============================================================================
export const ToastContainer = ({ toasts, removeToast }) => (
  <div className="toast-container">
    {toasts.map(t => (
      <div key={t.id} className={`toast toast-${t.type || 'info'}`}>
        {t.type === 'success' && <CheckCircle2 size={16} />}
        {t.type === 'error' && <AlertTriangle size={16} />}
        <span style={{ flex: 1 }}>{t.message}</span>
        <button onClick={() => removeToast(t.id)} style={{ color: "inherit", opacity: 0.7 }}><X size={14} /></button>
      </div>
    ))}
  </div>
);

// ============================================================================
// EMPTY STATE
// ============================================================================
export const EmptyState = ({ icon: Icon, text }) => (
  <div className="empty-state">
    <Icon size={32} strokeWidth={1.5} />
    <p>{text}</p>
  </div>
);

// ============================================================================
// SUPER CARD MODAL — Full objective detail
// ============================================================================
export const SuperCard = ({ obj, objectives, onClose, onUpdate, onDelete, currentUser, addToast }) => {
  const [activeTab, setActiveTab] = useState("messages");
  const [newMessage, setNewMessage] = useState("");
  const [editingProgress, setEditingProgress] = useState(false);
  const [progressValue, setProgressValue] = useState(obj.progress);
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionValue, setNextActionValue] = useState(obj.nextAction || "");
  const messagesEndRef = useRef(null);
  const [localObj, setLocalObj] = useState(obj);

  useEffect(() => { setLocalObj(obj); setProgressValue(obj.progress); setNextActionValue(obj.nextAction || ""); }, [obj]);
  useEffect(() => { if (messagesEndRef.current && activeTab === "messages") messagesEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [localObj.messages, activeTab]);

  const owner = getUser(localObj.ownerId);
  const creator = getUser(localObj.createdBy);
  const delegator = localObj.delegatedBy ? getUser(localObj.delegatedBy) : null;
  const overdue = isOverdue(localObj);
  const getFileIcon = (type) => ({ pdf: FileText, image: Image, spreadsheet: FileText, video: Film, audio: Music, archive: Archive }[type] || File);

  const doUpdate = (changes) => {
    const updated = { ...localObj, ...changes };
    setLocalObj(updated);
    onUpdate(updated);
  };

  const sendMessage = () => {
    if (!newMessage.trim()) return;
    doUpdate({ messages: [...localObj.messages, { id: generateId(), userId: currentUser.id, text: newMessage.trim(), ts: new Date().toISOString(), attachments: [] }] });
    setNewMessage("");
  };

  const updateStatus = (newStatus) => {
    doUpdate({
      status: newStatus,
      progress: newStatus === "completed" ? 100 : localObj.progress,
      updates: [...localObj.updates, { ts: new Date().toISOString(), status: newStatus, progress: newStatus === "completed" ? 100 : localObj.progress, note: `Status changed to ${getStatusLabel(newStatus)}` }]
    });
    addToast({ type: 'success', message: `Status updated to ${getStatusLabel(newStatus)}` });
  };

  const saveProgress = () => {
    const val = Math.min(100, Math.max(0, parseInt(progressValue) || 0));
    doUpdate({
      progress: val,
      updates: [...localObj.updates, { ts: new Date().toISOString(), status: localObj.status, progress: val, note: `Progress updated to ${val}%` }]
    });
    setEditingProgress(false);
    addToast({ type: 'success', message: `Progress updated to ${val}%` });
  };

  const saveNextAction = () => {
    doUpdate({ nextAction: nextActionValue });
    setEditingNextAction(false);
  };

  const acknowledge = () => {
    doUpdate({ acknowledged: true });
    addToast({ type: 'success', message: 'Objective acknowledged' });
  };

  const toggleBlocker = () => {
    if (localObj.blockerFlag) {
      doUpdate({ blockerFlag: false, blockerReason: "" });
      addToast({ type: 'success', message: 'Blocker removed' });
    } else {
      const reason = prompt("Describe the blocker:");
      if (reason) {
        doUpdate({ blockerFlag: true, blockerReason: reason, status: "blocked" });
        addToast({ type: 'error', message: 'Blocker flagged' });
      }
    }
  };

  const tabs = [
    { id: "messages", label: "Messages", icon: MessageSquare, count: localObj.messages?.length },
    { id: "details", label: "Details", icon: FileText },
    { id: "files", label: "Files", icon: Paperclip, count: localObj.files?.length },
    { id: "activity", label: "Activity", icon: Activity },
  ];
  if (localObj.subtasks?.length > 0) tabs.splice(2, 0, { id: "subtasks", label: "Subtasks", icon: Layers, count: localObj.subtasks.length });
  if (localObj.type === "measured") tabs.splice(2, 0, { id: "metrics", label: "Metrics", icon: TrendingUp });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ width: "min(95vw, 720px)", maxHeight: "92vh" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--accent-5)" }}>
          <div className="flex justify-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, marginRight: 16 }}>
              <div className="flex gap-6 flex-wrap" style={{ marginBottom: 8 }}>
                <Badge color={getStatusColor(localObj.status)}>{getStatusLabel(localObj.status)}</Badge>
                <Badge color={getPriorityColor(localObj.priority)} outline>{localObj.priority}</Badge>
                {localObj.blockerFlag && <Badge color="#EF4444">BLOCKED</Badge>}
                {overdue && <Badge color="#F59E0B">OVERDUE</Badge>}
                {!localObj.acknowledged && localObj.delegatedBy && <Badge color="#8B5CF6">Needs Acknowledgement</Badge>}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{localObj.title}</h2>
            </div>
            <div className="flex gap-4">
              <button className="icon-btn" onClick={toggleBlocker} title={localObj.blockerFlag ? "Remove blocker" : "Flag blocker"}>
                <Flag size={16} color={localObj.blockerFlag ? "#EF4444" : undefined} />
              </button>
              {onDelete && <button className="icon-btn" onClick={() => { if(confirm("Delete this objective?")) onDelete(localObj.id); }} title="Delete"><Trash2 size={16} /></button>}
              <button onClick={onClose} className="icon-btn"><X size={20} /></button>
            </div>
          </div>
          {/* Owner bar */}
          <div className="flex items-center gap-16 flex-wrap text-sm text-secondary" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-6"><Avatar user={owner} size={22} /><span><strong className="text-primary">{owner.name}</strong> owns</span></div>
            {delegator && <div className="flex items-center gap-6"><ArrowLeft size={12} /><span>Delegated by <strong className="text-primary">{delegator.name}</strong></span></div>}
            <div className="flex items-center gap-4"><Calendar size={12} /><span style={{ color: overdue ? "var(--warning)" : undefined, fontWeight: overdue ? 600 : 400 }}>{formatDate(localObj.dueDate)}</span></div>
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setEditingProgress(true)}>
              {editingProgress ? (
                <div className="flex items-center gap-4">
                  <input type="number" value={progressValue} onChange={e => setProgressValue(e.target.value)} min={0} max={100} style={{ width: 50, padding: "2px 6px", fontSize: 12 }} autoFocus onKeyDown={e => { if (e.key === "Enter") saveProgress(); if (e.key === "Escape") setEditingProgress(false); }} />
                  <span className="text-xs">%</span>
                  <button className="btn btn-xs btn-primary" onClick={saveProgress}>Save</button>
                </div>
              ) : <span>{localObj.progress}% <Edit3 size={10} style={{ opacity: 0.5 }} /></span>}
            </div>
          </div>
          {/* Acknowledge button */}
          {!localObj.acknowledged && localObj.delegatedBy && localObj.ownerId === currentUser.id && (
            <button className="btn btn-primary btn-sm" onClick={acknowledge} style={{ marginBottom: 12 }}>
              <Check size={14} /> Acknowledge Delegation
            </button>
          )}
          <ProgressBar value={localObj.progress} color={getStatusColor(localObj.status)} height={3} />
          {/* Tabs */}
          <div className="flex gap-4" style={{ marginTop: 12, marginBottom: -1, overflowX: "auto" }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="flex items-center gap-4" style={{
                padding: "8px 14px", border: "none", borderBottom: activeTab === tab.id ? "2px solid var(--brand)" : "2px solid transparent",
                background: "none", color: activeTab === tab.id ? "var(--brand)" : "var(--accent-7)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap"
              }}>
                <tab.icon size={13} />
                {tab.label}
                {tab.count > 0 && <span style={{ background: activeTab === tab.id ? "var(--brand-bg)" : "var(--accent-5)", borderRadius: "var(--radius-full)", padding: "1px 6px", fontSize: 10 }}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {/* MESSAGES */}
          {activeTab === "messages" && (
            <div className="flex flex-col" style={{ minHeight: 300 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                {localObj.messages.length === 0 ? <EmptyState icon={MessageSquare} text="No messages yet. Start the conversation." /> :
                  localObj.messages.map(msg => {
                    const msgUser = getUser(msg.userId);
                    const isMe = msg.userId === currentUser.id;
                    return (
                      <div key={msg.id} className="flex gap-10" style={{ marginBottom: 16, flexDirection: isMe ? "row-reverse" : "row" }}>
                        <Avatar user={msgUser} size={28} />
                        <div style={{ maxWidth: "75%", background: isMe ? "var(--brand-bg)" : "var(--accent-4)", borderRadius: isMe ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "10px 14px", border: `1px solid ${isMe ? "var(--brand-border)" : "var(--accent-5)"}` }}>
                          <div className="flex items-center gap-6" style={{ marginBottom: 4 }}>
                            <span className="text-xs font-bold" style={{ color: msgUser.color }}>{msgUser.name}</span>
                            <span className="text-xs text-muted">{timeAgo(msg.ts)}</span>
                          </div>
                          <p className="text-md" style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--accent-9)" }}>{msg.text}</p>
                          {msg.attachments?.length > 0 && (
                            <div className="flex gap-6 flex-wrap" style={{ marginTop: 8 }}>
                              {msg.attachments.map((att, j) => (
                                <div key={j} className="flex items-center gap-4 text-xs text-muted" style={{ padding: "4px 8px", borderRadius: 6, background: "var(--accent-1)" }}>
                                  <Paperclip size={10} />{att.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* DETAILS */}
          {activeTab === "details" && (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: 20 }}>
                <label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</label>
                <p className="text-md" style={{ lineHeight: 1.6, marginTop: 6, color: "var(--accent-9)" }}>{localObj.description || "No description provided."}</p>
              </div>
              {localObj.blockerFlag && (
                <div className="card" style={{ background: "var(--error-bg)", borderColor: "rgba(239,68,68,0.2)", marginBottom: 20, padding: "12px 16px" }}>
                  <div className="flex items-center gap-6" style={{ marginBottom: 6 }}><AlertTriangle size={14} color="var(--error)" /><span className="text-sm font-bold text-error">Blocker</span></div>
                  <p className="text-md" style={{ color: "#FCA5A5", margin: 0 }}>{localObj.blockerReason}</p>
                </div>
              )}
              {/* Next Action */}
              <div style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <div className="flex items-center gap-6"><Zap size={14} color="var(--brand)" /><span className="text-sm font-bold text-brand">Next Action</span></div>
                  <button className="icon-btn" onClick={() => setEditingNextAction(!editingNextAction)} style={{ width: 24, height: 24 }}><Edit3 size={12} /></button>
                </div>
                {editingNextAction ? (
                  <div className="flex gap-8">
                    <input value={nextActionValue} onChange={e => setNextActionValue(e.target.value)} style={{ flex: 1, fontSize: 13 }} autoFocus onKeyDown={e => { if (e.key === "Enter") saveNextAction(); }} />
                    <button className="btn btn-xs btn-primary" onClick={saveNextAction}>Save</button>
                  </div>
                ) : (
                  <p className="text-md" style={{ color: "#FDBA74", margin: 0 }}>{localObj.nextAction || "No next action defined."}</p>
                )}
              </div>
              {/* Status buttons */}
              <div style={{ marginBottom: 20 }}>
                <label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 8 }}>Update Status</label>
                <div className="flex gap-6 flex-wrap">
                  {["not_started", "on_track", "at_risk", "blocked", "completed"].map(s => (
                    <button key={s} onClick={() => updateStatus(s)} className="btn btn-xs" style={{
                      border: `1px solid ${localObj.status === s ? getStatusColor(s) : "var(--accent-5)"}`,
                      background: localObj.status === s ? getStatusBg(s) : "transparent",
                      color: localObj.status === s ? getStatusColor(s) : "var(--accent-7)"
                    }}>{getStatusLabel(s)}</button>
                  ))}
                </div>
              </div>
              {/* Parent link */}
              {localObj.parentId && (
                <div style={{ marginBottom: 20 }}>
                  <label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Parent Objective</label>
                  <div className="text-md text-brand" style={{ marginTop: 6 }}>{objectives.find(o => o.id === localObj.parentId)?.title || "—"}</div>
                </div>
              )}
              {/* Children */}
              {objectives.filter(o => o.parentId === localObj.id).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Child Objectives</label>
                  {objectives.filter(o => o.parentId === localObj.id).map(child => (
                    <div key={child.id} className="flex items-center gap-8" style={{ marginTop: 6 }}>
                      <div className="status-dot" style={{ background: getStatusColor(child.status) }} />
                      <span className="text-sm">{child.title}</span>
                      <span className="text-xs text-muted">{child.progress}%</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Meta grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Created by</label><div className="flex items-center gap-6" style={{ marginTop: 4 }}><Avatar user={creator} size={20} /><span className="text-sm">{creator.name}</span></div></div>
                <div><label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Department</label><div className="text-sm" style={{ marginTop: 4 }}>{localObj.department}</div></div>
                <div><label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Start Date</label><div className="text-sm" style={{ marginTop: 4 }}>{localObj.startDate ? new Date(localObj.startDate).toLocaleDateString() : "—"}</div></div>
                <div><label className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>Due Date</label><div className="text-sm" style={{ marginTop: 4, color: overdue ? "var(--warning)" : undefined, fontWeight: overdue ? 600 : 400 }}>{localObj.dueDate ? new Date(localObj.dueDate).toLocaleDateString() : "—"}</div></div>
              </div>
            </div>
          )}

          {/* SUBTASKS */}
          {activeTab === "subtasks" && (
            <div style={{ padding: "20px 24px" }}>
              {localObj.subtasks.map(st => {
                const stOwner = getUser(st.ownerId);
                return (
                  <div key={st.id} className="flex items-center gap-12" style={{ padding: "12px 0", borderBottom: "1px solid var(--accent-4)" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${getStatusColor(st.status)}`, display: "flex", alignItems: "center", justifyContent: "center", background: st.status === "completed" ? getStatusColor(st.status) : "transparent" }}>
                      {st.status === "completed" && <Check size={12} color="#fff" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="text-md font-medium" style={{ color: st.status === "completed" ? "var(--accent-7)" : "var(--accent-10)", textDecoration: st.status === "completed" ? "line-through" : "none" }}>{st.title}</div>
                      <div className="flex items-center gap-8" style={{ marginTop: 4 }}>
                        <Avatar user={stOwner} size={16} />
                        <span className="text-xs text-muted">{stOwner.name.split(" ")[0]}</span>
                        <div style={{ flex: 1 }}><ProgressBar value={st.progress} color={getStatusColor(st.status)} height={2} /></div>
                        <span className="text-xs text-muted">{st.progress}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* METRICS */}
          {activeTab === "metrics" && localObj.type === "measured" && (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div className="card" style={{ padding: 14, textAlign: "center" }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Baseline</div>
                  <div className="text-xl font-bold text-secondary">{localObj.metricUnit === "$" ? `$${(localObj.baselineMetric / 1000000).toFixed(1)}M` : localObj.baselineMetric + (localObj.metricUnit || "")}</div>
                </div>
                <div style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", borderRadius: 10, padding: 14, textAlign: "center" }}>
                  <div className="text-xs text-brand" style={{ marginBottom: 4 }}>Current</div>
                  <div className="text-xl font-bold text-brand">{localObj.metricUnit === "$" ? `$${(localObj.currentMetric / 1000000).toFixed(1)}M` : localObj.currentMetric + (localObj.metricUnit || "")}</div>
                </div>
                <div className="card" style={{ padding: 14, textAlign: "center" }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Target</div>
                  <div className="text-xl font-bold text-success">{localObj.metricUnit === "$" ? `$${(localObj.targetMetric / 1000000).toFixed(1)}M` : localObj.targetMetric + (localObj.metricUnit || "")}</div>
                </div>
              </div>
              <div className="progress-track" style={{ height: 12, borderRadius: 6 }}>
                <div className="progress-fill" style={{ width: `${((localObj.currentMetric - localObj.baselineMetric) / (localObj.targetMetric - localObj.baselineMetric)) * 100}%`, background: "linear-gradient(90deg, var(--brand), var(--success))", borderRadius: 6 }} />
              </div>
              <div className="text-sm text-muted" style={{ textAlign: "center", marginTop: 8 }}>
                {Math.round(((localObj.currentMetric - localObj.baselineMetric) / (localObj.targetMetric - localObj.baselineMetric)) * 100)}% to target
              </div>
            </div>
          )}

          {/* FILES */}
          {activeTab === "files" && (
            <div style={{ padding: "20px 24px" }}>
              {localObj.files.length === 0 ? <EmptyState icon={Paperclip} text="No files attached yet." /> :
                localObj.files.map((f, i) => {
                  const FIcon = getFileIcon(f.type);
                  return (
                    <div key={i} className="flex items-center gap-12 card" style={{ padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><FIcon size={16} color="var(--brand)" /></div>
                      <div style={{ flex: 1 }}>
                        <div className="text-md font-medium">{f.name}</div>
                        <div className="text-xs text-muted">{f.size} · {timeAgo(f.ts)}</div>
                      </div>
                      <Download size={14} color="var(--accent-7)" className="cursor-pointer" />
                    </div>
                  );
                })}
              <div className="card cursor-pointer" style={{ marginTop: 16, border: "2px dashed var(--accent-5)", textAlign: "center", padding: 24, color: "var(--accent-7)" }}>
                <Upload size={18} style={{ margin: "0 auto 6px" }} />
                <div className="text-sm">Drop files here or click to attach</div>
              </div>
            </div>
          )}

          {/* ACTIVITY */}
          {activeTab === "activity" && (
            <div style={{ padding: "20px 24px" }}>
              {localObj.updates.length === 0 ? <EmptyState icon={Activity} text="No activity recorded yet." /> : (
                <div style={{ paddingLeft: 20, position: "relative" }}>
                  <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 2, background: "var(--accent-5)" }} />
                  {[...localObj.updates].reverse().map((u, i) => (
                    <div key={i} style={{ position: "relative", marginBottom: 20, paddingLeft: 16 }}>
                      <div style={{ position: "absolute", left: -18, top: 4, width: 10, height: 10, borderRadius: "50%", background: getStatusColor(u.status), border: "2px solid var(--accent-2)" }} />
                      <div className="text-xs text-muted">{new Date(u.ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div className="text-md" style={{ marginTop: 2, color: "var(--accent-9)" }}>{u.note}</div>
                      <div className="flex gap-8" style={{ marginTop: 4 }}>
                        <Badge color={getStatusColor(u.status)}>{getStatusLabel(u.status)}</Badge>
                        <span className="text-xs text-muted">{u.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Input */}
        {activeTab === "messages" && (
          <div style={{ padding: "12px 24px 16px", borderTop: "1px solid var(--accent-5)", background: "var(--accent-2)" }}>
            <div className="flex gap-8" style={{ alignItems: "flex-end" }}>
              <button className="icon-btn" style={{ width: 36, height: 36, border: "1px solid var(--accent-5)" }}><Paperclip size={16} /></button>
              <div style={{ flex: 1 }}>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Type a message... (Enter to send)" rows={1}
                  style={{ width: "100%", borderRadius: 10, padding: "10px 14px" }} />
              </div>
              <button onClick={sendMessage} style={{ width: 36, height: 36, borderRadius: 8, background: newMessage.trim() ? "var(--brand)" : "var(--accent-5)", color: newMessage.trim() ? "#fff" : "var(--accent-7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// CREATE / EDIT OBJECTIVE MODAL
// ============================================================================
export const ObjectiveFormModal = ({ objectives, currentUser, onSave, onClose, editObj = null }) => {
  const [title, setTitle] = useState(editObj?.title || "");
  const [description, setDescription] = useState(editObj?.description || "");
  const [priority, setPriority] = useState(editObj?.priority || "medium");
  const [dueDate, setDueDate] = useState(editObj?.dueDate ? new Date(editObj.dueDate).toISOString().split("T")[0] : "");
  const [ownerId, setOwnerId] = useState(editObj?.ownerId || currentUser.id);
  const [parentId, setParentId] = useState(editObj?.parentId || "");
  const [department, setDepartment] = useState(editObj?.department || currentUser.department);

  const isDelegation = ownerId !== currentUser.id;
  const availableOwners = currentUser.role === "executive" ? USERS : currentUser.role === "manager" ? [currentUser, ...USERS.filter(u => u.reportsTo === currentUser.id)] : [currentUser];

  const handleSave = () => {
    if (!title.trim()) return;
    const obj = {
      ...(editObj || {}),
      id: editObj?.id || generateId(),
      title: title.trim(),
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      ownerId,
      createdBy: editObj?.createdBy || currentUser.id,
      delegatedBy: isDelegation ? currentUser.id : editObj?.delegatedBy || null,
      parentId: parentId || null,
      department,
      status: editObj?.status || "not_started",
      progress: editObj?.progress || 0,
      acknowledged: isDelegation ? false : true,
      blockerFlag: editObj?.blockerFlag || false,
      blockerReason: editObj?.blockerReason || "",
      nextAction: editObj?.nextAction || "",
      type: "simple",
      startDate: editObj?.startDate || null,
      subtasks: editObj?.subtasks || [],
      messages: editObj?.messages || [],
      updates: editObj?.updates || [{ ts: new Date().toISOString(), status: "not_started", progress: 0, note: editObj ? "Objective updated" : "Objective created" }],
      files: editObj?.files || [],
    };
    onSave(obj);
  };

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ width: "min(95vw, 560px)", maxHeight: "85vh" }}>
        <div className="card-header">
          <Plus size={16} color="var(--brand)" />
          <span className="text-md font-bold">{editObj ? "Edit Objective" : "New Objective"}</span>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }} className="flex flex-col gap-16">
          <div>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" style={{ width: "100%" }} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Add details..." rows={3} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ width: "100%" }}>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Owner {isDelegation && <Badge color="#8B5CF6">Delegation</Badge>}</label>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={{ width: "100%" }}>
                {availableOwners.map(u => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} style={{ width: "100%" }}>
                {["Leadership", "Operations", "Automation", "Sales", "HR", "Field Operations", "Quality", "Shop", "Admin", "Safety"].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Parent Objective (optional)</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">None — top-level objective</option>
              {objectives.filter(o => o.id !== editObj?.id).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--accent-5)" }} className="flex justify-between">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!title.trim()}>
            {editObj ? "Save Changes" : isDelegation ? "Delegate Objective" : "Create Objective"}
          </button>
        </div>
      </div>
    </div>
  );
};
