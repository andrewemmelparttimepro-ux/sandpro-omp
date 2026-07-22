import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Component } from 'react';
import {
  X, Send, Paperclip, Check, AlertTriangle, Clock, MessageSquare,
  Activity, Zap, Calendar, ChevronDown, Download, Upload, FileText,
  Image, File, Film, Music, Archive, TrendingUp, Layers, ArrowLeft,
  Target, CheckCircle2, Building2, Plus, Edit3, Trash2, Flag, Loader2, Mic,
  Sparkles, AlertCircle, Users, UserPlus, HelpCircle, Bell, Home, Smartphone, SmilePlus, Languages,
  ThumbsUp, Wrench, Handshake
} from 'lucide-react';
import { getUser, getProfiles, getStatusColor, getStatusLabel, getStatusBg, getPriorityColor, formatDate, formatObjectiveTimestamp, timeAgo, isOverdue, STATUS_CONFIG, generateId, DEFAULT_DEPARTMENT } from './data';
import { findMentionCandidates, getActiveMention, getMentionedUsers, insertMentionText } from './mentions';
import { Avatar, Badge } from './uiPrimitives';
import {
  ProgressBar as SharedProgressBar,
  KPICard as SharedKPICard,
  ObjectiveCard as SharedObjectiveCard,
  ToastContainer as SharedToastContainer,
  EmptyState as SharedEmptyState,
  FeatureHelp as SharedFeatureHelp,
  FilePreviewModal as SharedFilePreviewModal,
  TagMentionControl as SharedTagMentionControl,
} from './sharedWidgets';
import {
  OKR_LEVELS,
  OKR_LEVEL_LABELS,
  PROJECT_TYPES,
  PROJECT_STAGES,
  PROJECT_HEALTH,
  ASSESSMENT_ARTIFACTS,
  REQUIRED_SIGNATURE_ROLES,
  OKR_ASSUMED_FALLBACK_LEVEL,
  getAssumedOkrLevel,
  getCurrentOkrPeriod,
  getOkrLevelMeta,
  getObjectiveOkrLevelMeta,
  getProjectStageMeta,
  getProjectHealthMeta,
  isKeyResultStale,
  buildProjectGateBlockers,
  canAdvanceProjectStage,
} from './okrFramework';

const readDraft = (key, fallback = "") => {
  try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

const writeDraft = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // Drafts are best effort and should never block work.
  }
};

export { Avatar, Badge } from './uiPrimitives';

// createPortal bridge lives in sharedWidgets.
export const ProgressBar = (props) => <SharedProgressBar {...props} />;
// kpi-card-${bucket}
// kpi-status-dot
// {item.label}
// <strong>{item.count}</strong>
export const KPICard = (props) => <SharedKPICard {...props} />;
// kpi-status-breakdown
export const ObjectiveCard = (props) => <SharedObjectiveCard {...props} />;
export const ToastContainer = (props) => <SharedToastContainer {...props} />;
export const EmptyState = (props) => <SharedEmptyState {...props} />;
// defaultOpen = true
// sandpro-feature-help-
export const FeatureHelp = (props) => <SharedFeatureHelp {...props} />;
// previewKind === "audio"
export const FilePreviewModal = (props) => <SharedFilePreviewModal {...props} />;
// tag-mention-menu-portal
// placeholder="@name to tag"
// placeholder="@name to assign teammate"
// aria-label="Tag teammate by typing @name"
export const TagMentionControl = (props) => <SharedTagMentionControl {...props} />;

const MESSAGE_REACTIONS = [
  { id: 'thumbs_up', icon: ThumbsUp, label: 'Thumbs up' },
  { id: 'heard', icon: Bell, label: 'Heard' },
  { id: 'on_it', icon: Wrench, label: "I'm on it" },
  { id: 'thanks', icon: Handshake, label: 'Thanks' },
  { id: 'done', icon: CheckCircle2, label: 'Done' },
];

const MessageReactionSymbol = ({ option, size = 13 }) => {
  const Icon = option?.icon;
  if (!Icon) return null;
  return (
    <span className="executive-symbol message-reaction-symbol" aria-hidden="true">
      <Icon size={size} />
    </span>
  );
};

const MAX_VOICE_NOTE_SECONDS = 5 * 60;

const isAudioAttachment = (attachment = {}) => (
  attachment.type === "audio"
  || attachment.mimeType?.startsWith?.("audio/")
  || attachment.mime_type?.startsWith?.("audio/")
  || attachment.file?.type?.startsWith?.("audio/")
  || /^voice-note-/i.test(attachment.name || "")
);

const formatDuration = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const formatFileSize = (bytes = 0) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MessageReactions = ({ message, currentUser, onSetReaction, onRemoveReaction }) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactions = message.reactions || [];
  const activeReaction = reactions.find(reaction => reaction.userId === currentUser?.id)?.reaction || null;
  const activeReactionOption = MESSAGE_REACTIONS.find(option => option.id === activeReaction);
  const grouped = MESSAGE_REACTIONS.map(option => {
    const matching = reactions.filter(reaction => reaction.reaction === option.id);
    return {
      ...option,
      count: matching.length,
      users: matching.map(reaction => getUser(reaction.userId)?.name).filter(Boolean),
      active: activeReaction === option.id,
    };
  }).filter(option => option.count > 0);

  const handleReaction = (reactionId) => {
    if (!currentUser?.id || !message?.id) return;
    setPickerOpen(false);
    if (activeReaction === reactionId) {
      onRemoveReaction?.(message);
      return;
    }
    onSetReaction?.(message, reactionId);
  };

  return (
    <div className="message-reactions" aria-label="Message reactions">
      <div className="message-reaction-picker">
        <button
          type="button"
          className={`message-reaction-trigger ${activeReaction ? 'is-active' : ''}`}
          aria-label="React to message"
          title="React to message"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(open => !open)}
        >
          <SmilePlus size={13} />
          {activeReactionOption ? <MessageReactionSymbol option={activeReactionOption} size={12} /> : <span>React</span>}
        </button>
        <div className={`message-reaction-menu ${pickerOpen ? 'is-open' : ''}`} role="menu" aria-label="Choose a reaction">
          {MESSAGE_REACTIONS.map(option => (
            <button
              key={option.id}
              type="button"
              className={`message-reaction-option ${activeReaction === option.id ? 'is-active' : ''}`}
              onClick={() => handleReaction(option.id)}
              role="menuitem"
              aria-label={option.label}
              title={option.label}
            >
              <MessageReactionSymbol option={option} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      {grouped.length > 0 && (
        <div className="message-reaction-summary">
          {grouped.map(option => (
            <button
              key={option.id}
              type="button"
              className={`message-reaction-chip ${option.active ? 'is-active' : ''}`}
              onClick={() => handleReaction(option.id)}
              title={option.users.join(', ')}
              aria-label={`${option.label}: ${option.count}`}
            >
              <MessageReactionSymbol option={option} size={12} />
              <span>{option.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const isLikelySpanishText = (text = "") => {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const words = normalized.match(/[a-zñ]+/g) || [];
  if (words.length < 4) return false;
  const spanishWords = new Set([
    'a', 'al', 'algo', 'aunque', 'casilla', 'cerrar', 'como', 'con', 'cuando', 'de', 'del',
    'el', 'en', 'es', 'esta', 'este', 'esto', 'gracias', 'hasta', 'la', 'las', 'lo', 'los',
    'mantiene', 'mensaje', 'mi', 'para', 'pasar', 'pesar', 'por', 'prueba', 'que', 'se',
    'si', 'sin', 'una', 'uno', 'ver', 'ventana', 'y', 'yo',
  ]);
  const hits = words.filter(word => spanishWords.has(word)).length;
  const hasSpanishOnlyPunctuation = /[¿¡]/.test(text);
  const hasSpanishAccent = /[áéíóúüñÁÉÍÓÚÜÑ]/.test(text);
  return hits >= 3 || (hits >= 2 && (hasSpanishAccent || hasSpanishOnlyPunctuation));
};

const MessageTranslation = ({ message, translationState, onTranslate }) => {
  if (!isLikelySpanishText(message.text)) return null;
  const state = translationState || {};
  const isOpen = Boolean(state.translation);
  return (
    <div className="message-translation">
      <button
        type="button"
        className="message-translate-button"
        onClick={() => onTranslate?.(message)}
        disabled={state.loading}
        aria-label="Translate Spanish message to English"
        title="Translate Spanish message to English"
      >
        <Languages size={13} />
        <span>{state.loading ? 'Translating...' : isOpen ? 'Translated' : 'Translate'}</span>
      </button>
      {state.error && <div className="message-translation-error">{state.error}</div>}
      {isOpen && (
        <div className="message-translation-panel">
          <div className="message-translation-label">English translation</div>
          <p>{state.translation}</p>
        </div>
      )}
    </div>
  );
};

const VoiceNoteAttachment = ({ attachment, onPreview }) => {
  const [objectUrl, setObjectUrl] = useState("");
  const audioUrl = attachment.url || objectUrl;

  useEffect(() => {
    if (!attachment.file || attachment.url) return undefined;
    const url = URL.createObjectURL(attachment.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment.file, attachment.url]);

  return (
    <div className="voice-note-card">
      <div className="voice-note-header">
        <span className="voice-note-icon"><Mic size={14} /></span>
        <span className="voice-note-title">Voice note</span>
        {attachment.size ? <span className="voice-note-size">{formatFileSize(attachment.size)}</span> : null}
      </div>
      {audioUrl ? (
        <audio controls preload="metadata" src={audioUrl} aria-label={attachment.name || "Voice note"} />
      ) : (
        <div className="voice-note-unavailable">Audio is still processing.</div>
      )}
      {onPreview && (
        <button type="button" className="voice-note-open" onClick={() => onPreview(attachment)}>
          Open attachment
        </button>
      )}
    </div>
  );
};

const PendingVoiceNotePreview = ({ attachment, onRemove, onSend }) => {
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!attachment.file) return undefined;
    const url = URL.createObjectURL(attachment.file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment.file]);

  return (
    <div className="pending-voice-note">
      <div className="pending-voice-note-head">
        <span className="voice-note-icon"><Mic size={14} /></span>
        <div>
          <strong>Voice note ready</strong>
          <span>Preview it, remove it, or send it to the message thread.</span>
        </div>
      </div>
      {objectUrl ? (
        <audio controls preload="metadata" src={objectUrl} aria-label="Preview voice note before sending" />
      ) : (
        <div className="voice-note-unavailable">Audio preview is preparing.</div>
      )}
      <div className="pending-voice-note-actions">
        <button type="button" className="btn btn-xs btn-secondary" onClick={onRemove}>
          <X size={12} /> Remove
        </button>
        <button type="button" className="btn btn-xs btn-primary" onClick={onSend}>
          <Send size={12} /> Send voice note
        </button>
      </div>
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

export const SuperCard = ({ obj, objectives, okrProjects = [], initialTab = "messages", onTabChange, onClose, onUpdate, onDelete, currentUser, addToast, onEdit, uploadObjectiveFile, deleteObjectiveFile, addSubtask, updateSubtask, deleteSubtask, addMetricCheckin, addObjectiveMember, removeObjectiveMember, addWorkflowStep, updateWorkflowStep, createOkrProject, updateOkrProject, updateProjectArtifact, captureProjectSignature, uploadProjectAttachment, deleteProjectAttachment, onMarkMessagesRead, onUpdateMessage, onSetMessageReaction, onRemoveMessageReaction, onTranslateMessage, runObjectiveStarter, aiFeaturesEnabled = false, createNotification }) => {
  const [activeTab, setActiveTab] = useState(initialTab || "messages");
  const messageDraftKey = `sandpro-message-draft-${currentUser.id}-${obj.id}`;
  const [newMessage, setNewMessage] = useState(() => readDraft(messageDraftKey, ""));
  const [editingProgress, setEditingProgress] = useState(false);
  const [progressValue, setProgressValue] = useState(obj.progress);
  const [editingNextAction, setEditingNextAction] = useState(false);
  const [nextActionValue, setNextActionValue] = useState(obj.nextAction || "");
  const [blockerDraft, setBlockerDraft] = useState("");
  const [showBlockerModal, setShowBlockerModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState({ title: "", ownerId: currentUser.id, dueDate: "", weight: 1, isMilestone: false });
  const [editingSubtaskId, setEditingSubtaskId] = useState(null);
  const [subtaskEditDraft, setSubtaskEditDraft] = useState(null);
  const [subtaskDeleteTarget, setSubtaskDeleteTarget] = useState(null);
  const [metricDraft, setMetricDraft] = useState({ date: new Date().toISOString().slice(0, 10), value: obj.currentMetric ?? "", note: "" });
  const [workflowDraft, setWorkflowDraft] = useState({ title: "", ownerId: currentUser.id, dueDate: "", description: "" });
  const [memberDraft, setMemberDraft] = useState({ userId: "", role: "assignee" });
  const [showTagPicker, setShowTagPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const messageFileRef = useRef(null);
  const messageTextRef = useRef(null);
  const [localObj, setLocalObj] = useState(obj);
  const [messageAttachments, setMessageAttachments] = useState([]);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [messageEditDraft, setMessageEditDraft] = useState("");
  const [messageTranslations, setMessageTranslations] = useState({});
  const [activeMention, setActiveMention] = useState(null);
  const [selectedMentionIds, setSelectedMentionIds] = useState([]);
  const [pendingMentionCursor, setPendingMentionCursor] = useState(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const autoReadKeyRef = useRef("");
  const [voiceRecorderState, setVoiceRecorderState] = useState({ active: false, seconds: 0 });
  const voiceRecorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceMimeTypeRef = useRef("audio/webm");
  const voiceTimerRef = useRef(null);
  const voiceDiscardRef = useRef(false);

  useEffect(() => { setLocalObj(obj); setProgressValue(obj.progress); setNextActionValue(obj.nextAction || ""); setMetricDraft(d => ({ ...d, value: obj.currentMetric ?? "" })); }, [obj]);
  useEffect(() => { if (initialTab) setActiveTab(initialTab); }, [initialTab]);
  useEffect(() => { if (messagesEndRef.current && activeTab === "messages") messagesEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [localObj.messages, activeTab]);
  useEffect(() => { writeDraft(messageDraftKey, newMessage); }, [messageDraftKey, newMessage]);
  useEffect(() => () => {
    if (voiceTimerRef.current) window.clearInterval(voiceTimerRef.current);
    voiceRecorderRef.current?.stream?.getTracks?.().forEach(track => track.stop());
    voiceStreamRef.current?.getTracks?.().forEach(track => track.stop());
  }, []);
  useLayoutEffect(() => {
    if (pendingMentionCursor === null) return;
    messageTextRef.current?.focus();
    messageTextRef.current?.setSelectionRange(pendingMentionCursor, pendingMentionCursor);
    setPendingMentionCursor(null);
  }, [newMessage, pendingMentionCursor]);

  const agentFeatureEnabled = aiFeaturesEnabled && import.meta.env.VITE_AGENT_FEATURE_ENABLED !== "false";
  const agentRuns = [...(localObj.agentRuns || [])].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const latestAgentRun = agentRuns[agentRuns.length - 1] || null;
  const completedAgentRun = [...agentRuns].reverse().find(run => run.status === "completed");
  const latestFailedAgentRun = [...agentRuns].reverse().find(run => run.status === "failed");
  const starterFile = completedAgentRun?.fileId ? (localObj.files || []).find(file => file.id === completedAgentRun.fileId) : null;
  const linkedProjects = useMemo(() => okrProjects.filter(project => {
    const ids = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
    return ids.includes(localObj.id) || (localObj.linkedProjects || []).some(linked => linked.id === project.id);
  }), [okrProjects, localObj.id, localObj.linkedProjects]);
  const okrMeta = getObjectiveOkrLevelMeta(localObj);
  const confidence = Math.max(0, Math.min(100, Number(localObj.classificationConfidence ?? 0)));
  const lowConfidence = confidence > 0 && confidence < 75;
  const staleKr = isKeyResultStale(localObj);
  const childObjectives = objectives.filter(item => item.parentId === localObj.id);
  const parentObjective = localObj.parentId ? objectives.find(item => item.id === localObj.parentId) : null;

  const owner = getUser(localObj.ownerId);
  const creator = getUser(localObj.createdBy);
  const delegator = localObj.delegatedBy ? getUser(localObj.delegatedBy) : null;
  const taggedMembers = (localObj.members || []).map(m => ({ ...m, user: getUser(m.userId) })).filter(m => m.user?.name);
  const tagCandidates = getProfiles().filter(u => u.id !== localObj.ownerId && !taggedMembers.some(m => m.userId === u.id));
  const mentionCandidates = findMentionCandidates(
    getProfiles(),
    activeMention?.query || "",
    currentUser.id,
    [localObj.ownerId, ...(localObj.members || []).map(member => member.userId)]
  );
  const overdue = isOverdue(localObj);
  const workflowSteps = [...(localObj.workflowSteps || [])].sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
  const workflowDone = workflowSteps.filter(step => step.status === "done" || step.status === "skipped").length;
  const workflowTotal = workflowSteps.length;
  const workflowPercent = workflowTotal ? Math.round((workflowDone / workflowTotal) * 100) : 0;
  const messageCount = localObj.messages?.length || 0;
  const unreadMessages = (localObj.messages || []).filter(message => message.isUnread).length;
  const firstUnreadMessageId = (localObj.messages || []).find(message => message.isUnread)?.id || null;
  const currentUserEmail = (currentUser.email || "").toLowerCase();
  const canDeleteObjective = Boolean(onDelete && (
    localObj.createdBy === currentUser.id
    || currentUser.role === "executive"
    || ["jfeil@sandpro.com", "tdibben@sandpro.com", "andrew@ndai.pro"].includes(currentUserEmail)
  ));
  const currentWorkflowStep = workflowSteps.find(step => step.status === "current")
    || workflowSteps.find(step => !["done", "skipped"].includes(step.status))
    || workflowSteps[workflowSteps.length - 1];
  const workflowStatusLabel = (status) => ({
    todo: "To do",
    current: "Current",
    done: "Done",
    blocked: "Blocked",
    skipped: "Skipped",
  }[status] || "To do");
  const workflowStatusColor = (status) => ({
    todo: "#64748B",
    current: "#ff7f02",
    done: "#10B981",
    blocked: "#EF4444",
    skipped: "#94A3B8",
  }[status] || "#64748B");
  const workflowStepIcon = (status) => status === "done" ? CheckCircle2 : status === "blocked" ? AlertTriangle : status === "current" ? Clock : Layers;
  const metricPercent = Number.isFinite(((Number(localObj.currentMetric) - Number(localObj.baselineMetric)) / (Number(localObj.targetMetric) - Number(localObj.baselineMetric))) * 100)
    ? Math.max(0, Math.min(100, ((Number(localObj.currentMetric) - Number(localObj.baselineMetric)) / (Number(localObj.targetMetric) - Number(localObj.baselineMetric))) * 100))
    : 0;
  const getMessageFileType = (mime = "") => {
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf") return "pdf";
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.includes("spreadsheet") || mime.includes("csv") || mime.includes("excel")) return "spreadsheet";
    if (mime.includes("zip") || mime.includes("tar") || mime.includes("rar")) return "archive";
    return "file";
  };
  const getVoiceNoteExtension = (mime = "") => {
    if (mime.includes("mp4")) return "m4a";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mpeg")) return "mp3";
    if (mime.includes("wav")) return "wav";
    return "webm";
  };
  const stopVoiceRecorderResources = () => {
    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    voiceRecorderRef.current = null;
    voiceStreamRef.current?.getTracks?.().forEach(track => track.stop());
    voiceStreamRef.current = null;
    voiceChunksRef.current = [];
    setVoiceRecorderState({ active: false, seconds: 0 });
  };
  const handleVoiceRecorderStop = useCallback(() => {
    const mimeType = voiceMimeTypeRef.current || "audio/webm";
    const chunks = voiceChunksRef.current;
    const shouldDiscard = voiceDiscardRef.current;
    voiceDiscardRef.current = false;
    try {
      if (!shouldDiscard && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        const extension = getVoiceNoteExtension(mimeType);
        const fileName = `voice-note-${Date.now()}.${extension}`;
        const file = typeof File === "function"
          ? new File([blob], fileName, {
            type: mimeType,
            lastModified: Date.now(),
          })
          : Object.assign(blob, {
            name: fileName,
            lastModified: Date.now(),
          });
        setMessageAttachments(prev => [...prev, {
          name: file.name,
          size: file.size,
          type: getMessageFileType(file.type),
          file,
        }]);
        addToast?.({ type: 'success', message: 'Voice note ready to preview' });
      } else if (!shouldDiscard) {
        addToast?.({ type: 'error', message: 'No audio was captured. Please try recording again.' });
      }
    } catch (error) {
      addToast?.({ type: 'error', message: error?.message || 'Could not prepare the voice note.' });
    } finally {
      stopVoiceRecorderResources();
    }
  }, [addToast]);
  const stopVoiceRecording = useCallback(() => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "inactive") {
      handleVoiceRecorderStop();
      return;
    }
    recorder.stop();
    window.setTimeout(() => {
      if (voiceRecorderRef.current === recorder) handleVoiceRecorderStop();
    }, 250);
  }, [handleVoiceRecorderStop]);
  const cancelVoiceRecording = useCallback(() => {
    voiceDiscardRef.current = true;
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopVoiceRecorderResources();
    }
    addToast?.({ type: 'info', message: 'Voice note discarded' });
  }, [addToast]);
  const startVoiceRecording = useCallback(async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      addToast?.({ type: 'error', message: 'Voice notes are not supported in this browser.' });
      return;
    }
    if (typeof window.MediaRecorder === "undefined") {
      addToast?.({ type: 'error', message: 'This browser cannot record audio yet.' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ].find(type => window.MediaRecorder.isTypeSupported?.(type)) || "";
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      voiceRecorderRef.current = recorder;
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      voiceMimeTypeRef.current = recorder.mimeType || mimeType || "audio/webm";
      voiceDiscardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        addToast?.({ type: 'error', message: 'Voice note recording failed.' });
        stopVoiceRecorderResources();
      };
      recorder.onstop = handleVoiceRecorderStop;
      recorder.start(1000);
      setVoiceRecorderState({ active: true, seconds: 0 });
      voiceTimerRef.current = window.setInterval(() => {
        setVoiceRecorderState(prev => {
          const nextSeconds = prev.seconds + 1;
          if (nextSeconds >= MAX_VOICE_NOTE_SECONDS) {
            window.setTimeout(() => {
              const currentRecorder = voiceRecorderRef.current;
              if (currentRecorder && currentRecorder.state !== "inactive") currentRecorder.stop();
            }, 0);
          }
          return { ...prev, seconds: nextSeconds };
        });
      }, 1000);
    } catch (error) {
      addToast?.({ type: 'error', message: error?.message || 'Microphone access was denied.' });
      stopVoiceRecorderResources();
    }
  }, [addToast, handleVoiceRecorderStop]);
  const toggleVoiceRecording = useCallback(() => {
    if (voiceRecorderState.active) stopVoiceRecording();
    else startVoiceRecording();
  }, [startVoiceRecording, stopVoiceRecording, voiceRecorderState.active]);
  const voiceRecorderLabel = voiceRecorderState.active
    ? `Stop voice note (${formatDuration(voiceRecorderState.seconds)})`
    : "Record voice note";
  const voiceRecorderSupported = typeof window !== "undefined"
    && typeof navigator !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof window.MediaRecorder !== "undefined";

  const doUpdate = (changes) => {
    const updated = { ...localObj, ...changes };
    setLocalObj(updated);
    onUpdate(updated);
  };

  const handleMessageChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);
    setActiveMention(getActiveMention(value, e.target.selectionStart ?? value.length));
  };

  const insertMention = (user) => {
    if (!activeMention) return;
    const nextMessage = insertMentionText(newMessage, activeMention, user);
    const nextCursor = activeMention.start + user.name.length + 2;
    setNewMessage(nextMessage);
    setSelectedMentionIds(prev => prev.includes(user.id) ? prev : [...prev, user.id]);
    setActiveMention(null);
    setPendingMentionCursor(nextCursor);
  };

  const sendMessage = () => {
    if (voiceRecorderState.active) {
      addToast?.({ type: 'info', message: 'Stop the voice note first, then send the message.' });
      return;
    }
    const pendingAttachments = messageAttachments.length > 0
      ? messageAttachments
      : Array.from(messageFileRef.current?.files || []).map(file => ({
        name: file.name,
        size: file.size,
        type: getMessageFileType(file.type),
        file,
      }));
    if (!newMessage.trim() && pendingAttachments.length === 0) return;
    const mentionedUsers = getMentionedUsers(newMessage, selectedMentionIds, getProfiles(), currentUser.id);
    const onlyVoiceNote = pendingAttachments.length > 0 && pendingAttachments.every(isAudioAttachment);
    doUpdate({
      messages: [...localObj.messages, {
        id: generateId(),
        clientId: generateId(),
        userId: currentUser.id,
        text: newMessage.trim() || (onlyVoiceNote ? "Voice note" : "Attached file"),
        ts: new Date().toISOString(),
        attachments: pendingAttachments,
        mentions: mentionedUsers.map(user => user.id),
      }]
    });
    setNewMessage("");
    writeDraft(messageDraftKey, "");
    setMessageAttachments([]);
    setSelectedMentionIds([]);
    setActiveMention(null);
    if (messageFileRef.current) messageFileRef.current.value = "";
  };

  const startEditMessage = (message) => {
    setEditingMessageId(message.id);
    setMessageEditDraft(message.text || "");
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setMessageEditDraft("");
  };

  const saveMessageEdit = async () => {
    if (!editingMessageId || !messageEditDraft.trim() || !onUpdateMessage) return;
    await onUpdateMessage(localObj.id, editingMessageId, messageEditDraft.trim());
    cancelEditMessage();
  };

  const markMessagesRead = useCallback(async ({ silent = false } = {}) => {
    if (!onMarkMessagesRead) return;
    try {
      await onMarkMessagesRead(localObj.id, currentUser.id);
      if (!silent) addToast?.({ type: 'success', message: 'Messages marked read' });
    } catch (err) {
      if (!silent) addToast?.({ type: 'error', message: err.message || 'Could not mark messages read' });
    }
  }, [addToast, currentUser.id, localObj.id, onMarkMessagesRead]);

  useEffect(() => {
    if (activeTab !== "messages" || unreadMessages === 0 || !onMarkMessagesRead) return undefined;
    const newestUnreadId = [...(localObj.messages || [])].reverse().find(message => message.isUnread)?.id || "";
    const readKey = `${localObj.id}:${newestUnreadId}:${unreadMessages}`;
    if (autoReadKeyRef.current === readKey) return undefined;
    autoReadKeyRef.current = readKey;
    const timer = window.setTimeout(() => markMessagesRead({ silent: true }), 900);
    return () => window.clearTimeout(timer);
  }, [activeTab, unreadMessages, localObj.id, localObj.messages, markMessagesRead, onMarkMessagesRead]);

  const getStatusProgress = (newStatus) => {
    if (newStatus === "completed") return 100;
    if (localObj.status === "completed") return Math.min(Number(localObj.progress) || 0, 90);
    return localObj.progress;
  };

  const updateStatus = (newStatus) => {
    const nextProgress = getStatusProgress(newStatus);
    doUpdate({
      status: newStatus,
      progress: nextProgress,
      updates: [...localObj.updates, {
        ts: new Date().toISOString(),
        status: newStatus,
        progress: nextProgress,
        note: localObj.status === "completed" && newStatus !== "completed"
          ? `Objective reopened as ${getStatusLabel(newStatus)}`
          : `Status changed to ${getStatusLabel(newStatus)}`,
      }]
    });
    addToast({ type: 'success', message: `Status updated to ${getStatusLabel(newStatus)}` });
  };

  const reopenObjective = () => {
    updateStatus("on_track");
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
      setBlockerDraft(localObj.blockerReason || "");
      setShowBlockerModal(true);
    }
  };

  const setTab = (tab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const handleRunObjectiveStarter = async () => {
    if (!runObjectiveStarter || agentRunning) return;
    setAgentRunning(true);
    try {
      await runObjectiveStarter(localObj.id);
      addToast({ type: 'success', message: 'Objective Assistant prepared a starter pack' });
      await onUpdate({ ...localObj, _refresh: true });
      setTab("files");
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Objective Assistant could not prepare a starter pack' });
      await onUpdate({ ...localObj, _refresh: true });
    } finally {
      setAgentRunning(false);
    }
  };

  const translateMessage = async (message) => {
    if (!message?.id || !onTranslateMessage) return;
    if (messageTranslations[message.id]?.translation) return;
    setMessageTranslations(prev => ({ ...prev, [message.id]: { loading: true } }));
    try {
      const translation = await onTranslateMessage(message.text);
      setMessageTranslations(prev => ({ ...prev, [message.id]: { translation } }));
    } catch (err) {
      setMessageTranslations(prev => ({ ...prev, [message.id]: { error: err.message || 'Could not translate message' } }));
    }
  };

  const tagRoleLabel = () => "Assigned";

  const tagPerson = async (draft = memberDraft) => {
    if (!draft.userId || !addObjectiveMember) return;
    try {
      const taggedUser = getUser(draft.userId);
      await addObjectiveMember(localObj.id, draft);
      try {
        await createNotification?.(
          draft.userId,
          "assignment",
          localObj.id,
          `${currentUser.name || "A teammate"} assigned you on "${localObj.title}".`
        );
      } catch (notificationError) {
        console.warn('Tag notification failed', notificationError);
      }
      setMemberDraft({ userId: "", role: "assignee" });
      setShowTagPicker(false);
      addToast({ type: 'success', message: `${taggedUser.name} tagged on this objective` });
      await onUpdate({ ...localObj, _refresh: true });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not tag this teammate' });
    }
  };

  const tagMentionedPerson = async (user) => {
    if (!user?.id) return;
    await tagPerson({ userId: user.id, role: "assignee" });
  };

  const untagPerson = async (member) => {
    if (!removeObjectiveMember) return;
    try {
      await removeObjectiveMember(member.id);
      addToast({ type: 'success', message: `${member.user.name} untagged` });
      await onUpdate({ ...localObj, _refresh: true });
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not remove this tag' });
    }
  };

  const confirmBlocker = () => {
    if (!blockerDraft.trim()) return;
    doUpdate({ blockerFlag: true, blockerReason: blockerDraft.trim(), status: "blocked" });
    setShowBlockerModal(false);
    addToast({ type: 'error', message: 'Blocker flagged' });
  };

  const refreshOpenObjective = async () => {
    await onUpdate({ ...localObj, _refresh: true });
  };

  const startEditSubtask = (subtask) => {
    setEditingSubtaskId(subtask.id);
    setSubtaskEditDraft({
      title: subtask.title || "",
      ownerId: subtask.ownerId || currentUser.id,
      dueDate: subtask.dueDate ? new Date(subtask.dueDate).toISOString().slice(0, 10) : "",
      weight: subtask.weight ?? 1,
      progress: subtask.progress ?? 0,
      status: subtask.status || "not_started",
      isMilestone: Boolean(subtask.isMilestone),
    });
  };

  const cancelEditSubtask = () => {
    setEditingSubtaskId(null);
    setSubtaskEditDraft(null);
  };

  const saveSubtaskEdit = async (subtask) => {
    if (!subtaskEditDraft?.title?.trim() || !updateSubtask) return;
    try {
      await updateSubtask(subtask.id, {
        ...subtaskEditDraft,
        title: subtaskEditDraft.title.trim(),
        dueDate: subtaskEditDraft.dueDate || null,
        progress: Math.min(100, Math.max(0, Number(subtaskEditDraft.progress) || 0)),
        weight: Number(subtaskEditDraft.weight) || 1,
      });
      cancelEditSubtask();
      addToast({ type: 'success', message: 'Subtask updated' });
      await refreshOpenObjective();
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not update subtask' });
    }
  };

  const confirmDeleteSubtask = async () => {
    if (!subtaskDeleteTarget || !deleteSubtask) return;
    try {
      await deleteSubtask(subtaskDeleteTarget.id);
      setSubtaskDeleteTarget(null);
      cancelEditSubtask();
      addToast({ type: 'success', message: 'Subtask deleted' });
      await refreshOpenObjective();
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not delete subtask' });
    }
  };

  const addStepToWorkflow = async () => {
    if (!workflowDraft.title.trim() || !addWorkflowStep) return;
    try {
      const nextOrder = Math.max(0, ...workflowSteps.map(step => step.stepOrder || 0)) + 10;
      await addWorkflowStep(localObj.id, {
        ...workflowDraft,
        title: workflowDraft.title.trim(),
        stepOrder: nextOrder,
        status: workflowSteps.length === 0 ? "current" : "todo",
        userId: currentUser.id,
      });
      setWorkflowDraft({ title: "", ownerId: currentUser.id, dueDate: "", description: "" });
      addToast({ type: 'success', message: 'Workflow step added' });
      await refreshOpenObjective();
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not add workflow step' });
    }
  };

  const updateWorkflowStatus = async (step, status) => {
    if (!updateWorkflowStep) return;
    try {
      if (status === "current") {
        const currentSteps = workflowSteps.filter(item => item.id !== step.id && item.status === "current");
        for (const currentStep of currentSteps) {
          await updateWorkflowStep(currentStep.id, {
            status: "todo",
            userId: currentUser.id,
            updateNote: `Workflow moved away from ${currentStep.title}`,
          });
        }
      }

      await updateWorkflowStep(step.id, {
        status,
        completedBy: status === "done" ? currentUser.id : null,
        userId: currentUser.id,
        oldValue: step.status,
        newValue: status,
        updateNote: `Workflow step "${step.title}" marked ${workflowStatusLabel(status).toLowerCase()}`,
      });

      if (status === "done") {
        const nextStep = workflowSteps.find(item => item.stepOrder > step.stepOrder && !["done", "skipped"].includes(item.status));
        if (nextStep && nextStep.status === "todo") {
          await updateWorkflowStep(nextStep.id, {
            status: "current",
            userId: currentUser.id,
            updateNote: `Workflow moved to ${nextStep.title}`,
          });
        }
      }

      addToast({ type: 'success', message: `Workflow updated: ${step.title}` });
      await refreshOpenObjective();
    } catch (err) {
      addToast({ type: 'error', message: err.message || 'Could not update workflow' });
    }
  };

  const WorkflowSummaryStrip = () => {
    const headline = currentWorkflowStep
      ? `${currentWorkflowStep.title} is ${workflowStatusLabel(currentWorkflowStep.status).toLowerCase()}`
      : "Workflow is ready to set up";
    const ownerForStep = currentWorkflowStep?.ownerId ? getUser(currentWorkflowStep.ownerId) : owner;

    return (
      <button
        type="button"
        onClick={() => setTab("workflow")}
        className="card-hover"
        style={{
          width: "100%",
          margin: "12px 0",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--accent-5)",
          background: "var(--accent-2)",
          textAlign: "left",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "center",
        }}
        aria-label="Open next step tracker"
      >
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-6" style={{ marginBottom: 6 }}>
            <CheckCircle2 size={14} color="var(--brand)" />
            <span className="text-sm font-bold text-primary">Next Step Tracker</span>
            {workflowTotal > 0 && <Badge color="var(--brand)">{workflowDone}/{workflowTotal}</Badge>}
          </div>
          <div className="text-sm font-semibold text-primary truncate">{headline}</div>
          <div className="flex items-center gap-6 text-xs text-muted" style={{ marginTop: 5 }}>
            {currentWorkflowStep && <Avatar user={ownerForStep} size={16} />}
            <span>{currentWorkflowStep ? ownerForStep.name : "Add the first step to get moving"}</span>
            {currentWorkflowStep?.dueDate && <span>{formatDate(currentWorkflowStep.dueDate)}</span>}
          </div>
        </div>
        <div style={{ minWidth: 120 }}>
          <ProgressBar value={workflowPercent} color="var(--brand)" height={4} />
          <div className="text-xs text-muted" style={{ marginTop: 5, textAlign: "right" }}>{workflowPercent}% complete</div>
        </div>
      </button>
    );
  };

  const AgentAssistStrip = ({ compact = false }) => {
    if (!agentFeatureEnabled) return null;
    const isCompleted = Boolean(completedAgentRun);
    const isFailed = !isCompleted && latestFailedAgentRun && latestAgentRun?.id === latestFailedAgentRun.id;
    const statusText = isCompleted
      ? "Objective Assistant got this started."
      : isFailed
        ? "Objective Assistant hit a snag."
        : "Objective Assistant can prepare a starter pack from this objective.";
    const detailText = isCompleted
      ? (completedAgentRun.outputSummary || "A starter pack is ready in Files.")
      : isFailed
        ? (latestFailedAgentRun.error || "The last run failed. You can retry.")
        : "It will save next steps, questions, requested inputs, risks, and any source links it finds as a file.";

    return (
      <div className="agent-assist-card" style={{ padding: compact ? "10px 12px" : "12px 14px", margin: compact ? "0 0 16px" : "12px 0" }}>
        <div className="agent-assist-icon"><Sparkles size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-sm font-bold" style={{ color: "var(--accent-10)" }}>{statusText}</div>
          <div className="text-xs text-muted" style={{ marginTop: 2, lineHeight: 1.4 }}>{detailText}</div>
          {starterFile && <div className="text-xs text-brand" style={{ marginTop: 6 }}>{starterFile.name}</div>}
        </div>
        {isCompleted ? (
          <button className="btn btn-xs btn-primary" onClick={() => setTab("files")}>View starter pack</button>
        ) : (
          <button className="btn btn-xs btn-primary" onClick={handleRunObjectiveStarter} disabled={agentRunning || !runObjectiveStarter}>
            {agentRunning ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
            {agentRunning ? "Preparing..." : isFailed ? "Retry" : "Get assistant started"}
          </button>
        )}
      </div>
    );
  };

  const TaggedPeopleBar = () => (
    <div className="tagged-people-bar">
      <div className="flex items-center gap-6" style={{ flexShrink: 0 }}>
        <Users size={13} color="var(--brand)" />
        <span className="text-xs font-bold text-brand">Tagged</span>
      </div>
      <div className="tagged-people-list">
        {taggedMembers.length === 0 ? (
          <span className="text-xs text-muted">No supporting teammate tagged yet.</span>
        ) : taggedMembers.map(member => (
          <div key={member.id} className="tagged-person-chip">
            <Avatar user={member.user} size={18} />
            <span>{member.user.name}</span>
            <Badge color="var(--info)">{tagRoleLabel(member.role)}</Badge>
            {removeObjectiveMember && <button onClick={(e) => { e.stopPropagation(); untagPerson(member); }} title={`Untag ${member.user.name}`}><X size={11} /></button>}
          </div>
        ))}
      </div>
      <button className="btn btn-xs btn-secondary" onClick={() => setShowTagPicker(v => !v)}>
        <UserPlus size={12} /> Tag someone
      </button>
      {showTagPicker && (
        <div className="tag-picker">
          <TagMentionControl
            candidates={tagCandidates}
            currentUserId={currentUser.id}
            onTag={tagMentionedPerson}
            compact
            placeholder="@name to tag"
          />
        </div>
      )}
    </div>
  );

  const tabs = [
    { id: "messages", label: "Messages", icon: MessageSquare, countText: unreadMessages ? `${unreadMessages} unread` : messageCount ? `${messageCount} total` : "" },
    { id: "details", label: "Details", icon: FileText },
    { id: "structure", label: "Structure", icon: Building2, count: linkedProjects.length },
    { id: "workflow", label: "Next Step", icon: CheckCircle2, count: workflowTotal },
    { id: "subtasks", label: "Subtasks", icon: Layers, count: localObj.subtasks?.length },
    { id: "metrics", label: "Metrics", icon: TrendingUp, count: localObj.metricCheckins?.length },
    { id: "access", label: "Access", icon: Users, count: (localObj.members?.length || 0) + 1 },
    { id: "files", label: "Files", icon: Paperclip, count: localObj.files?.length },
    { id: "activity", label: "Activity", icon: Activity },
  ];

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content objective-detail-modal" style={{ width: "min(95vw, 720px)", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="objective-detail-header" style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--accent-5)" }}>
          <div className="flex justify-between" style={{ alignItems: "flex-start", marginBottom: 12 }}>
            <div style={{ flex: 1, marginRight: 16 }}>
              <div className="flex gap-6 flex-wrap" style={{ marginBottom: 8 }}>
                <Badge color={localObj.blockerFlag ? getStatusColor("blocked") : getStatusColor(localObj.status)}>{localObj.blockerFlag ? getStatusLabel("blocked") : getStatusLabel(localObj.status)}</Badge>
                <Badge color={getPriorityColor(localObj.priority)} outline>{localObj.priority}</Badge>
                <Badge color={okrMeta.color} outline>{okrMeta.shortLabel}</Badge>
                {lowConfidence && <Badge color="#F59E0B">Review classification</Badge>}
                {staleKr && <Badge color="#EF4444">Stale KR</Badge>}
                {overdue && <Badge color="#F59E0B">OVERDUE</Badge>}
                {!localObj.acknowledged && localObj.delegatedBy && <Badge color="#8B5CF6">Needs Acknowledgement</Badge>}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{localObj.title}</h2>
              <div className="objective-timestamp-line objective-detail-timestamp">{formatObjectiveTimestamp(localObj)}</div>
            </div>
            <div className="flex gap-4">
              {onEdit && <button className="icon-btn" onClick={() => onEdit(localObj)} title="Edit objective"><Edit3 size={16} /></button>}
              <button className="icon-btn" onClick={toggleBlocker} title={localObj.blockerFlag ? "Remove blocker" : "Flag blocker"}>
                <Flag size={16} color={localObj.blockerFlag ? "#EF4444" : undefined} />
              </button>
              {canDeleteObjective && <button className="icon-btn" onClick={() => setShowDeleteConfirm(true)} title="Delete"><Trash2 size={16} /></button>}
              <button onClick={onClose} className="btn btn-xs btn-secondary mobile-only"><ArrowLeft size={12} /> Back</button>
              <button onClick={onClose} className="icon-btn" title="Close objective" aria-label="Close objective"><X size={20} /></button>
            </div>
          </div>
          {/* Owner bar */}
          <div className="flex items-center gap-16 flex-wrap text-sm text-secondary" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-6"><Avatar user={owner} size={22} /><span><strong className="text-primary">{owner.name}</strong> owns</span></div>
            {delegator && <div className="flex items-center gap-6"><ArrowLeft size={12} /><span>Delegated by <strong className="text-primary">{delegator.name}</strong></span></div>}
            <div className="flex items-center gap-4"><Calendar size={12} /><span style={{ color: overdue ? "var(--warning)" : undefined, fontWeight: overdue ? 600 : 400 }}>{formatDate(localObj.dueDate)}</span></div>
            {(() => {
              // Data-driven progress (OMP bridge plan, Domain 6): a derived value
              // is a calculation field and stays immutable — only truly manual
              // progress is hand-editable. The source label says what's real.
              const PROGRESS_SOURCE_LABELS = { metric: "from metric", rollup: "rolled up", workflow: "from steps", none: "not tracked yet" };
              const derivedLabel = PROGRESS_SOURCE_LABELS[localObj.progressSource];
              const isDerived = derivedLabel && localObj.progressSource !== "none";
              if (isDerived) {
                return (
                  <div className="flex items-center gap-4" title={`Progress is calculated (${derivedLabel}) and cannot be hand-edited.`}>
                    <span>{localObj.progress}%</span>
                    <span className="badge" style={{ fontSize: 10, opacity: 0.75 }}>{derivedLabel}</span>
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-4 cursor-pointer" onClick={() => setEditingProgress(true)}>
                  {editingProgress ? (
                    <div className="flex items-center gap-4">
                      <input type="number" value={progressValue} onChange={e => setProgressValue(e.target.value)} min={0} max={100} style={{ width: 50, padding: "2px 6px", fontSize: 12 }} autoFocus onKeyDown={e => { if (e.key === "Enter") saveProgress(); if (e.key === "Escape") setEditingProgress(false); }} />
                      <span className="text-xs">%</span>
                      <button className="btn btn-xs btn-primary" onClick={saveProgress}>Save</button>
                    </div>
                  ) : <span>{localObj.progress}% <Edit3 size={10} style={{ opacity: 0.5 }} /></span>}
                </div>
              );
            })()}
          </div>
          <TaggedPeopleBar />
          {/* Acknowledge button */}
          {!localObj.acknowledged && localObj.delegatedBy && localObj.ownerId === currentUser.id && (
            <button className="btn btn-primary btn-sm" onClick={acknowledge} style={{ marginBottom: 12 }}>
              <Check size={14} /> Acknowledge Delegation
            </button>
          )}
          <ProgressBar value={localObj.progress} color={getStatusColor(localObj.status)} height={3} />
          <WorkflowSummaryStrip />
          <AgentAssistStrip />
          {/* Tabs */}
          <div className="flex gap-4" style={{ marginTop: 12, marginBottom: -1, overflowX: "auto" }}>
            {tabs.map(tab => (
              <button key={tab.id} aria-label={tab.label} aria-selected={activeTab === tab.id} onClick={() => setTab(tab.id)} className="flex items-center gap-4" style={{
                padding: "8px 14px", border: "none", borderBottom: activeTab === tab.id ? "2px solid var(--brand)" : "2px solid transparent",
                background: "none", color: activeTab === tab.id ? "var(--brand)" : "var(--accent-7)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap"
              }}>
                <tab.icon size={13} />
                {tab.label}
                {tab.countText && <span style={{ background: activeTab === tab.id ? "var(--brand-bg)" : "var(--accent-5)", borderRadius: "var(--radius-full)", padding: "1px 6px", fontSize: 10 }}>{tab.countText}</span>}
                {tab.count > 0 && !tab.countText && <span style={{ background: activeTab === tab.id ? "var(--brand-bg)" : "var(--accent-5)", borderRadius: "var(--radius-full)", padding: "1px 6px", fontSize: 10 }}>{tab.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="objective-detail-body" style={{ flex: 1, overflow: "auto" }}>
          {/* MESSAGES */}
          {activeTab === "messages" && (
            <div className="flex flex-col" style={{ minHeight: 300 }}>
              {localObj.messages.length > 0 && (
                <div className="message-read-strip">
                  <div className="flex items-center gap-6">
                    <MessageSquare size={13} />
                    <span>{unreadMessages ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}` : 'All messages read'}</span>
                  </div>
                  <div className="flex items-center gap-8">
                    {localObj.messageReadAt && <span>Last marked {timeAgo(localObj.messageReadAt)}</span>}
                    {unreadMessages > 0 && <button className="btn btn-xs btn-secondary" onClick={markMessagesRead}>Mark read</button>}
                  </div>
                </div>
              )}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
                {localObj.messages.length === 0 ? <EmptyState icon={MessageSquare} text="No messages yet. Start the conversation." action={<AgentAssistStrip compact />} /> :
                  localObj.messages.map(msg => {
                    const msgUser = getUser(msg.userId);
                    const isMe = msg.userId === currentUser.id;
                    return (
                      <div key={msg.id}>
                        {msg.id === firstUnreadMessageId && (
                          <div className="message-unread-divider">
                            <span>New since you last checked</span>
                          </div>
                        )}
                        <div className="flex gap-10" style={{ marginBottom: 16, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <Avatar user={msgUser} size={28} />
                        <div className={`message-bubble ${msg.isUnread ? 'message-unread' : ''}`} style={{ maxWidth: "75%", background: isMe ? "var(--brand-bg)" : "var(--accent-4)", borderRadius: isMe ? "12px 4px 12px 12px" : "4px 12px 12px 12px", padding: "10px 14px", border: `1px solid ${msg.isUnread ? 'rgba(var(--sandpro-orange-rgb),0.65)' : isMe ? "var(--brand-border)" : "var(--accent-5)"}` }}>
                            <div className="flex items-center gap-6" style={{ marginBottom: 4 }}>
                              <span className="text-xs font-bold" style={{ color: msgUser.color }}>{msgUser.name}</span>
                              <span className="text-xs text-muted">{timeAgo(msg.ts)}</span>
                              {msg.isUnread && <Badge color="var(--brand)">Unread</Badge>}
                              {isMe && onUpdateMessage && editingMessageId !== msg.id && (
                                <button className="btn btn-xs btn-ghost" onClick={() => startEditMessage(msg)} title="Edit message">
                                  <Edit3 size={10} /> Edit
                                </button>
                              )}
                            </div>
                            {editingMessageId === msg.id ? (
                              <div className="message-edit-box">
                                <textarea
                                  value={messageEditDraft}
                                  onChange={e => setMessageEditDraft(e.target.value)}
                                  rows={3}
                                  autoFocus
                                  onKeyDown={e => {
                                    if (e.key === "Escape") cancelEditMessage();
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveMessageEdit();
                                  }}
                                />
                                <div className="flex gap-6 justify-end">
                                  <button className="btn btn-xs btn-secondary" onClick={cancelEditMessage}>Cancel</button>
                                  <button className="btn btn-xs btn-primary" onClick={saveMessageEdit}>Save</button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-md" style={{ margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap", color: "var(--accent-9)" }}>{msg.text}</p>
                            )}
                            <MessageTranslation
                              message={msg}
                              translationState={messageTranslations[msg.id]}
                              onTranslate={translateMessage}
                            />
                            {msg.attachments?.length > 0 && (
                              <div className="message-attachments">
                                {msg.attachments.map((att, j) => (
                                  isAudioAttachment(att) ? (
                                    <VoiceNoteAttachment key={att.id || `${att.name}-${j}`} attachment={att} onPreview={setPreviewFile} />
                                  ) : (
                                    <button key={att.id || `${att.name}-${j}`} onClick={() => setPreviewFile(att)} className="message-attachment-pill" aria-label={`Preview ${att.name}`}>
                                      <Paperclip size={10} />{att.name}
                                    </button>
                                  )
                                ))}
                              </div>
                            )}
                            <MessageReactions
                              message={msg}
                              currentUser={currentUser}
                              onSetReaction={(message, reaction) => onSetMessageReaction?.(localObj.id, message.id, reaction)}
                              onRemoveReaction={(message) => onRemoveMessageReaction?.(localObj.id, message.id)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* STRUCTURE */}
          {activeTab === "structure" && (
            <div style={{ padding: "20px 24px" }}>
              <div className="objective-structure-summary">
                <div>
                  <span>Work classification</span>
                  <strong style={{ color: okrMeta.color }}>{OKR_LEVEL_LABELS[getAssumedOkrLevel(localObj)] || okrMeta.label}</strong>
                  <small>{localObj.classificationReason || "Classification has not been explained yet."}</small>
                </div>
                <div>
                  <span>Assessment confidence</span>
                  <strong>{confidence ? `${confidence}%` : "Pending"}</strong>
                  <small>{localObj.classificationStatus === "manual" ? "Manually set" : lowConfidence ? "Needs review" : "Auto-classified"}</small>
                </div>
                <div>
                  <span>Period / cadence</span>
                  <strong>{localObj.okrPeriod || getCurrentOkrPeriod()}</strong>
                  <small>{localObj.measurementCadence || "monthly"} updates</small>
                </div>
                <div>
                  <span>Weight</span>
                  <strong>{Number(localObj.okrWeight ?? 1).toFixed(1)}</strong>
                  <small>Equal-weight v1 default</small>
                </div>
              </div>

              <div className="objective-structure-grid">
                <div className="card objective-structure-card">
                  <div className="project-section-heading">
                    <div>
                      <strong>Hierarchy</strong>
                      <span>{'Company OKR -> Department OKR -> KR -> projects'}</span>
                    </div>
                  </div>
                  {parentObjective ? (
                    <button type="button" className="objective-structure-link" onClick={() => addToast?.({ type: "info", message: "Open the parent from the Objectives tree view." })}>
                      <Layers size={14} />
                      <span><strong>Parent</strong>{parentObjective.title}</span>
                    </button>
                  ) : (
                    <div className="text-xs text-muted">No parent objective linked.</div>
                  )}
                  {childObjectives.length > 0 ? childObjectives.map(child => (
                    <div key={child.id} className="objective-structure-child">
                      <span className="status-dot" style={{ background: getStatusColor(child.status) }} />
                      <span>{child.title}</span>
                      <Badge color={getOkrLevelMeta(child.okrLevel).color}>{getOkrLevelMeta(child.okrLevel).shortLabel}</Badge>
                    </div>
                  )) : <div className="text-xs text-muted" style={{ marginTop: 10 }}>No child objectives linked.</div>}
                </div>
                <div className="card objective-structure-card">
                  <div className="project-section-heading">
                    <div>
                      <strong>Required fields</strong>
                      <span>Shown by OKR/project classification</span>
                    </div>
                  </div>
                  <div className="objective-required-list">
                    {[
                      ["Owner", Boolean(localObj.ownerId)],
                      ["Department / period", Boolean(localObj.department && localObj.okrPeriod)],
                      ["Parent OKR", !["department", "key_result"].includes(localObj.okrLevel) || Boolean(localObj.parentId)],
                      ["KR metrics", localObj.okrLevel !== "key_result" || [localObj.baselineMetric, localObj.currentMetric, localObj.targetMetric, localObj.metricUnit].every(value => value !== null && value !== undefined && value !== "")],
                      ["Linked project assessment", localObj.okrLevel !== "key_result" || linkedProjects.length > 0],
                    ].map(([label, ok]) => (
                      <div key={label} className={ok ? "met" : "missing"}>
                        {ok ? <Check size={12} /> : <AlertTriangle size={12} />}
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  {staleKr && <div className="project-blockers"><strong>Stale KR</strong><span>- No recent metric check-in or update in the last 14 days.</span></div>}
                </div>
              </div>

              <ProjectAssessmentPanel
                objective={localObj}
                objectives={objectives}
                projects={linkedProjects}
                currentUser={currentUser}
                createOkrProject={createOkrProject}
                updateOkrProject={updateOkrProject}
                updateProjectArtifact={updateProjectArtifact}
                captureProjectSignature={captureProjectSignature}
                uploadProjectAttachment={uploadProjectAttachment}
                deleteProjectAttachment={deleteProjectAttachment}
                addToast={addToast}
              />
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
                {localObj.status === "completed" && (
                  <button className="btn btn-sm btn-secondary" onClick={reopenObjective} style={{ marginBottom: 10 }}>
                    <ArrowLeft size={14} /> Reopen objective
                  </button>
                )}
                <div className="flex gap-6 flex-wrap">
                  {["not_started", "on_track", "at_risk", "blocked", "completed"].map(s => {
                    const effectiveStatus = localObj.blockerFlag ? "blocked" : localObj.status;
                    const isActive = effectiveStatus === s;
                    return (
                      <button key={s} onClick={() => updateStatus(s)} className="btn btn-xs" style={{
                        border: `1px solid ${isActive ? getStatusColor(s) : "var(--accent-5)"}`,
                        background: isActive ? getStatusBg(s) : "transparent",
                        color: isActive ? getStatusColor(s) : "var(--accent-7)"
                      }}>{getStatusLabel(s)}</button>
                    );
                  })}
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

          {/* WORKFLOW */}
          {activeTab === "workflow" && (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: 16 }}>
                <div className="text-sm font-bold text-primary" style={{ marginBottom: 4 }}>Next step tracker</div>
                <div className="text-sm text-muted" style={{ lineHeight: 1.5 }}>
                  Use this to show the current handoff, owner, and due date. Marking a step done automatically moves the objective to the next open step.
                </div>
              </div>
              <FeatureHelp
                id="objective-workflow-tracker"
                title="How to use the next step tracker"
                items={[
                  "Keep the current step small enough that someone can act on it this week.",
                  "Mark a step done when the work is truly complete; the next open step becomes current.",
                  "Use Block when a step is stuck so it shows up in the Daily Brief and attention areas.",
                ]}
              />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 16 }}>
                <div className="card" style={{ padding: 12 }}>
                  <div className="text-xs text-muted">Current next step</div>
                  <div className="text-sm font-bold text-primary truncate" style={{ marginTop: 4 }}>{currentWorkflowStep?.title || "Not set"}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div className="text-xs text-muted">Completed</div>
                  <div className="text-sm font-bold text-primary" style={{ marginTop: 4 }}>{workflowDone} of {workflowTotal || 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div className="text-xs text-muted">Step progress</div>
                  <div style={{ marginTop: 8 }}><ProgressBar value={workflowPercent} color="var(--brand)" height={5} /></div>
                </div>
              </div>

              <div className="card" style={{ padding: 12, marginBottom: 16 }}>
                <div className="flex gap-8 flex-wrap">
                  <input
                    value={workflowDraft.title}
                    onChange={e => setWorkflowDraft(d => ({ ...d, title: e.target.value }))}
                    placeholder="Next step title"
                    style={{ flex: "1 1 180px" }}
                  />
                  <select value={workflowDraft.ownerId} onChange={e => setWorkflowDraft(d => ({ ...d, ownerId: e.target.value }))}>
                    {getProfiles().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input type="date" value={workflowDraft.dueDate} onChange={e => setWorkflowDraft(d => ({ ...d, dueDate: e.target.value }))} />
                  <button className="btn btn-sm btn-primary" onClick={addStepToWorkflow} disabled={!workflowDraft.title.trim() || !addWorkflowStep} aria-label="Add next step">
                    <Plus size={12} /> Add step
                  </button>
                </div>
                <textarea
                  value={workflowDraft.description}
                  onChange={e => setWorkflowDraft(d => ({ ...d, description: e.target.value }))}
                  placeholder="Optional note for this step"
                  rows={2}
                  style={{ width: "100%", marginTop: 8 }}
                />
              </div>

              {workflowSteps.length === 0 ? <EmptyState icon={CheckCircle2} text="No next steps yet. Add the first step above." /> : (
                <div className="flex flex-col gap-10">
                  {workflowSteps.map((step, index) => {
                    const StepIcon = workflowStepIcon(step.status);
                    const stepOwner = step.ownerId ? getUser(step.ownerId) : owner;
                    const isDone = step.status === "done";
                    const isBlocked = step.status === "blocked";
                    const isSkipped = step.status === "skipped";
                    return (
                      <div key={step.id} className="card" style={{ padding: 14, borderColor: step.status === "current" ? "var(--brand-border)" : isBlocked ? "rgba(239,68,68,0.25)" : "var(--accent-5)" }}>
                        <div className="flex items-start gap-12">
                          <div style={{
                            width: 30,
                            height: 30,
                            borderRadius: 10,
                            background: `${workflowStatusColor(step.status)}18`,
                            color: workflowStatusColor(step.status),
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            <StepIcon size={15} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="flex items-center gap-8 flex-wrap">
                              <span className="text-md font-bold text-primary">{index + 1}. {step.title}</span>
                              <Badge color={workflowStatusColor(step.status)}>{workflowStatusLabel(step.status)}</Badge>
                            </div>
                            {step.description && <p className="text-sm text-secondary" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>{step.description}</p>}
                            <div className="flex items-center gap-8 flex-wrap text-xs text-muted" style={{ marginTop: 8 }}>
                              <Avatar user={stepOwner} size={18} />
                              <span>{stepOwner.name}</span>
                              {step.dueDate && <span>{formatDate(step.dueDate)}</span>}
                              {step.completedAt && <span>Completed {timeAgo(step.completedAt)}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-6 flex-wrap" style={{ marginTop: 12, paddingLeft: 42 }}>
                          {!isDone && !isSkipped && <button className="btn btn-xs btn-primary" onClick={() => updateWorkflowStatus(step, "done")} aria-label={`Mark ${step.title} done`}><Check size={12} /> Mark done</button>}
                          {step.status !== "current" && !isDone && !isSkipped && <button className="btn btn-xs btn-secondary" onClick={() => updateWorkflowStatus(step, "current")} aria-label={`Set ${step.title} current`}><Clock size={12} /> Set current</button>}
                          {!isDone && !isBlocked && !isSkipped && <button className="btn btn-xs btn-secondary" onClick={() => updateWorkflowStatus(step, "blocked")} aria-label={`Block ${step.title}`}><AlertTriangle size={12} /> Block</button>}
                          {isBlocked && <button className="btn btn-xs btn-secondary" onClick={() => updateWorkflowStatus(step, "current")} aria-label={`Resume ${step.title}`}><Clock size={12} /> Resume</button>}
                          {!isDone && !isSkipped && <button className="btn btn-xs btn-secondary" onClick={() => updateWorkflowStatus(step, "skipped")} aria-label={`Skip ${step.title}`}><X size={12} /> Skip</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUBTASKS */}
          {activeTab === "subtasks" && (
            <div style={{ padding: "20px 24px" }}>
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <div className="flex gap-8 flex-wrap">
                  <input value={subtaskDraft.title} onChange={e => setSubtaskDraft(d => ({ ...d, title: e.target.value }))} placeholder="Subtask or milestone title" style={{ flex: "1 1 180px" }} />
                  <select value={subtaskDraft.ownerId} onChange={e => setSubtaskDraft(d => ({ ...d, ownerId: e.target.value }))}>
                    {getProfiles().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <input type="date" value={subtaskDraft.dueDate} onChange={e => setSubtaskDraft(d => ({ ...d, dueDate: e.target.value }))} />
                  <input type="number" min="0" step="0.5" value={subtaskDraft.weight} onChange={e => setSubtaskDraft(d => ({ ...d, weight: Number(e.target.value) || 1 }))} style={{ width: 80 }} title="Weight" />
                  <button className={`btn btn-sm ${subtaskDraft.isMilestone ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSubtaskDraft(d => ({ ...d, isMilestone: !d.isMilestone }))}>Milestone</button>
                  <button className="btn btn-sm btn-primary" onClick={async () => {
                    if (!subtaskDraft.title.trim()) return;
                    await addSubtask?.(localObj.id, subtaskDraft);
                    setSubtaskDraft({ title: "", ownerId: currentUser.id, dueDate: "", weight: 1, isMilestone: false });
                    addToast({ type: 'success', message: 'Subtask added' });
                    await refreshOpenObjective();
                  }}><Plus size={12} /> Add</button>
                </div>
              </div>
              {localObj.subtasks.length === 0 && <EmptyState icon={Layers} text="No subtasks or milestones yet." />}
              {localObj.subtasks.map(st => {
                const stOwner = getUser(st.ownerId);
                const isEditing = editingSubtaskId === st.id && subtaskEditDraft;
                return (
                  <div key={st.id} data-testid="subtask-row" style={{ padding: "12px 0", borderBottom: "1px solid var(--accent-4)" }}>
                    {isEditing ? (
                      <div className="card" data-testid="subtask-edit-form" style={{ padding: 12 }}>
                        <div className="flex gap-8 flex-wrap" style={{ marginBottom: 8 }}>
                          <input value={subtaskEditDraft.title} onChange={e => setSubtaskEditDraft(d => ({ ...d, title: e.target.value }))} placeholder="Subtask title" style={{ flex: "1 1 200px" }} />
                          <select value={subtaskEditDraft.ownerId} onChange={e => setSubtaskEditDraft(d => ({ ...d, ownerId: e.target.value }))}>
                            {getProfiles().map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                          <select value={subtaskEditDraft.status} onChange={e => setSubtaskEditDraft(d => ({ ...d, status: e.target.value, progress: e.target.value === "completed" ? 100 : d.progress }))}>
                            <option value="not_started">Not Started</option>
                            <option value="on_track">On Track</option>
                            <option value="at_risk">At Risk</option>
                            <option value="blocked">Blocked</option>
                            <option value="completed">Completed</option>
                          </select>
                          <input type="date" value={subtaskEditDraft.dueDate} onChange={e => setSubtaskEditDraft(d => ({ ...d, dueDate: e.target.value }))} />
                          <input type="number" min="0" step="0.5" value={subtaskEditDraft.weight} onChange={e => setSubtaskEditDraft(d => ({ ...d, weight: e.target.value }))} style={{ width: 86 }} title="Weight" />
                          <input type="number" min="0" max="100" value={subtaskEditDraft.progress} onChange={e => setSubtaskEditDraft(d => ({ ...d, progress: e.target.value }))} style={{ width: 92 }} title="Progress percent" />
                          <button className={`btn btn-sm ${subtaskEditDraft.isMilestone ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSubtaskEditDraft(d => ({ ...d, isMilestone: !d.isMilestone }))}>Milestone</button>
                        </div>
                        <div className="flex justify-between gap-8 flex-wrap">
                            <button className="btn btn-danger btn-sm" data-testid="subtask-delete-from-edit" onClick={() => setSubtaskDeleteTarget(st)}><Trash2 size={12} /> Delete</button>
                          <div className="flex gap-8">
                            <button className="btn btn-secondary btn-sm" onClick={cancelEditSubtask}>Cancel</button>
                            <button className="btn btn-primary btn-sm" data-testid="subtask-save-button" onClick={() => saveSubtaskEdit(st)} disabled={!subtaskEditDraft.title.trim()}><Check size={12} /> Save</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-12">
                        <button onClick={async () => {
                          await updateSubtask?.(st.id, { status: st.status === "completed" ? "on_track" : "completed", progress: st.status === "completed" ? Math.min(st.progress || 0, 95) : 100 });
                          await refreshOpenObjective();
                        }} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${getStatusColor(st.status)}`, display: "flex", alignItems: "center", justifyContent: "center", background: st.status === "completed" ? getStatusColor(st.status) : "transparent" }}>
                          {st.status === "completed" && <Check size={12} color="#fff" />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="text-md font-medium" style={{ color: st.status === "completed" ? "var(--accent-7)" : "var(--accent-10)", textDecoration: st.status === "completed" ? "line-through" : "none" }}>{st.title}</div>
                          <div className="flex items-center gap-8" style={{ marginTop: 4 }}>
                            <Avatar user={stOwner} size={16} />
                            <span className="text-xs text-muted">{stOwner.name.split(" ")[0]}</span>
                            {st.isMilestone && <Badge color="var(--purple)">Milestone</Badge>}
                            {st.dueDate && <span className="text-xs text-muted">{formatDate(st.dueDate)}</span>}
                            <div style={{ flex: 1 }}><ProgressBar value={st.progress} color={getStatusColor(st.status)} height={2} /></div>
                            <span className="text-xs text-muted">{st.progress}%</span>
                          </div>
                        </div>
                        <button
                          className="btn btn-xs btn-secondary"
                          data-testid="subtask-edit-button"
                          onClick={() => startEditSubtask(st)}
                          title="Edit subtask"
                          aria-label={`Edit subtask: ${st.title}`}
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <button className="icon-btn" onClick={() => setSubtaskDeleteTarget(st)} title="Delete subtask"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* METRICS */}
          {activeTab === "metrics" && (
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
                <div className="progress-fill" style={{ width: `${metricPercent}%`, background: "linear-gradient(90deg, var(--brand), var(--success))", borderRadius: 6 }} />
              </div>
              <div className="text-sm text-muted" style={{ textAlign: "center", marginTop: 8 }}>
                {Math.round(metricPercent)}% to target
              </div>
              <div className="card" style={{ padding: 12, marginTop: 16 }}>
                <div className="flex gap-8 flex-wrap">
                  <input type="date" value={metricDraft.date} onChange={e => setMetricDraft(d => ({ ...d, date: e.target.value }))} />
                  <input type="number" value={metricDraft.value} onChange={e => setMetricDraft(d => ({ ...d, value: e.target.value }))} placeholder="Current value" />
                  <input value={metricDraft.note} onChange={e => setMetricDraft(d => ({ ...d, note: e.target.value }))} placeholder="Progress note" style={{ flex: "1 1 180px" }} />
                  <button className="btn btn-sm btn-primary" onClick={async () => {
                    if (metricDraft.value === "") return;
                    await addMetricCheckin?.(localObj.id, { ...metricDraft, value: Number(metricDraft.value), createdBy: currentUser.id });
                    setMetricDraft({ date: new Date().toISOString().slice(0, 10), value: "", note: "" });
                    addToast({ type: 'success', message: 'Metric check-in saved' });
                  }}><TrendingUp size={12} /> Log Check-In</button>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                {(localObj.metricCheckins || []).length === 0 ? <EmptyState icon={TrendingUp} text="No metric check-ins yet." /> : localObj.metricCheckins.map(c => (
                  <div key={c.id} className="flex items-center gap-10" style={{ padding: "8px 0", borderBottom: "1px solid var(--accent-4)" }}>
                    <Badge color="var(--brand)">{new Date(c.date).toLocaleDateString()}</Badge>
                    <span className="text-sm font-semibold">{c.value}{localObj.metricUnit || ""}</span>
                    <span className="text-xs text-muted">{c.note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "access" && (
            <div style={{ padding: "20px 24px" }}>
              <div className="card" style={{ padding: 12, marginBottom: 12 }}>
                <TagMentionControl
                  candidates={tagCandidates}
                  currentUserId={currentUser.id}
                  onTag={tagMentionedPerson}
                  addLabel="Add"
                  placeholder="@name to assign teammate"
                />
              </div>
              <div className="flex items-center gap-10" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
                <Avatar user={owner} size={28} />
                <div style={{ flex: 1 }}><div className="text-sm font-semibold">{owner.name}</div><div className="text-xs text-muted">Owner - receives all critical alerts</div></div>
                <Badge color="var(--brand)">Owner</Badge>
              </div>
              {(localObj.members || []).map(m => {
                const user = getUser(m.userId);
                return (
                  <div key={m.id} className="flex items-center gap-10" style={{ padding: "10px 0", borderBottom: "1px solid var(--accent-4)" }}>
                    <Avatar user={user} size={28} />
                    <div style={{ flex: 1 }}><div className="text-sm font-semibold">{user.name}</div><div className="text-xs text-muted">{user.title}</div></div>
                <Badge color="var(--info)">Assigned</Badge>
                    <button className="icon-btn" onClick={() => removeObjectiveMember?.(m.id)} title="Remove access"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {/* FILES */}
          {activeTab === "files" && <FilesTab objectiveId={localObj.id} files={localObj.files} addToast={addToast} uploadObjectiveFile={uploadObjectiveFile} deleteObjectiveFile={deleteObjectiveFile} currentUser={currentUser} showAiLabels={aiFeaturesEnabled} onFileChange={() => onUpdate({ ...localObj, _refresh: true })} />}

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
          <div className="objective-message-composer" style={{ padding: "12px 24px 16px", borderTop: "1px solid var(--accent-5)", background: "var(--accent-2)" }}>
            {messageAttachments.length > 0 && (
              <div className="message-pending-attachments">
                {messageAttachments.map((att, i) => (
                  isAudioAttachment(att) ? (
                    <PendingVoiceNotePreview
                      key={i}
                      attachment={att}
                      onRemove={() => setMessageAttachments(prev => prev.filter((_, j) => j !== i))}
                      onSend={sendMessage}
                    />
                  ) : (
                    <div key={i} className="message-pending-attachment">
                      <Paperclip size={10} />
                      <span>{att.name}</span>
                      {att.size ? <small>{formatFileSize(att.size)}</small> : null}
                      <button type="button" onClick={() => setMessageAttachments(prev => prev.filter((_, j) => j !== i))} aria-label={`Remove ${att.name}`}>
                        <X size={10} />
                      </button>
                    </div>
                  )
                ))}
              </div>
            )}
            <div className="flex gap-8" style={{ alignItems: "flex-end" }}>
              <input ref={messageFileRef} type="file" multiple hidden onChange={e => setMessageAttachments(Array.from(e.target.files || []).map(file => ({ name: file.name, size: file.size, type: getMessageFileType(file.type), file })))} />
              <button className="icon-btn" onClick={() => messageFileRef.current?.click()} style={{ width: 36, height: 36, border: "1px solid var(--accent-5)" }} title="Attach files"><Paperclip size={16} /></button>
              <button
                className="icon-btn"
                onClick={toggleVoiceRecording}
                disabled={!voiceRecorderSupported}
                style={{
                  width: 36,
                  height: 36,
                  border: "1px solid var(--accent-5)",
                  background: voiceRecorderState.active ? "rgba(239,68,68,0.12)" : undefined,
                  color: voiceRecorderState.active ? "#DC2626" : undefined,
                  opacity: voiceRecorderSupported ? 1 : 0.45,
                }}
                title={voiceRecorderSupported ? voiceRecorderLabel : "Voice recording is not supported here; attach an audio file instead."}
                aria-label={voiceRecorderSupported ? voiceRecorderLabel : "Voice recording unavailable"}
              >
                <Mic size={16} />
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ position: "relative" }}>
                  {activeMention && mentionCandidates.length > 0 && (
                    <div className="mention-menu">
                      {mentionCandidates.map(user => (
                        <button key={user.id} className="mention-option" onMouseDown={(e) => { e.preventDefault(); insertMention(user); }}>
                          <Avatar user={user} size={24} />
                          <span style={{ minWidth: 0 }}>
                            <span className="mention-name">{user.name}</span>
                            <span className="mention-title">{user.title}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <textarea ref={messageTextRef} value={newMessage} onChange={handleMessageChange}
                  onKeyDown={e => {
                    if (activeMention && mentionCandidates.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                      e.preventDefault();
                      insertMention(mentionCandidates[0]);
                      return;
                    }
                    if (e.key === "Escape" && activeMention) {
                      e.preventDefault();
                      setActiveMention(null);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Type a message... use @ to notify someone" rows={1}
                  style={{ width: "100%", borderRadius: 10, padding: "10px 14px", resize: "vertical", minHeight: 42, maxHeight: 180 }} />
                </div>
                {voiceRecorderState.active && (
                  <div className="voice-recording-strip">
                    <span className="voice-recording-dot" />
                    <strong>Recording</strong>
                    <span>{formatDuration(voiceRecorderState.seconds)} / {formatDuration(MAX_VOICE_NOTE_SECONDS)}</span>
                    <button type="button" className="voice-stop-button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); stopVoiceRecording(); }}>Stop recording</button>
                    <button type="button" onClick={cancelVoiceRecording}>Discard</button>
                  </div>
                )}
                {!voiceRecorderSupported && (
                  <div className="voice-recording-fallback">
                    Voice recording is not available in this browser. Attach an audio file instead.
                  </div>
                )}
              </div>
              <button onClick={sendMessage} title="Send message" aria-label="Send message" style={{ width: 36, height: 36, borderRadius: 8, background: newMessage.trim() || messageAttachments.length ? "var(--brand)" : "var(--accent-5)", color: newMessage.trim() || messageAttachments.length ? "#fff" : "var(--accent-7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: voiceRecorderState.active ? 0.65 : 1 }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
      {showBlockerModal && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget) setShowBlockerModal(false); }}>
          <div className="modal-content" style={{ width: "min(92vw, 420px)" }}>
            <div className="card-header"><Flag size={16} color="var(--error)" /><span className="text-md font-bold">Flag Blocker</span></div>
            <div style={{ padding: 16 }}>
              <textarea value={blockerDraft} onChange={e => setBlockerDraft(e.target.value)} rows={4} placeholder="Describe what is blocking this objective..." style={{ width: "100%", marginBottom: 12 }} autoFocus />
              <div className="flex gap-8 justify-between">
                <button className="btn btn-secondary" onClick={() => setShowBlockerModal(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmBlocker}>Flag Blocker</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {subtaskDeleteTarget && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget) setSubtaskDeleteTarget(null); }}>
          <div className="modal-content" style={{ width: "min(92vw, 420px)" }}>
            <div className="card-header"><Trash2 size={16} color="var(--error)" /><span className="text-md font-bold">Delete Subtask</span></div>
            <div style={{ padding: 16 }}>
              <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 12 }}>Delete "{subtaskDeleteTarget.title}" from this objective? This cannot be undone.</p>
              <div className="flex gap-8 justify-between">
                <button className="btn btn-secondary" onClick={() => setSubtaskDeleteTarget(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDeleteSubtask}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showDeleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 1300 }} onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
          <div className="modal-content" style={{ width: "min(92vw, 420px)" }}>
            <div className="card-header"><Trash2 size={16} color="var(--error)" /><span className="text-md font-bold">Delete Objective</span></div>
            <div style={{ padding: 16 }}>
              <p className="text-sm text-secondary" style={{ lineHeight: 1.5, marginBottom: 12 }}>This deletes the objective, messages, files, check-ins, subtasks, and activity. This cannot be undone.</p>
              <div className="flex gap-8 justify-between">
                <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => onDelete(localObj.id)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
};

// ============================================================================
// FILES TAB — Real Supabase Storage upload
// ============================================================================
const eventHasDraggedFiles = (event) => {
  const transfer = event.dataTransfer;
  if (!transfer) return false;
  if (Array.from(transfer.types || []).includes('Files')) return true;
  if (Array.from(transfer.items || []).some(item => item.kind === 'file')) return true;
  return (transfer.files?.length || 0) > 0;
};

const getDroppedFiles = (transfer) => {
  const fromFileList = Array.from(transfer?.files || []).filter(file => file?.name);
  if (fromFileList.length > 0) return fromFileList;
  return Array.from(transfer?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(Boolean);
};

const FilesTab = ({ objectiveId, files, addToast, onFileChange, uploadObjectiveFile, deleteObjectiveFile, currentUser, showAiLabels = false }) => {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const fileInputRef = useRef(null);
  const getFileIcon = (type) => ({ pdf: FileText, image: Image, spreadsheet: FileText, video: Film, audio: Music, archive: Archive, markdown: FileText, text: FileText }[type] || File);

  useEffect(() => {
    const preventBrowserFileOpen = (event) => {
      if (!eventHasDraggedFiles(event)) return;
      event.preventDefault();
    };
    window.addEventListener('dragover', preventBrowserFileOpen);
    window.addEventListener('drop', preventBrowserFileOpen);
    return () => {
      window.removeEventListener('dragover', preventBrowserFileOpen);
      window.removeEventListener('drop', preventBrowserFileOpen);
    };
  }, []);

  const uploadFiles = async (fileList) => {
    const nextFiles = Array.from(fileList || []).filter(file => file?.name);
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      if (!uploadObjectiveFile) throw new Error("Upload service is not configured.");
      for (const file of nextFiles) {
        await uploadObjectiveFile(objectiveId, file, { uploadedBy: currentUser?.id });
        addToast({ type: 'success', message: `"${file.name}" uploaded` });
      }
      onFileChange();
    } catch (err) {
      addToast({ type: 'error', message: `Upload failed: ${err.message}` });
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    if (!eventHasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    uploadFiles(getDroppedFiles(e.dataTransfer));
  };
  const handleDragOver = (e) => {
    if (!eventHasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  };
  const handleDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };

  return (
    <div
      className={`files-tab-panel ${dragOver ? 'drag-over' : ''}`}
      style={{ padding: "20px 24px" }}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FeatureHelp
        id="objective-files-preview"
        title="Files open as previews first"
        items={[
          "Click a file row to preview that exact attachment.",
          "Use the download icon only when you want a copy saved to your device.",
          "Drag files onto the dashed box or click it to attach from your computer.",
        ]}
      />
      {files.length === 0 && !uploading ? <EmptyState icon={Paperclip} text="No files attached yet." /> :
        files.map((f, i) => {
          const FIcon = getFileIcon(f.type);
          return (
            <div
              key={f.id || i}
              className="flex items-center gap-12 card card-hover"
              role="button"
              tabIndex={0}
              aria-label={`Preview ${f.name}`}
              onClick={() => setPreviewFile(f)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPreviewFile(f);
                }
              }}
              style={{ padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--brand-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><FIcon size={16} color="var(--brand)" /></div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div className="text-md font-medium">{f.name}</div>
                <div className="text-xs text-muted">{f.size} · {timeAgo(f.ts)}{f.generatedByAgent && showAiLabels ? " · Generated by Objective Assistant" : ""}</div>
              </div>
              <div className="flex gap-4">
                {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Download" onClick={(e) => e.stopPropagation()}><Download size={14} /></a>}
                {deleteObjectiveFile && <button className="icon-btn" onClick={async (e) => { e.stopPropagation(); await deleteObjectiveFile(f); addToast({ type: 'success', message: 'File removed' }); onFileChange(); }} title="Delete file"><Trash2 size={14} /></button>}
              </div>
            </div>
          );
        })}
      <input ref={fileInputRef} type="file" multiple hidden onChange={e => uploadFiles(e.target.files)} />
      <div
        className="card cursor-pointer file-dropzone"
        data-testid="objective-file-dropzone"
        style={{ marginTop: 16, border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--accent-5)'}`, textAlign: "center", padding: 24, color: dragOver ? 'var(--brand)' : 'var(--accent-7)', background: dragOver ? 'var(--brand-bg)' : 'transparent', transition: 'all 0.2s' }}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <><Loader2 size={18} style={{ margin: '0 auto 6px', animation: 'spin 1s linear infinite' }} /><div className="text-sm">Uploading...</div></>
          : <><Upload size={18} style={{ margin: "0 auto 6px" }} /><div className="text-sm">Drop files here or click to attach</div></>}
      </div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ============================================================================
// CREATE / EDIT OBJECTIVE MODAL
// ============================================================================
