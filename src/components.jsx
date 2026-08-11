import { useState, useEffect, useLayoutEffect, useRef, Component } from 'react';
import {
  X, Send, Paperclip, Check, AlertTriangle, Clock, MessageSquare,
  Activity, Zap, Calendar, ChevronDown, Download, Upload, FileText,
  Image, File, Film, Music, Archive, TrendingUp, Layers, ArrowLeft,
  Target, CheckCircle2, Building2, Plus, Edit3, Trash2, Flag, Loader2, Mic,
  Sparkles, AlertCircle, Users, UserPlus, HelpCircle, Bell, Home, Smartphone, SmilePlus, Languages,
  ThumbsUp, Wrench, Handshake
} from 'lucide-react';
import { getUser, getProfiles, getDirectReports, getStatusColor, getStatusLabel, formatDate, formatObjectiveTimestamp, timeAgo, isOverdue, STATUS_CONFIG, DEFAULT_DEPARTMENT, getDepartmentOptions, isObjectiveAssignedToUser } from './data';
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
  getProjectStageMeta,
  getProjectHealthMeta,
  buildProjectGateBlockers,
  canAdvanceProjectStage,
} from './okrFramework';

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
export const ObjectiveFormModal = ({ objectives, assignmentGroups = [], currentUser, onSave, onClose, editObj = null }) => {
  const formDraftKey = `sandpro-objective-form-draft-${currentUser.id}`;
  const savedDraft = editObj ? null : (() => {
    try { return JSON.parse(window.localStorage.getItem(formDraftKey) || "null"); } catch { return null; }
  })();
  const normalizedInitialOkrLevel = getAssumedOkrLevel(editObj || { okrLevel: savedDraft?.okrLevel || OKR_ASSUMED_FALLBACK_LEVEL });
  const [title, setTitle] = useState(editObj?.title || savedDraft?.title || "");
  const [description, setDescription] = useState(editObj?.description || savedDraft?.description || "");
  const [priority, setPriority] = useState(editObj?.priority || savedDraft?.priority || "medium");
  const [dueDate, setDueDate] = useState(editObj?.dueDate ? new Date(editObj.dueDate).toISOString().split("T")[0] : savedDraft?.dueDate || "");
  const [ownerId, setOwnerId] = useState(editObj?.ownerId || savedDraft?.ownerId || currentUser.id);
  const [assignmentMode, setAssignmentMode] = useState(editObj?.assignmentGroupId || savedDraft?.assignmentGroupId ? "group" : "person");
  const [assignmentGroupId, setAssignmentGroupId] = useState(editObj?.assignmentGroupId || savedDraft?.assignmentGroupId || "");
  const [parentId, setParentId] = useState(editObj?.parentId || savedDraft?.parentId || "");
  const [department, setDepartment] = useState(editObj?.department || savedDraft?.department || currentUser.department || DEFAULT_DEPARTMENT);
  const [type, setType] = useState(editObj?.type || savedDraft?.type || "simple");
  const [okrLevel, setOkrLevel] = useState(normalizedInitialOkrLevel);
  const [okrPeriod, setOkrPeriod] = useState(editObj?.okrPeriod || savedDraft?.okrPeriod || getCurrentOkrPeriod());
  const [okrWeight, setOkrWeight] = useState(editObj?.okrWeight ?? savedDraft?.okrWeight ?? 1);
  const [measurementCadence, setMeasurementCadence] = useState(editObj?.measurementCadence || savedDraft?.measurementCadence || "monthly");
  const [metricUnit, setMetricUnit] = useState(editObj?.metricUnit ?? savedDraft?.metricUnit ?? "");
  const [baselineMetric, setBaselineMetric] = useState(editObj?.baselineMetric ?? savedDraft?.baselineMetric ?? "");
  const [targetMetric, setTargetMetric] = useState(editObj?.targetMetric ?? savedDraft?.targetMetric ?? "");
  const [currentMetric, setCurrentMetric] = useState(editObj?.currentMetric ?? savedDraft?.currentMetric ?? "");
  const [rollupMethod, setRollupMethod] = useState(editObj?.rollupMethod || savedDraft?.rollupMethod || "average");
  const [titleError, setTitleError] = useState(false);
  const [requiredFieldErrors, setRequiredFieldErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeDescriptionMention, setActiveDescriptionMention] = useState(null);
  const [selectedDescriptionMentionIds, setSelectedDescriptionMentionIds] = useState([]);
  const [pendingDescriptionCursor, setPendingDescriptionCursor] = useState(null);
  const descriptionRef = useRef(null);

  const isDelegation = assignmentMode === "person" && ownerId !== currentUser.id;
  const allUsers = getProfiles();
  const availableOwners = currentUser.role === "executive" ? allUsers : currentUser.role === "manager" ? [currentUser, ...getDirectReports(currentUser.id)] : [currentUser];
  const descriptionMentionCandidates = findMentionCandidates(
    allUsers,
    activeDescriptionMention?.query || "",
    currentUser.id,
    [assignmentMode === "person" ? ownerId : null, ...(editObj?.members || []).map(member => member.userId)]
  );

  useLayoutEffect(() => {
    if (pendingDescriptionCursor === null) return;
    descriptionRef.current?.focus();
    descriptionRef.current?.setSelectionRange(pendingDescriptionCursor, pendingDescriptionCursor);
    setPendingDescriptionCursor(null);
  }, [description, pendingDescriptionCursor]);

  useEffect(() => {
    if (editObj) return;
    const draft = { title, description, priority, dueDate, ownerId, assignmentMode, assignmentGroupId, parentId, department, type, okrLevel, okrPeriod, okrWeight, measurementCadence, metricUnit, baselineMetric, targetMetric, currentMetric, rollupMethod };
    try { window.localStorage.setItem(formDraftKey, JSON.stringify(draft)); } catch {
      // Drafts are best effort and should never block objective creation.
    }
  }, [assignmentGroupId, assignmentMode, baselineMetric, currentMetric, department, description, dueDate, editObj, formDraftKey, measurementCadence, metricUnit, okrLevel, okrPeriod, okrWeight, ownerId, parentId, priority, rollupMethod, targetMetric, title, type]);

  const hasDraftContent = !editObj && Boolean(
    title.trim() ||
    description.trim() ||
    dueDate ||
    parentId ||
    priority !== "medium" ||
    ownerId !== currentUser.id ||
    department !== currentUser.department ||
    type !== "simple" ||
    okrLevel !== OKR_ASSUMED_FALLBACK_LEVEL ||
    okrPeriod !== getCurrentOkrPeriod() ||
    Number(okrWeight) !== 1 ||
    measurementCadence !== "monthly" ||
    metricUnit ||
    baselineMetric !== "" ||
    targetMetric !== "" ||
    currentMetric !== "" ||
    rollupMethod !== "average"
  );

  useEffect(() => {
    if (!hasDraftContent) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasDraftContent]);

  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    setDescription(value);
    setActiveDescriptionMention(getActiveMention(value, e.target.selectionStart ?? value.length));
  };

  const selectOkrLevel = (value) => {
    setOkrLevel(value);
    if (value === "key_result") {
      setType("measured");
      setRollupMethod("manual");
    }
    if (value === "company" || value === "department") setType("parent");
    if (value === "run_the_business" && type === "parent") setType("simple");
    setRequiredFieldErrors([]);
  };

  const insertDescriptionMention = (user) => {
    if (!activeDescriptionMention) return;
    const nextDescription = insertMentionText(description, activeDescriptionMention, user);
    const nextCursor = activeDescriptionMention.start + user.name.length + 2;
    setDescription(nextDescription);
    setSelectedDescriptionMentionIds(prev => prev.includes(user.id) ? prev : [...prev, user.id]);
    setActiveDescriptionMention(null);
    setPendingDescriptionCursor(nextCursor);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) { setTitleError(true); return; }
    const requiredErrors = [];
    if (assignmentMode === "person" && !ownerId) requiredErrors.push("Owner is required.");
    if (assignmentMode === "group" && !assignmentGroupId) requiredErrors.push("Rotating group is required.");
    if (["company", "department", "key_result"].includes(okrLevel) && !okrPeriod.trim()) requiredErrors.push("Period is required for OKR work.");
    if (["department", "key_result"].includes(okrLevel) && !parentId) requiredErrors.push(okrLevel === "key_result" ? "Key Results need a parent OKR." : "Department OKRs need a Company OKR parent.");
    if (okrLevel === "key_result") {
      if (baselineMetric === "" || currentMetric === "" || targetMetric === "") requiredErrors.push("Key Results need baseline, current, and target values.");
      if (!metricUnit.trim()) requiredErrors.push("Key Results need a unit.");
      if (!measurementCadence) requiredErrors.push("Key Results need an update cadence.");
    }
    if (requiredErrors.length) {
      setRequiredFieldErrors(requiredErrors);
      return;
    }
    setRequiredFieldErrors([]);
    setTitleError(false);
    const obj = {
      ...(editObj ? { id: editObj.id } : {}),
      title: title.trim(),
      description,
      descriptionMentionIds: getMentionedUsers(description, selectedDescriptionMentionIds, allUsers, currentUser.id).map(user => user.id),
      priority,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      ownerId: assignmentMode === "person" ? ownerId : null,
      assignmentGroupId: assignmentMode === "group" ? assignmentGroupId : null,
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
      type,
      okrLevel,
      okrPeriod,
      okrWeight: Number(okrWeight) || 1,
      classificationStatus: "manual",
      classificationConfidence: 1,
      classificationReason: "Set manually in objective form.",
      baselineMetric: baselineMetric === "" ? null : Number(baselineMetric),
      targetMetric: targetMetric === "" ? null : Number(targetMetric),
      currentMetric: currentMetric === "" ? null : Number(currentMetric),
      metricUnit,
      measurementCadence,
      rollupMethod,
      startDate: editObj?.startDate || null,
      messages: editObj?.messages || [],
      updates: editObj?.updates || (editObj ? [] : [{ ts: new Date().toISOString(), status: "not_started", progress: 0, note: "Objective created" }]),
    };
    setSaving(true);
    try {
      const saved = await onSave(obj);
      if (saved !== false && !editObj) writeDraft(formDraftKey, "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content objective-form-modal" data-testid="objective-form-modal" style={{ width: "min(95vw, 560px)", maxHeight: "85vh" }}>
        <div className="card-header">
          <Plus size={16} color="var(--brand)" />
          <span className="text-md font-bold">{editObj ? "Edit Objective" : "New Objective"}</span>
          <div style={{ flex: 1 }} />
          {!editObj && <span className="text-xs text-muted">Draft autosaved</span>}
          <button className="icon-btn" onClick={onClose} aria-label="Close objective form"><X size={18} /></button>
        </div>
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }} className="objective-form-body flex flex-col gap-16">
          <div>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Title *</label>
            <input value={title} onChange={e => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }} placeholder="What needs to be done?" style={{ width: "100%", borderColor: titleError ? "#EF4444" : undefined, boxShadow: titleError ? "0 0 0 1px #EF4444" : undefined }} autoFocus />
            {titleError && <div style={{ color: "#EF4444", fontSize: 12, marginTop: 4 }}>Title is required</div>}
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Description</label>
            <div style={{ position: "relative" }}>
              {activeDescriptionMention && descriptionMentionCandidates.length > 0 && (
                <div className="mention-menu" style={{ bottom: "auto", top: "calc(100% + 6px)" }}>
                  {descriptionMentionCandidates.map(user => (
                    <button key={user.id} className="mention-option" onMouseDown={(e) => { e.preventDefault(); insertDescriptionMention(user); }}>
                      <Avatar user={user} size={24} />
                      <span style={{ minWidth: 0 }}>
                        <span className="mention-name">{user.name}</span>
                        <span className="mention-title">{user.title}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={handleDescriptionChange}
                onKeyDown={e => {
                  if (activeDescriptionMention && descriptionMentionCandidates.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                    e.preventDefault();
                    insertDescriptionMention(descriptionMentionCandidates[0]);
                    return;
                  }
                  if (e.key === "Escape" && activeDescriptionMention) {
                    e.preventDefault();
                    setActiveDescriptionMention(null);
                  }
                }}
                placeholder="Add details... use @ to mention teammates"
                rows={3}
                style={{ width: "100%" }}
              />
            </div>
            <div className="text-xs text-muted" style={{ marginTop: 5 }}>Use @name to assign teammates and notify them when the objective is saved.</div>
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
              {assignmentGroups.length > 0 && (
                <div className="flex gap-4" style={{ marginBottom: 6 }}>
                  <button type="button" className={`btn btn-xs ${assignmentMode === "person" ? "btn-primary" : "btn-secondary"}`} onClick={() => setAssignmentMode("person")}>Person</button>
                  <button type="button" className={`btn btn-xs ${assignmentMode === "group" ? "btn-primary" : "btn-secondary"}`} onClick={() => setAssignmentMode("group")}>Rotating group</button>
                </div>
              )}
              {assignmentMode === "group" ? (
                <select value={assignmentGroupId} onChange={e => setAssignmentGroupId(e.target.value)} style={{ width: "100%" }}>
                  <option value="">Select a rotating group…</option>
                  {assignmentGroups.filter(group => group.isActive !== false).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              ) : (
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} style={{ width: "100%" }}>
                  {availableOwners.map(u => <option key={u.id} value={u.id}>{u.name} — {u.title}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Department</label>
              <select value={department} onChange={e => setDepartment(e.target.value)} style={{ width: "100%" }}>
                {getDepartmentOptions(department).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tracking Type</label>
              <select value={type} onChange={e => setType(e.target.value)} style={{ width: "100%" }}>
                <option value="simple">Simple objective</option>
                <option value="measured">Measured objective</option>
                <option value="monthly">Monthly improvement</option>
                <option value="narrative">Narrative update</option>
                <option value="parent">Parent objective</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted" style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Progress Calculation</label>
              <select value={rollupMethod} onChange={e => setRollupMethod(e.target.value)} style={{ width: "100%" }}>
                <option value="average">Average supporting work</option>
                <option value="weighted">Weighted by work importance</option>
                <option value="manual">Manual leadership update</option>
              </select>
            </div>
          </div>
          <div className="objective-form-section">
            <div className="project-section-heading">
              <div>
                <strong>Work Classification</strong>
                <span>Separate from progress calculation; drives OKR hierarchy, KR freshness, and project gates.</span>
              </div>
              {editObj?.classificationStatus !== "manual" && <Badge color="#F59E0B">Confirm category if needed</Badge>}
            </div>
            <div className="objective-classification-grid">
              <label>
                <span className={["company", "department", "key_result"].includes(okrLevel) ? "required-label" : ""}>Classification</span>
                <select value={okrLevel} onChange={event => selectOkrLevel(event.target.value)}>
                  {OKR_LEVELS.map(level => <option key={level.id} value={level.id}>{level.label}</option>)}
                </select>
              </label>
              <label>
                <span className={["company", "department", "key_result"].includes(okrLevel) ? "required-label" : ""}>Period</span>
                <input value={okrPeriod} onChange={event => setOkrPeriod(event.target.value)} placeholder="2026-Q2" />
              </label>
              <label>
                <span>Weight</span>
                <input type="number" min="0" step="0.1" value={okrWeight} onChange={event => setOkrWeight(event.target.value)} />
              </label>
              <label>
                <span>Update cadence</span>
                <select value={measurementCadence} onChange={e => setMeasurementCadence(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>
            </div>
            {requiredFieldErrors.length > 0 && (
              <div className="objective-required-errors">
                {requiredFieldErrors.map(error => <span key={error}><AlertTriangle size={12} /> {error}</span>)}
              </div>
            )}
          </div>
          <div className="text-xs text-muted" style={{ marginTop: -10 }}>
            Use automatic calculation when the objective has linked supporting work. Use manual when leadership will update the percentage directly.
          </div>
          {(["measured", "monthly"].includes(type) || okrLevel === "key_result") && (
            <div className="card" style={{ padding: 12 }}>
              <div className="text-xs font-semibold text-muted" style={{ textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Metric Target</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                <input className={okrLevel === "key_result" ? "required-input" : ""} type="number" value={baselineMetric} onChange={e => setBaselineMetric(e.target.value)} placeholder="Baseline" />
                <input className={okrLevel === "key_result" ? "required-input" : ""} type="number" value={currentMetric} onChange={e => setCurrentMetric(e.target.value)} placeholder="Current" />
                <input className={okrLevel === "key_result" ? "required-input" : ""} type="number" value={targetMetric} onChange={e => setTargetMetric(e.target.value)} placeholder="Target" />
                <input className={okrLevel === "key_result" ? "required-input" : ""} value={metricUnit} onChange={e => setMetricUnit(e.target.value)} placeholder="Unit" />
                <select value={measurementCadence} onChange={e => setMeasurementCadence(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className={`text-xs font-semibold text-muted ${["department", "key_result"].includes(okrLevel) ? "required-label" : ""}`} style={{ display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Parent Objective {["department", "key_result"].includes(okrLevel) ? "*" : "(optional)"}</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">None — top-level objective</option>
              {objectives.filter(o => o.id !== editObj?.id).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid var(--accent-5)" }} className="objective-form-actions flex justify-between">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</> : editObj ? "Save Changes" : isDelegation ? "Delegate Objective" : "Create Objective"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// ERROR BOUNDARY — catches render crashes so we never black-screen
// ============================================================================
export class BriefErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('[DailyBrief] render error:', error, info);
    // Auto-dismiss after a short beat so the user always has an exit
    if (this.props.onDismiss) {
      setTimeout(() => this.props.onDismiss(), 50);
    }
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ============================================================================
// DAILY BRIEF — "The SandPro Daily" newspaper overlay
// ============================================================================
const safeUser = (id) => {
  try {
    const u = getUser(id);
    if (u && u.name) return u;
  } catch { /* noop */ }
  return { id: id || 'unknown', name: 'Unassigned', initials: '—', color: '#94A3B8' };
};

// The SandPro Daily's below-the-fold section, "for the time being" (Andrew,
// Aug 11): the top fold stays title + numbers; below the break, New Features.
// STANDING RULE: every user-visible change ships with an entry here.
const DAILY_NEW_FEATURES = [
  {
    date: 'Aug 11',
    title: 'Leads: your Monday crew brief (starts Monday)',
    body: 'Every lead gets one email at 6:00 AM each Monday: what slipped, what is due this week, and what your crew closed — each line opens the item in OMP. No login needed to read it.',
  },
  {
    date: 'Aug 11',
    title: 'A phone layout built for thumbs',
    body: 'On your phone: a bottom bar puts Tasks, OKR, NCR, Org, and the big + New under your thumb; your own work opens first; task rows complete with one tap; and on the NCR page the camera button leads. Built for gloves and sunlight.',
  },
  {
    date: 'Aug 11',
    title: 'Works with zero bars: the outbox',
    body: 'Create a task or file an NCR (photos included) with no signal. It saves to your outbox — the chip in the corner shows what is waiting — and sends itself the moment you are back online.',
  },
  {
    date: 'Aug 11',
    title: 'Search everything — one keystroke',
    body: 'Press Cmd/Ctrl+K anywhere, or tap the magnifier in the top bar: tasks, NCRs, projects, people, and pages, found as you type. Arrow keys to move, Enter to open.',
  },
  {
    date: 'Aug 11',
    title: 'Four big buttons: All, Tasks, Projects, NCRs',
    body: 'Pick what you are looking at with one tap. The count on each button always equals exactly what the list below shows.',
  },
  {
    date: 'Aug 10',
    title: 'Old KPA records are out of your way',
    body: 'Legacy imports from the old system no longer flood your login. They live behind the dashed "Legacy imports" chip — one click shows them, one click puts them away.',
  },
  {
    date: 'Aug 10',
    title: 'The app updates itself',
    body: 'When we ship a fix, your session picks it up on its own the next time you switch away. Nobody will ever be asked to "try refreshing" again.',
  },
  {
    date: 'Aug 10',
    title: 'Error messages you can actually read',
    body: 'Problems now show in plain English and stay on screen for ten seconds — long enough to read, screenshot, and send.',
  },
  {
    date: 'Aug 10',
    title: 'NCR fixes across the board',
    body: 'Creating an NCR works everywhere again, the long-text section of the form is properly laid out, and closeout edits now save every field.',
  },
];

const DAILY_BULLETIN = {
  id: '2026-06-24-company-wide-launch',
  iosSteps: [
    'Open objectivetracker.net in Safari.',
    'Tap Share, then Add to Home Screen.',
    'Open SandPro OMP from the new Home Screen icon.',
    'Tap Enable push notifications in the app and allow notifications.',
  ],
  androidSteps: [
    'Open objectivetracker.net in Chrome.',
    'Tap the install prompt or the menu, then Install app.',
    'Open SandPro OMP from the app icon.',
    'Tap Enable push notifications in the app and allow notifications.',
  ],
};

export const DailyBrief = ({ objectives, currentUser, onDismiss, onOpenCard, onOpenFilter }) => {
  // Guarantee escape works even if something deeper fails
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onDismiss]);

  // Defensive defaults — never let a missing prop crash the overlay
  const objs = Array.isArray(objectives) ? objectives : [];
  const me = currentUser || {};

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const editionNum = Math.floor((today - new Date(today.getFullYear(), 0, 1)) / 86400000) + 1;
  const bulletin = DAILY_BULLETIN;

  // Computed data for the brief
  const myObjectives = objs.filter(o => o && isObjectiveAssignedToUser(o, me.id) && o.status !== 'completed' && o.status !== 'cancelled');
  const allActive = objs.filter(o => o && o.status !== 'completed' && o.status !== 'cancelled');
  const overdue = allActive.filter(o => { try { return isOverdue(o); } catch { return false; } });
  const blocked = allActive.filter(o => o.blockerFlag || o.status === 'blocked');
  const atRisk = allActive.filter(o => o.status === 'at_risk');
  const dueSoon = allActive.filter(o => {
    if (!o.dueDate) return false;
    const d = new Date(o.dueDate);
    if (isNaN(d.getTime())) return false;
    const n = new Date();
    return d > n && d < new Date(n.getTime() + 7 * 86400000);
  });
  const onTrack = allActive.filter(o => o.status === 'on_track').length;

  const isExec = me.role === 'executive';
  const isManager = me.role === 'manager';
  let directReports = [];
  try { directReports = getDirectReports(me.id) || []; } catch { directReports = []; }

  // Lead story — most critical item
  const leadItem = blocked[0] || overdue[0] || dueSoon[0] || myObjectives[0];

  // Priorities — user's objectives sorted by urgency
  const priorities = [...myObjectives].sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const aOverdue = (() => { try { return isOverdue(a) ? -10 : 0; } catch { return 0; } })();
    const bOverdue = (() => { try { return isOverdue(b) ? -10 : 0; } catch { return 0; } })();
    return (aOverdue + (priorityOrder[a.priority] || 3)) - (bOverdue + (priorityOrder[b.priority] || 3));
  }).slice(0, 5);

  const taggedToMe = allActive.filter(o => !isObjectiveAssignedToUser(o, me.id) && (o.members || []).some(member => member.userId === me.id));
  const needsSupportingTag = allActive.filter(o => o.ownerId === me.id && (o.members || []).length === 0).slice(0, 5);
  const staleObjectives = allActive.filter(o => {
    const activityDates = [
      ...(o.messages || []).map(m => m.ts),
      ...(o.updates || []).map(u => u.ts),
    ].filter(Boolean).map(d => new Date(d).getTime()).filter(Number.isFinite);
    if (activityDates.length === 0) return true;
    return Math.max(...activityDates) < today.getTime() - 7 * 86400000;
  }).slice(0, 5);
  const dailyObjectiveLinks = [...new Map([
    leadItem,
    ...priorities,
    ...taggedToMe,
    ...dueSoon,
    ...needsSupportingTag,
    ...staleObjectives,
  ].filter(Boolean).map(obj => [obj.id, obj])).values()].slice(0, 6);

  const openObjective = (objective, tab = "details") => {
    if (!objective || !onOpenCard) return;
    onDismiss();
    onOpenCard(objective, tab);
  };

  const openObjectiveFilter = (preset) => {
    if (!onOpenFilter) return;
    onDismiss();
    onOpenFilter(preset);
  };

  const renderObjectiveBriefItem = (obj, {
    tab = "details",
    dotColor = null,
    meta = "",
    className = "",
  } = {}) => {
    if (!obj) return null;
    let color = dotColor || 'var(--accent-7)';
    if (!dotColor) {
      try { color = getStatusColor(obj.status); } catch { color = 'var(--accent-7)'; }
    }
    const metaText = typeof meta === 'function' ? meta(obj) : meta;
    return (
      <button
        key={obj.id}
        type="button"
        className={`brief-item brief-item-action ${className}`.trim()}
        onClick={() => openObjective(obj, tab)}
        aria-label={`Open objective: ${obj.title}`}
      >
        <div className="brief-item-dot" style={{ background: color }} />
        <div className="brief-item-body">
          <div className="brief-item-title">{obj.title}</div>
          <div className="objective-timestamp-line">{formatObjectiveTimestamp(obj)}</div>
          {metaText && <div className="brief-item-meta">{metaText}</div>}
        </div>
      </button>
    );
  };

  const operatingBrief = (() => {
    if (blocked.length > 0) return `${blocked.length} objective${blocked.length === 1 ? '' : 's'} blocked. Clear the blocker first, then update the owner or tag the teammate who can move it.`;
    if (overdue.length > 0) return `${overdue.length} objective${overdue.length === 1 ? ' is' : 's are'} overdue. Start with the oldest overdue item and either reset the date or record the next action.`;
    if (needsSupportingTag.length > 0) return `${needsSupportingTag.length} objective${needsSupportingTag.length === 1 ? '' : 's'} you own have no supporting teammate tagged. Tag the person most likely to help before the work stalls.`;
    if (dueSoon.length > 0) return `${dueSoon.length} objective${dueSoon.length === 1 ? '' : 's'} due this week. Confirm the next action and make sure each one has the right teammate attached.`;
    if (taggedToMe.length > 0) return `You have been tagged on ${taggedToMe.length} objective${taggedToMe.length === 1 ? '' : 's'}. Review those before creating new work.`;
    if (allActive.length === 0) return "No active objectives are open. This is a good time to create the next leadership objective and assign the first owner.";
    return "No urgent blockers or overdue items are showing. Use today to tighten next actions, tag support where needed, and keep active objectives moving.";
  })();

  const getLeadText = () => {
    if (!leadItem) return "All objectives are progressing smoothly across the organization. No immediate action items require your attention this morning.";
    const owner = safeUser(leadItem.ownerId);
    if (leadItem.blockerFlag || leadItem.status === 'blocked') {
      return `${leadItem.title} has been flagged as blocked${leadItem.blockerReason ? ` — "${leadItem.blockerReason}"` : ''}. This ${leadItem.priority || 'active'}-priority objective requires immediate attention to clear the path forward. Owner: ${owner.name}.`;
    }
    let itemIsOverdue = false;
    try { itemIsOverdue = isOverdue(leadItem); } catch { /* noop */ }
    if (itemIsOverdue && leadItem.dueDate) {
      const days = Math.abs(Math.floor((new Date(leadItem.dueDate) - new Date()) / 86400000));
      return `${leadItem.title} is now ${days} day${days !== 1 ? 's' : ''} past its target date with ${leadItem.progress || 0}% completion. This ${leadItem.priority || 'active'}-priority objective needs a status review and updated timeline.`;
    }
    let statusLabel = 'in progress';
    try { statusLabel = getStatusLabel(leadItem.status).toLowerCase(); } catch { /* noop */ }
    return `${leadItem.title} is currently ${statusLabel} at ${leadItem.progress || 0}% completion. ${leadItem.priority === 'critical' ? 'As a critical-priority objective, it warrants close monitoring today.' : 'Steady progress continues toward the target date.'}`;
  };

  return (
    <div className="brief-overlay" onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="brief-paper">
        <button className="brief-close" onClick={onDismiss}><X size={16} /></button>

        {/* Masthead */}
        <div className="brief-masthead">
          <div className="brief-flag">The SandPro Daily</div>
          <div className="brief-dateline">{dateStr}</div>
          <div className="brief-edition">Vol. 1 &middot; No. {editionNum} &middot; {me.department || 'Company'} Edition &middot; Prepared for {me.name || 'You'}</div>
        </div>

        {/* Stats strip */}
        <div style={{ padding: '0 28px' }}>
          <div className="brief-stats">
            <button
              type="button"
              className="brief-stat brief-stat-action"
              onClick={() => openObjectiveFilter({ label: "Active", activeOnly: true, scope: "all" })}
              aria-label="Open active objectives"
            >
              <div className="brief-stat-val">{allActive.length}</div>
              <div className="brief-stat-label">Active</div>
            </button>
            <button
              type="button"
              className="brief-stat brief-stat-action"
              onClick={() => openObjectiveFilter({ label: "On Track", status: "on_track", scope: "all" })}
              aria-label="Open on track objectives"
            >
              <div className="brief-stat-val" style={{ color: 'var(--success)' }}>{onTrack}</div>
              <div className="brief-stat-label">On Track</div>
            </button>
            <button
              type="button"
              className="brief-stat brief-stat-action"
              onClick={() => openObjectiveFilter({ label: "At Risk", status: "at_risk", scope: "all" })}
              aria-label="Open at risk objectives"
            >
              <div className="brief-stat-val" style={{ color: 'var(--warning)' }}>{atRisk.length}</div>
              <div className="brief-stat-label">At Risk</div>
            </button>
            <button
              type="button"
              className="brief-stat brief-stat-action"
              onClick={() => openObjectiveFilter({ label: "Blocked", status: "blocked", scope: "all" })}
              aria-label="Open blocked objectives"
            >
              <div className="brief-stat-val" style={{ color: 'var(--error)' }}>{blocked.length}</div>
              <div className="brief-stat-label">Blocked</div>
            </button>
            <button
              type="button"
              className="brief-stat brief-stat-action"
              onClick={() => openObjectiveFilter({ label: "Past Due", overdue: true, activeOnly: true, scope: "all" })}
              aria-label="Open past due objectives"
            >
              <div className="brief-stat-val" style={{ color: 'var(--warning)' }}>{overdue.length}</div>
              <div className="brief-stat-label">Past Due</div>
            </button>
          </div>
          <FeatureHelp
            id="daily-brief"
            title={bulletin ? "Using SandPro Daily" : "Using the Daily Brief"}
            items={[
              bulletin
                ? "SandPro Daily is the team bulletin board for release notes, operating notes, and setup guidance."
                : "Start with the lead story, then open only the items that need action today.",
              bulletin
                ? "Install the PWA from Safari or Chrome to unlock the best mobile layout and push setup path."
                : "Tagged To You means someone attached you to the objective or mentioned you.",
              bulletin
                ? "Push alerts are a quiet heads-up layer; the bell remains the permanent notification home."
                : "Needs An Update points to work that should get a quick note before it goes stale.",
            ]}
          />
        </div>

        <hr className="brief-rule-thick" />

        {/* Body */}
        <div className="brief-body">
          {bulletin ? (
            <div className="brief-bulletin">
              <div className="brief-section-head">New Features</div>
              <h2 className="brief-headline brief-bulletin-headline">What changed in your OMP</h2>
              <div className="brief-byline">Shipped and verified on production &middot; updated {dateStr}</div>
              <div className="brief-features">
                {DAILY_NEW_FEATURES.map(feature => (
                  <div className="brief-feature" key={feature.title}>
                    <span className="brief-feature-date">{feature.date}</span>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="brief-install-panel">
                <div>
                  <div className="brief-section-head">Install For Full Mobile Functionality</div>
                  <div className="brief-install-columns">
                    <div>
                      <h3>iPhone Safari</h3>
                      <ol>
                        {bulletin.iosSteps.map(step => <li key={step}>{step}</li>)}
                      </ol>
                    </div>
                    <div>
                      <h3>Android Chrome</h3>
                      <ol>
                        {bulletin.androidSteps.map(step => <li key={step}>{step}</li>)}
                      </ol>
                    </div>
                  </div>
                </div>
              </div>

              <div className="brief-pwa-graphic" aria-label="Comparison of mobile browser and installed PWA">
                <div className="brief-pwa-graphic-title">Mobile Browser vs Installed PWA</div>
                <div className="brief-pwa-columns">
                  <div className="brief-pwa-column">
                    <div className="brief-pwa-device">
                      <div className="brief-pwa-browser-bar" />
                      <Smartphone size={28} />
                    </div>
                    <h3>Mobile Browser</h3>
                    <p>Good for quick check-ins.</p>
                    <span>Runs inside Safari or Chrome</span>
                    <span>Address bar and browser controls stay visible</span>
                    <span>Push setup is limited, especially on iPhone</span>
                  </div>
                  <div className="brief-pwa-divider" />
                  <div className="brief-pwa-column brief-pwa-column-primary">
                    <div className="brief-pwa-device">
                      <Home size={28} />
                      <div className="brief-pwa-app-dot" />
                    </div>
                    <h3>Installed PWA</h3>
                    <p>Best SandPro OMP experience.</p>
                    <span>Launches from a Home Screen app icon</span>
                    <span>Uses the mobile app shell without browser clutter</span>
                    <span>Enables the cleanest push notification setup path</span>
                  </div>
                </div>
              </div>

              {dailyObjectiveLinks.length > 0 && (
                <div className="brief-objective-panel">
                  <div className="brief-section-head">Objective Links</div>
                  <p className="brief-body-text brief-objective-intro">
                    Tap any objective below to open the live objective card.
                  </p>
                  <div className="brief-objective-list">
                    {dailyObjectiveLinks.map(obj => renderObjectiveBriefItem(obj, {
                      tab: (taggedToMe.some(item => item.id === obj.id) || staleObjectives.some(item => item.id === obj.id)) ? "messages" : "details",
                      meta: () => {
                        let label = obj.status || 'Active';
                        let due = obj.dueDate ? formatDate(obj.dueDate) : 'No due date';
                        try { label = getStatusLabel(obj.status); } catch { /* noop */ }
                        try { due = obj.dueDate ? formatDate(obj.dueDate) : 'No due date'; } catch { /* noop */ }
                        return `${label} · ${obj.progress || 0}% · ${safeUser(obj.ownerId).name} · ${due}`;
                      },
                    }))}
                  </div>
                </div>
              )}
            </div>
          ) : (
          <div className="brief-columns">
            {/* Main column */}
            <div className="brief-col-main">
              {/* Lead Story */}
              <div className="brief-section-head">Lead Story</div>
              <h2 className="brief-headline">
                {leadItem ? (
                  leadItem.blockerFlag ? `Blocker Alert: ${leadItem.title}` :
                  isOverdue(leadItem) ? `Overdue: ${leadItem.title}` :
                  leadItem.title
                ) : "All Systems Operational"}
              </h2>
              <div className="brief-byline">
                {isExec ? 'Organization-Wide Report' : isManager ? `${me.department || 'Team'} Team Report` : `${me.department || 'Contributor'} Contributor Report`} &middot; {today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
              <p className="brief-body-text">{getLeadText()}</p>

              {/* Your Priorities */}
              {priorities.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div className="brief-section-head">Your Priorities Today</div>
                  {priorities.map(obj => {
                    let color = 'var(--accent-7)', label = obj.status || '—', date = 'No due date';
                    try { color = getStatusColor(obj.status); } catch { color = 'var(--accent-7)'; }
                    try { label = getStatusLabel(obj.status); } catch { label = obj.status || '—'; }
                    try { date = obj.dueDate ? formatDate(obj.dueDate) : 'No due date'; } catch { date = 'No due date'; }
                    return renderObjectiveBriefItem(obj, {
                      tab: "details",
                      dotColor: color,
                      meta: `${label} · ${obj.progress || 0}% · ${date}`,
                    });
                  })}
                </div>
              )}
            </div>

            {/* Side column */}
            <div className="brief-col-side">
              {/* Deadlines This Week */}
              <div className="brief-section-head">Deadlines This Week</div>
              {dueSoon.length === 0 ? (
                <p className="brief-body-text" style={{ fontSize: 12, fontStyle: 'italic' }}>No deadlines in the next 7 days.</p>
              ) : (
                dueSoon.slice(0, 4).map(obj => {
                  let date = '—';
                  try { date = formatDate(obj.dueDate); } catch { date = '—'; }
                  return renderObjectiveBriefItem(obj, {
                    tab: "details",
                    dotColor: 'var(--warning)',
                    meta: `${date} · ${safeUser(obj.ownerId).name}`,
                  });
                })
              )}

              {taggedToMe.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="brief-section-head">Tagged To You</div>
                  {taggedToMe.slice(0, 4).map(obj => renderObjectiveBriefItem(obj, {
                    tab: "messages",
                    dotColor: 'var(--brand)',
                    meta: `${safeUser(obj.ownerId).name} owns · ${formatDate(obj.dueDate)}`,
                  }))}
                </div>
              )}

              {needsSupportingTag.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="brief-section-head">Needs A Supporting Tag</div>
                  {needsSupportingTag.slice(0, 4).map(obj => renderObjectiveBriefItem(obj, {
                    tab: "details",
                    dotColor: 'var(--brand)',
                    meta: `No teammate tagged yet · ${formatDate(obj.dueDate)}`,
                  }))}
                </div>
              )}

              {staleObjectives.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="brief-section-head">Needs An Update</div>
                  {staleObjectives.slice(0, 3).map(obj => renderObjectiveBriefItem(obj, {
                    tab: "messages",
                    dotColor: 'var(--accent-7)',
                    meta: "No recent update recorded",
                  }))}
                </div>
              )}

              {/* Team Pulse (manager/exec) */}
              {(isExec || isManager) && directReports.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="brief-section-head">{isExec ? 'Organization Pulse' : 'Team Pulse'}</div>
                  {(() => {
                    let pool = [];
                    try { pool = isExec ? (getProfiles() || []).filter(u => u.role === 'manager') : directReports; } catch { pool = directReports; }
                    return pool.slice(0, 5);
                  })().map(person => {
                    const pObjs = objs.filter(o => o.ownerId === person.id && o.status !== 'completed');
                    const pIssues = pObjs.filter(o => {
                      try { return o.status === 'at_risk' || o.status === 'blocked' || isOverdue(o); } catch { return false; }
                    }).length;
                    return (
                      <div key={person.id} className="brief-item">
                        <Avatar user={person} size={22} />
                        <div className="brief-item-body">
                          <div className="brief-item-title">{person.name}</div>
                          <div className="brief-item-meta">
                            {pObjs.length} active{pIssues > 0 ? ` · ${pIssues} need${pIssues === 1 ? 's' : ''} attention` : ' · all clear'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Operating Brief */}
              <div className="brief-ai-box" style={{ marginTop: 16 }}>
                <div className="brief-ai-label">
                  <Activity size={12} />
                  Operating Brief
                </div>
                <div className="brief-ai-text">{operatingBrief}</div>
              </div>
            </div>
          </div>
          )}

          {/* CTA */}
          <button className="brief-cta" onClick={onDismiss}>
            Begin Your Day
          </button>
        </div>
      </div>
    </div>
  );
};
