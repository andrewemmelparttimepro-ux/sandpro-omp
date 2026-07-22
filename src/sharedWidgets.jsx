import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, AlertTriangle, MessageSquare, Users, Paperclip, CheckCircle2,
  HelpCircle, FileText, Download, Loader2, File, Mic, UserPlus, Layers,
} from 'lucide-react';
import {
  getUser,
  getProfiles,
  getStatusColor,
  getStatusLabel,
  getPriorityColor,
  formatDate,
  formatObjectiveTimestamp,
  isOverdue,
} from './data';
import {
  PROJECT_TYPES,
  PROJECT_STAGES,
  PROJECT_HEALTH,
  ASSESSMENT_ARTIFACTS,
  REQUIRED_SIGNATURE_ROLES,
  getProjectStageMeta,
  getProjectHealthMeta,
  buildProjectGateBlockers,
  canAdvanceProjectStage,
} from './okrFramework';
import { findMentionCandidates, getActiveMention, getMentionedUsers, insertMentionText } from './mentions';
import { Avatar, Badge } from './uiPrimitives';

export const ProgressBar = ({ value, color = "#ff7f02", height = 4 }) => (
  <div className="progress-track" style={{ height }}>
    <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
  </div>
);

// ============================================================================
// KPI CARD
// ============================================================================
export const KPICard = ({ icon: Icon, label, value, sub, color = "#ff7f02", onClick, breakdown = [], bucket = 'standard', active = false }) => (
  <div className={`card kpi-card kpi-card-${bucket} ${onClick ? 'card-hover cursor-pointer' : ''} ${active ? 'kpi-card-active' : ''}`} onClick={onClick} style={{ flex: 1, minWidth: 140 }} aria-pressed={onClick ? active : undefined}>
    <div style={{ padding: 16 }}>
      <div className="flex items-center gap-8" style={{ marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={14} color={color} />
        </div>
        <span className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      </div>
      <div className="text-2xl font-bold text-primary" style={{ lineHeight: 1.1 }}>{value}</div>
      {sub && <div className="text-xs text-muted" style={{ marginTop: 4 }}>{sub}</div>}
      {breakdown.length > 0 && (
        <div className="kpi-status-breakdown" aria-label={`${label} status breakdown`}>
          {breakdown.map(item => (
            <span key={item.status} className="kpi-status-chip" title={`${item.count} ${item.label}`}>
              <span className="kpi-status-dot" style={{ background: getStatusColor(item.status) }} />
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </span>
          ))}
        </div>
      )}
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
  const unreadCount = (obj.messages || []).filter(message => message.isUnread).length;
  const tagCount = obj.members?.length || 0;

  return (
    <div className="card card-hover cursor-pointer" onClick={onClick}
      style={{ borderColor: obj.blockerFlag ? "#EF444444" : overdue ? "#F59E0B44" : undefined }}>
      <div style={{ padding: 16 }}>
        {obj.blockerFlag && <div style={{ position: "absolute", top: 8, right: 8 }}><AlertTriangle size={14} color="#EF4444" /></div>}
        <div className="flex items-center gap-6" style={{ marginBottom: 10 }}>
          <Badge color={getStatusColor(obj.status)}>{getStatusLabel(obj.status)}</Badge>
          <Badge color={getPriorityColor(obj.priority)} outline>{obj.priority}</Badge>
          {unreadCount > 0 && <Badge color="var(--brand)">{unreadCount} unread</Badge>}
        </div>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-10)", margin: 0, lineHeight: 1.3, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {obj.title}
        </h3>
        <div className="objective-timestamp-line" style={{ marginTop: -6, marginBottom: 10 }}>{formatObjectiveTimestamp(obj)}</div>
        <ProgressBar value={obj.progress} color={getStatusColor(obj.status)} height={3} />
        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
          <div className="flex items-center gap-6">
            <Avatar user={owner} size={22} />
            <span className="text-xs text-muted">{owner.name.split(" ")[0]}</span>
          </div>
          <div className="flex items-center gap-8">
            {msgCount > 0 && <div className="flex items-center gap-4"><MessageSquare size={11} color={unreadCount > 0 ? "var(--brand)" : "var(--accent-7)"} /><span className={unreadCount > 0 ? "text-xs font-semibold text-brand" : "text-xs text-muted"}>{unreadCount > 0 ? `${unreadCount}/${msgCount}` : msgCount}</span></div>}
            {tagCount > 0 && <div className="flex items-center gap-4"><Users size={11} color="var(--brand)" /><span className="text-xs text-muted">{tagCount}</span></div>}
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
export const EmptyState = ({ icon: Icon, text, action }) => (
  <div className="empty-state">
    <Icon size={32} strokeWidth={1.5} />
    <p>{text}</p>
    {action}
  </div>
);

const helpStorage = {
  get: (key) => { try { return window.localStorage.getItem(key); } catch { return null; } },
  set: (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* noop */ } },
};

// ============================================================================
// FEATURE HELP — dismisses into a recallable question mark
// ============================================================================
export const FeatureHelp = ({ id, title, children, items = [], className = "", defaultOpen = true }) => {
  const storageKey = `sandpro-feature-help-${id}`;
  const [open, setOpen] = useState(() => {
    const saved = helpStorage.get(storageKey);
    if (saved === 'dismissed') return false;
    if (saved === 'open') return true;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) return false;
    return defaultOpen;
  });

  const dismiss = () => {
    helpStorage.set(storageKey, 'dismissed');
    setOpen(false);
  };

  const expand = () => {
    helpStorage.set(storageKey, 'open');
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        className={`feature-help-trigger ${className}`}
        onClick={expand}
        title={`Help: ${title}`}
        aria-label={`Open help for ${title}`}
      >
        <HelpCircle size={14} />
      </button>
    );
  }

  return (
    <div className={`feature-help ${className}`}>
      <div className="feature-help-icon"><HelpCircle size={16} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="feature-help-title">{title}</div>
        {children && <div className="feature-help-copy">{children}</div>}
        {items.length > 0 && (
          <ul className="feature-help-list">
            {items.map(item => <li key={item}>{item}</li>)}
          </ul>
        )}
      </div>
      <button type="button" className="feature-help-close" onClick={dismiss} title="Hide this tip">
        <X size={13} />
      </button>
    </div>
  );
};

const getPreviewKind = (file = {}) => {
  const safeFile = file || {};
  const type = safeFile.type || "";
  const mime = safeFile.mimeType || safeFile.mime_type || safeFile.file?.type || "";
  const name = safeFile.name || "";
  if (type === "image" || mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return "image";
  if (type === "pdf" || mime === "application/pdf" || /\.pdf$/i.test(name)) return "pdf";
  if (type === "markdown" || mime === "text/markdown" || mime === "text/x-markdown" || /\.(md|markdown)$/i.test(name)) return "markdown";
  if (type === "text" || mime.startsWith("text/") || /\.(txt|csv|log|json)$/i.test(name)) return "text";
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "audio" || mime.startsWith("audio/")) return "audio";
  if (type === "spreadsheet" || mime.includes("spreadsheet") || mime.includes("excel") || /\.csv$/i.test(name)) return "spreadsheet";
  if (type === "archive" || mime.includes("zip") || mime.includes("tar") || mime.includes("rar")) return "archive";
  return "file";
};

const canPreviewTextFile = (file) => ["markdown", "text"].includes(getPreviewKind(file));

export const FilePreviewModal = ({ file, onClose }) => {
  const [previewText, setPreviewText] = useState("");
  const [previewTextLoading, setPreviewTextLoading] = useState(false);
  const [objectUrl, setObjectUrl] = useState("");
  const previewKind = getPreviewKind(file);
  const previewUrl = file?.url || objectUrl;

  useEffect(() => {
    if (!file?.file || file?.url) return undefined;
    const url = URL.createObjectURL(file.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    let active = true;
    setPreviewText("");
    if (!file || !canPreviewTextFile(file) || !previewUrl) return undefined;
    setPreviewTextLoading(true);
    fetch(previewUrl)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => { if (active) setPreviewText(text); })
      .catch(() => { if (active) setPreviewText("Preview is not available for this file."); })
      .finally(() => { if (active) setPreviewTextLoading(false); });
    return () => { active = false; };
  }, [file, previewUrl]);

  if (!file) return null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ width: "min(92vw, 900px)", height: "min(86vh, 720px)" }}>
        <div className="card-header">
          <FileText size={16} color="var(--brand)" />
          <span className="text-md font-bold" style={{ flex: 1 }}>{file.name}</span>
          {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" download={file.name} className="btn btn-xs btn-secondary"><Download size={12} /> Download</a>}
          <button className="icon-btn" onClick={onClose} title="Close preview"><X size={16} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: "var(--accent-1)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          {previewKind === "image" && previewUrl ? (
            <img src={previewUrl} alt={file.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          ) : previewKind === "pdf" && previewUrl ? (
            <iframe src={previewUrl} title={file.name} style={{ width: "100%", height: "100%", border: 0, borderRadius: 8, background: "#fff" }} />
          ) : previewKind === "audio" && previewUrl ? (
            <div className="voice-preview-panel">
              <div className="voice-preview-icon"><Mic size={28} /></div>
              <div>
                <div className="text-lg font-bold text-primary">Voice note</div>
                <div className="text-sm text-muted">{file.name}</div>
              </div>
              <audio controls preload="metadata" src={previewUrl} />
            </div>
          ) : canPreviewTextFile(file) ? (
            <div style={{ width: "100%", height: "100%", overflow: "auto", borderRadius: 8, background: "var(--accent-2)", border: "1px solid var(--accent-5)", padding: 18 }}>
              {previewTextLoading ? <div className="empty-state"><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /><p>Loading preview...</p></div> :
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, color: "var(--accent-10)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.6 }}>{previewText}</pre>}
            </div>
          ) : (
            <div className="empty-state">
              <File size={32} />
              <p>Preview is not available for this file type.</p>
              {previewUrl && <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary"><Download size={14} /> Open File</a>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TagMentionControl = ({
  candidates = [],
  currentUserId,
  onTag,
  disabled = false,
  compact = false,
  addLabel = "Add tag",
  placeholder = "@name",
}) => {
  const [tagText, setTagText] = useState("");
  const [activeTagMention, setActiveTagMention] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pendingCursor, setPendingCursor] = useState(null);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const availableCandidates = candidates.filter(user => user?.id && user.id !== currentUserId);
  const query = activeTagMention?.query ?? (tagText.startsWith("@") ? tagText.slice(1).trim() : tagText.trim());
  const tagMentionCandidates = findMentionCandidates(availableCandidates, query, currentUserId).slice(0, 6);
  const showTagMenu = tagText.includes("@") && tagMentionCandidates.length > 0 && !selectedUser;

  useLayoutEffect(() => {
    if (pendingCursor === null) return;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(pendingCursor, pendingCursor);
    setPendingCursor(null);
  }, [tagText, pendingCursor]);

  const selectTagUser = (user) => {
    const active = activeTagMention || { start: 0, end: tagText.length };
    const nextText = tagText.includes("@")
      ? insertMentionText(tagText, active, user)
      : `@${user.name} `;
    setTagText(nextText);
    setSelectedUser(user);
    setActiveTagMention(null);
    setPendingCursor(nextText.length);
  };

  const resolveTagUser = () => {
    if (!tagText.trim().startsWith("@") || tagText.trim().length < 2) return null;
    if (selectedUser && availableCandidates.some(user => user.id === selectedUser.id)) return selectedUser;
    return getMentionedUsers(tagText, [], availableCandidates, currentUserId)[0]
      || tagMentionCandidates[0]
      || null;
  };

  const submitTag = async () => {
    const user = resolveTagUser();
    if (!user || !onTag || adding) return;
    setAdding(true);
    try {
      await onTag(user, "assignee");
      setTagText("");
      setSelectedUser(null);
      setActiveTagMention(null);
    } finally {
      setAdding(false);
    }
  };

  const updateMenuPosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const gap = 6;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const desiredHeight = Math.min(220, 44 + tagMentionCandidates.length * 42);
    const belowSpace = viewportHeight - rect.bottom - gap - 8;
    const aboveSpace = rect.top - gap - 8;
    const openAbove = belowSpace < Math.min(160, desiredHeight) && aboveSpace > belowSpace;
    const maxHeight = Math.max(120, Math.min(desiredHeight, openAbove ? aboveSpace : belowSpace));
    setMenuPosition({
      left: rect.left,
      top: openAbove ? Math.max(8, rect.top - gap - maxHeight) : rect.bottom + gap,
      width: rect.width,
      maxHeight,
    });
  }, [tagMentionCandidates.length]);

  useLayoutEffect(() => {
    if (!showTagMenu) {
      setMenuPosition(null);
      return undefined;
    }
    updateMenuPosition();
    const opts = { capture: true, passive: true };
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, opts);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, opts);
    };
  }, [showTagMenu, tagText, tagMentionCandidates.length, updateMenuPosition]);

  const handleTagInput = (event) => {
    const value = event.target.value;
    setTagText(value);
    setSelectedUser(null);
    setActiveTagMention(getActiveMention(value, event.target.selectionStart ?? value.length));
  };

  const canSubmit = Boolean(resolveTagUser()) && !disabled && !adding;

  return (
    <div className={`tag-mention-control ${compact ? "compact" : ""}`}>
      <div className="tag-mention-input-wrap">
        <input
          ref={inputRef}
          className="tag-mention-input"
          value={tagText}
          disabled={disabled || adding || availableCandidates.length === 0}
          placeholder={availableCandidates.length === 0 ? "All teammates tagged" : placeholder}
          onFocus={(event) => {
            if (tagText) setActiveTagMention(getActiveMention(tagText, event.target.selectionStart ?? tagText.length));
          }}
          onChange={handleTagInput}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === "Tab") && tagMentionCandidates.length > 0 && !selectedUser) {
              event.preventDefault();
              selectTagUser(tagMentionCandidates[0]);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              submitTag();
            }
            if (event.key === "Escape") setActiveTagMention(null);
          }}
          aria-label="Tag teammate by typing @name"
        />
      </div>
      {showTagMenu && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="mention-menu tag-mention-menu tag-mention-menu-portal"
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
        >
          {tagMentionCandidates.map(user => (
            <button key={user.id} type="button" className="mention-option" onMouseDown={(e) => { e.preventDefault(); selectTagUser(user); }}>
              <Avatar user={user} size={24} />
              <span style={{ minWidth: 0 }}>
                <span className="mention-name">{user.name}</span>
                <span className="mention-title">{user.title}</span>
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
      <button className={`btn ${compact ? "btn-xs btn-secondary" : "btn-sm btn-primary"}`} onClick={submitTag} disabled={!canSubmit}>
        {adding ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <UserPlus size={12} />}
        {adding ? "Adding..." : addLabel}
      </button>
    </div>
  );
};

// ============================================================================
// SUPER CARD MODAL — Full objective detail
// ============================================================================
const ProjectArtifactRow = ({ artifact, onUpdate, disabled }) => {
  const [summary, setSummary] = useState(artifact.summary || "");
  useEffect(() => setSummary(artifact.summary || ""), [artifact.summary, artifact.id]);
  const isComplete = ["complete", "waived"].includes(artifact.status);
  return (
    <div className={`project-artifact-row ${isComplete ? "complete" : ""}`}>
      <div className="project-artifact-main">
        <div className="flex items-center gap-6">
          {isComplete ? <CheckCircle2 size={14} color="var(--success)" /> : <AlertTriangle size={14} color="var(--warning)" />}
          <strong>{artifact.title}</strong>
        </div>
        <span>{ASSESSMENT_ARTIFACTS.find(item => item.key === artifact.artifactKey)?.ownerLens || "Assessment artifact"}</span>
      </div>
      <select
        value={artifact.status || "missing"}
        disabled={disabled}
        onChange={event => onUpdate?.(artifact, { status: event.target.value })}
      >
        <option value="missing">Missing</option>
        <option value="draft">Draft</option>
        <option value="complete">Complete</option>
        <option value="waived">Waived</option>
      </select>
      <div className="project-artifact-summary">
        <textarea value={summary} onChange={event => setSummary(event.target.value)} rows={2} placeholder="Assessment notes, link, or document summary" />
        <button
          type="button"
          className="btn btn-xs btn-secondary"
          disabled={disabled || summary === (artifact.summary || "")}
          onClick={() => onUpdate?.(artifact, { summary })}
        >
          Save note
        </button>
      </div>
    </div>
  );
};

const ProjectAssessmentPanel = ({
  objective,
  objectives,
  projects,
  currentUser,
  createOkrProject,
  updateOkrProject,
  updateProjectArtifact,
  captureProjectSignature,
  uploadProjectAttachment,
  deleteProjectAttachment,
  addToast,
}) => {
  const keyResults = objectives.filter(item => item.okrLevel === "key_result" || item.id === objective.id);
  const defaultLinkedKr = objective.okrLevel === "key_result" ? objective.id : (keyResults.find(item => item.parentId === objective.id)?.id || "");
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    projectType: "ops",
    linkedKrId: defaultLinkedKr,
    runTheBusiness: objective.okrLevel === "run_the_business",
    sponsorId: currentUser.id,
    leadId: currentUser.id,
    stage: "idea",
    health: "green",
    startDate: "",
    targetDate: "",
    nextMilestone: "",
    nextMilestoneDueDate: "",
    budgetEstimate: "",
  });
  const [creatingProject, setCreatingProject] = useState(false);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [attachmentPurpose, setAttachmentPurpose] = useState("evidence");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setProjectDraft(draft => ({
      ...draft,
      linkedKrId: draft.linkedKrId || defaultLinkedKr,
      runTheBusiness: draft.runTheBusiness || objective.okrLevel === "run_the_business",
    }));
  }, [defaultLinkedKr, objective.okrLevel]);

  const updateDraft = (key, value) => setProjectDraft(draft => ({ ...draft, [key]: value }));
  const canCreateProject = projectDraft.name.trim() && (projectDraft.runTheBusiness || projectDraft.linkedKrId);

  const createProject = async () => {
    if (!createOkrProject || !canCreateProject || creatingProject) return;
    setCreatingProject(true);
    try {
      await createOkrProject({
        ...projectDraft,
        name: projectDraft.name.trim(),
        linkedObjectiveIds: projectDraft.runTheBusiness ? [] : [projectDraft.linkedKrId],
        createdBy: currentUser.id,
      });
      setProjectDraft(draft => ({ ...draft, name: "", description: "", nextMilestone: "", budgetEstimate: "" }));
      addToast?.({ type: "success", message: "Project assessment shell created" });
    } catch (error) {
      addToast?.({ type: "error", message: error.message || "Could not create project" });
    } finally {
      setCreatingProject(false);
    }
  };

  const updateProjectStage = async (project, stage) => {
    if (!updateOkrProject) return;
    const advancement = canAdvanceProjectStage(project, stage);
    if (!advancement.ok) {
      addToast?.({ type: "error", message: `Assessment blockers remain: ${advancement.blockers[0]}` });
      return;
    }
    await updateOkrProject(project.id, { stage, userId: currentUser.id, auditNote: `Stage changed to ${getProjectStageMeta(stage).label}` });
    addToast?.({ type: "success", message: "Project stage updated" });
  };

  const updateArtifact = async (artifact, changes) => {
    if (!updateProjectArtifact) return;
    await updateProjectArtifact(artifact.id, {
      ...changes,
      userId: currentUser.id,
      completedBy: ["complete", "waived"].includes(changes.status) ? currentUser.id : undefined,
    });
    addToast?.({ type: "success", message: "Assessment artifact updated" });
  };

  const addSignature = async (project, role) => {
    if (!captureProjectSignature) return;
    await captureProjectSignature(project.id, {
      role,
      signedBy: currentUser.id,
      signedByName: currentUser.name,
      createdBy: currentUser.id,
      note: "Signed from OKR project assessment gate.",
    });
    addToast?.({ type: "success", message: `${REQUIRED_SIGNATURE_ROLES.find(item => item.role === role)?.label || role} signoff captured` });
  };

  const openAttachmentPicker = (project, purpose = "evidence") => {
    setUploadTarget(project);
    setAttachmentPurpose(purpose);
    fileInputRef.current?.click();
  };

  const uploadFiles = async (files) => {
    if (!uploadTarget || !uploadProjectAttachment) return;
    const selected = Array.from(files || []).filter(file => file?.name);
    if (!selected.length) return;
    try {
      for (const file of selected) {
        await uploadProjectAttachment(uploadTarget.id, file, currentUser.id, attachmentPurpose);
      }
      addToast?.({ type: "success", message: `${selected.length} project file${selected.length === 1 ? "" : "s"} uploaded` });
    } catch (error) {
      addToast?.({ type: "error", message: error.message || "Could not upload project files" });
    } finally {
      setUploadTarget(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="project-assessment-panel">
      <input ref={fileInputRef} type="file" multiple hidden onChange={event => uploadFiles(event.target.files)} />
      <div className="project-create-card">
        <div className="project-section-heading">
          <div>
            <strong>Create linked project assessment</strong>
            <span>{'Idea -> Assessment -> Approved -> Active -> Done/Killed'}</span>
          </div>
          <Badge color="var(--brand)">v1 gates</Badge>
        </div>
        <div className="project-create-grid">
          <label><span className="required-label">Project name</span><input value={projectDraft.name} onChange={event => updateDraft("name", event.target.value)} placeholder="Assessment or project title" /></label>
          <label><span className="required-label">Project type</span><select value={projectDraft.projectType} onChange={event => updateDraft("projectType", event.target.value)}>{PROJECT_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
          <label><span className="required-label">Sponsor</span><select value={projectDraft.sponsorId} onChange={event => updateDraft("sponsorId", event.target.value)}>{getProfiles().map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label><span className="required-label">Lead</span><select value={projectDraft.leadId} onChange={event => updateDraft("leadId", event.target.value)}>{getProfiles().map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label><span className="required-label">Linked KR</span><select value={projectDraft.linkedKrId} disabled={projectDraft.runTheBusiness} onChange={event => updateDraft("linkedKrId", event.target.value)}><option value="">Choose Key Result</option>{keyResults.map(kr => <option key={kr.id} value={kr.id}>{kr.title}</option>)}</select></label>
          <label><span>Stage</span><select value={projectDraft.stage} onChange={event => updateDraft("stage", event.target.value)}>{PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}</select></label>
          <label><span>Health</span><select value={projectDraft.health} onChange={event => updateDraft("health", event.target.value)}>{PROJECT_HEALTH.map(health => <option key={health.id} value={health.id}>{health.label}</option>)}</select></label>
          <label><span>Budget estimate</span><input type="number" value={projectDraft.budgetEstimate} onChange={event => updateDraft("budgetEstimate", event.target.value)} placeholder="0" /></label>
          <label><span>Target date</span><input type="date" value={projectDraft.targetDate} onChange={event => updateDraft("targetDate", event.target.value)} /></label>
          <label><span className="required-label">Next milestone</span><input value={projectDraft.nextMilestone} onChange={event => updateDraft("nextMilestone", event.target.value)} placeholder="Next decision or deliverable" /></label>
        </div>
        <label className="project-inline-check"><input type="checkbox" checked={projectDraft.runTheBusiness} onChange={event => updateDraft("runTheBusiness", event.target.checked)} /> Run-the-business exception; KR link not required</label>
        <textarea value={projectDraft.description} onChange={event => updateDraft("description", event.target.value)} rows={2} placeholder="Assessment context, decision needed, or expected impact" />
        <button type="button" className="btn btn-primary btn-sm" disabled={!canCreateProject || creatingProject} onClick={createProject}>
          {creatingProject ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Create project shell
        </button>
      </div>

      {projects.length === 0 ? <EmptyState icon={Layers} text="No linked project assessments yet." /> : projects.map(project => {
        const stageMeta = getProjectStageMeta(project.stage);
        const healthMeta = getProjectHealthMeta(project.health);
        const blockers = buildProjectGateBlockers(project);
        return (
          <div key={project.id} className="project-gate-card">
            <div className="project-gate-header">
              <div>
                <strong>{project.name || project.title}</strong>
                <span>{PROJECT_TYPES.find(type => type.id === project.projectType)?.label || "Project"} · {project.nextMilestone || "No next milestone yet"}</span>
              </div>
              <div className="project-gate-badges">
                <Badge color={stageMeta.id === "active" ? "var(--brand)" : "#64748B"}>{stageMeta.label}</Badge>
                <Badge color={healthMeta.color}>{healthMeta.label}</Badge>
              </div>
            </div>
            <div className="project-stage-row">
              <select value={project.stage || "idea"} onChange={event => updateProjectStage(project, event.target.value)}>
                {PROJECT_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
              </select>
              <select value={project.health || "green"} onChange={event => updateOkrProject?.(project.id, { health: event.target.value, userId: currentUser.id, auditNote: "Health updated" })}>
                {PROJECT_HEALTH.map(health => <option key={health.id} value={health.id}>{health.label}</option>)}
              </select>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => openAttachmentPicker(project, "evidence")}><Upload size={12} /> Add files</button>
              <button type="button" className="btn btn-xs btn-secondary" onClick={() => openAttachmentPicker(project, "approval")}><Paperclip size={12} /> Approval doc</button>
            </div>

            {blockers.length > 0 ? (
              <div className="project-blockers">
                <strong>Gate blockers</strong>
                {blockers.map(blocker => <span key={blocker}>- {blocker}</span>)}
              </div>
            ) : (
              <div className="project-clearance"><CheckCircle2 size={14} /> Assessment gates are clear for approval/activation.</div>
            )}

            <div className="project-subsection-title">Assessment artifacts</div>
            {(project.artifacts || []).map(artifact => (
              <ProjectArtifactRow key={artifact.id} artifact={artifact} onUpdate={updateArtifact} disabled={!updateProjectArtifact} />
            ))}

            <div className="project-subsection-title">Required signoffs</div>
            <div className="project-signoff-grid">
              {REQUIRED_SIGNATURE_ROLES.map(role => {
                const signature = (project.signatures || []).find(item => item.role === role.role);
                return (
                  <div key={role.role} className={`project-signoff ${signature ? "signed" : ""}`}>
                    <strong>{role.label}</strong>
                    <span>{signature ? `${signature.signedByName || getUser(signature.signedBy)?.name || "Signed"} · ${formatDate(signature.signedAt)}` : "Required before approval"}</span>
                    {!signature && <button type="button" className="btn btn-xs btn-secondary" onClick={() => addSignature(project, role.role)}><Check size={12} /> Sign</button>}
                  </div>
                );
              })}
            </div>

            <div className="project-subsection-title">Files and audit</div>
            <div className="project-file-list">
              {(project.attachments || []).length === 0 ? <span className="text-xs text-muted">No project files uploaded yet.</span> : project.attachments.map(file => (
                <div key={file.id} className="project-file-pill">
                  <a href={file.url || "#"} target="_blank" rel="noreferrer"><Paperclip size={12} /> {file.name}</a>
                  <span>{file.purpose}</span>
                  {deleteProjectAttachment && <button type="button" className="icon-btn" onClick={() => deleteProjectAttachment(file)} title="Delete project file"><Trash2 size={12} /></button>}
                </div>
              ))}
            </div>
            <div className="project-audit-list">
              {(project.auditEvents || []).slice(-4).reverse().map(event => (
                <div key={event.id}><Clock size={12} /><span>{event.note || event.eventType}</span><small>{formatDate(event.createdAt)}</small></div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
