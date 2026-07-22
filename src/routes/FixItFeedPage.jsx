import { useState, useRef, useEffect, Suspense } from 'react';

import { Search, ChevronDown, ChevronLeft, Target, CheckCircle2, AlertTriangle, Clock, AlertCircle, Building2, Activity, MessageSquare, Network, X, Filter, Layers, LayoutGrid, Columns3, Plus, UserPlus, Shield, Download, Upload, Settings, Users, BarChart3, FileText, Globe, Mail, Bell, Star, List, Edit3, Check, Paperclip, Send, Trash2, Loader2, Image, File as FileIcon, Wrench, Camera, RefreshCw, PieChart, MapPin, Sparkles, UserCircle, Calendar, DollarSign, GripVertical, Volume2, VolumeX, Radio, ClipboardCheck } from 'lucide-react';

import { getUser, timeAgo, DEPARTMENTS, DEFAULT_DEPARTMENT } from "../data";

import { Avatar, Badge } from "../uiPrimitives";

import { ProgressBar, KPICard, ObjectiveCard, EmptyState, FeatureHelp, FilePreviewModal, TagMentionControl } from "../sharedWidgets";



import { FieldKeyProvider, DefinedTerm, FieldKeyHint } from "../glossary";

import { ALT_COMPUTE_MODES, ALT_DASHBOARD_MODE, ALT_TIME_KEYS, DEFAULT_ALT_DASHBOARD_PREFS } from "../altDashboard";



import { KPI_STATUS_META } from "../kpiSystem";

import { OMP_DEPARTMENTS, OMP_DEPARTMENT_CLASSES, OKR_GROUP_TO_DEPARTMENT, OMP_RECURRENCE_REPEATS } from "../ompFramework";



const eventHasDraggedFiles = event => {
  const transfer = event.dataTransfer;
  if (!transfer) return false;
  if (Array.from(transfer.types || []).includes('Files')) return true;
  if (Array.from(transfer.items || []).some(item => item.kind === 'file')) return true;
  return (transfer.files?.length || 0) > 0;
};

const getDroppedFiles = transfer => {
  const fromFileList = Array.from(transfer?.files || []).filter(file => file?.name);
  if (fromFileList.length > 0) return fromFileList;
  return Array.from(transfer?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
};

const extensionForMime = (mimeType = '') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('plain')) return 'txt';
  return 'bin';
};

const nameClipboardFile = (file, index) => {
  if (file?.name) return file;
  const extension = extensionForMime(file?.type);
  return new File([file], `pasted-fix-it-${Date.now()}-${index + 1}.${extension}`, {
    type: file?.type || 'application/octet-stream',
    lastModified: Date.now()
  });
};

const getClipboardFiles = clipboardData => {
  const fromFileList = Array.from(clipboardData?.files || []).filter(Boolean);
  const fromItems = Array.from(clipboardData?.items || []).filter(item => item.kind === 'file').map(item => item.getAsFile()).filter(Boolean);
  const files = fromFileList.length > 0 ? fromFileList : fromItems;
  return files.map(nameClipboardFile);
};

const FIXIT_COMMON_FILE_ACCEPT = ['image/*', 'application/pdf', 'text/*', '.txt', '.md', '.csv', '.json', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.mp3', '.m4a', '.wav', '.mp4', '.mov'].join(',');

// ============================================================================
// FIX-IT FEED — beta feedback wall
// ============================================================================
const FIX_IT_STATUS = {
  open: {
    label: 'Open',
    color: '#ff7f02'
  },
  in_progress: {
    label: 'In progress',
    color: '#3B82F6'
  },
  fixed: {
    label: 'Fixed',
    color: '#10B981'
  },
  agent_done: {
    label: 'Validation complete',
    color: '#10B981'
  },
  archived: {
    label: 'Archived',
    color: '#64748B'
  }
};

const FIX_IT_AGENT_AVATAR_URL = '/avatars/thrawn-agent-avatar.png';

const isFixItAgentUser = user => {
  const identity = `${user?.email || ''} ${user?.name || ''}`.toLowerCase();
  return identity.includes('andrew@ndai.pro') || identity.includes('andrew emmel') || identity.includes('andrewemmel');
};

const getFixItDisplayUser = user => isFixItAgentUser(user) ? {
  ...user,
  name: 'Agent',
  initials: 'AG',
  avatar_url: FIX_IT_AGENT_AVATAR_URL,
  color: '#07111f'
} : user;

const getFixItActorName = (user, currentUser, {
  allowYou = true
} = {}) => {
  if (!user) return 'Unknown';
  if (isFixItAgentUser(user)) return 'Agent';
  if (allowYou && currentUser?.id && user.id === currentUser.id) return 'you';
  return user.name || 'Unknown';
};

const ValidationProofModal = ({
  post,
  currentUser,
  canModerate,
  onClose,
  onUploadProof
}) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);
  const proof = post?.validationProof;
  const agentUser = proof?.uploadedBy ? getUser(proof.uploadedBy) : post?.agentTestedBy ? getUser(post.agentTestedBy) : null;
  const proofActor = getFixItActorName(agentUser, currentUser, {
    allowYou: false
  });
  if (!post) return null;
  const handleProofFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await onUploadProof(post.id, file, currentUser.id);
    } catch {
      // Toast handling lives in the page-level upload wrapper.
    } finally {
      setUploading(false);
    }
  };
  return <div className="modal-overlay" onClick={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
      <div className="modal-content validation-proof-modal">
        <div className="card-header">
          <button type="button" className="validation-proof-back" onClick={onClose}>
            <ChevronLeft size={16} />
            Back to Fix-It Feed
          </button>
          <Camera size={16} color="var(--brand)" />
          <span className="text-md font-bold" style={{
          flex: 1
        }}>Validation proof</span>
          <button className="icon-btn" onClick={onClose} title="Close validation proof"><X size={16} /></button>
        </div>
        <div className="validation-proof-body">
          <div className="validation-proof-summary">
            <div className="fixit-claimed fixit-fixed-by fixit-validation-pill-static">
              <CheckCircle2 size={14} />
              <span>Fixed by Agent; validation complete</span>
            </div>
            <p>
              {proof ? `Proof captured by ${proofActor} ${timeAgo(proof.ts)}.` : 'No screenshot proof has been attached to this validation yet.'}
            </p>
          </div>
          {proof?.url ? <div className="validation-proof-frame">
              <img src={proof.url} alt={proof.name || 'Validation proof screenshot'} />
            </div> : <div className="validation-proof-empty">
              <Camera size={36} />
              <strong>Proof screenshot missing</strong>
              <p>Attach the Agent validation screenshot before human archive when proof is required.</p>
            </div>}
          {canModerate && <div className="validation-proof-actions">
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleProofFile} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {proof ? 'Replace proof' : 'Add proof screenshot'}
              </button>
              <button type="button" className="btn btn-primary btn-sm validation-proof-done" onClick={onClose}>
                Done
              </button>
            </div>}
          {!canModerate && <div className="validation-proof-actions">
              <button type="button" className="btn btn-primary btn-sm validation-proof-done" onClick={onClose}>
                Done
              </button>
            </div>}
        </div>
      </div>
    </div>;
};

const FixItCommentComposer = ({
  post,
  currentUser,
  onCreateComment,
  setPreviewFile,
  addToast
}) => {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const addFiles = fileList => {
    const incoming = Array.from(fileList || []).filter(file => file?.name);
    if (incoming.length === 0) return;
    setFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) next.push(file);
      });
      return next;
    });
  };
  const handleDrop = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    addFiles(getDroppedFiles(event.dataTransfer));
  };
  const handleDragOver = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const handlePaste = event => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    addFiles(pastedFiles);
    addToast?.({
      type: 'success',
      message: pastedFiles.length === 1 ? 'Pasted file added to reply' : `${pastedFiles.length} pasted files added to reply`
    });
  };
  const submit = async () => {
    if (!body.trim() && files.length === 0) {
      addToast?.({
        type: 'error',
        message: 'Add a reply or file before posting.'
      });
      return;
    }
    setPosting(true);
    try {
      await onCreateComment({
        postId: post.id,
        body,
        files,
        userId: currentUser.id
      });
      setBody('');
      setFiles([]);
      addToast?.({
        type: 'success',
        message: 'Reply added to this Fix-It item'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not add reply'
      });
    } finally {
      setPosting(false);
    }
  };
  const author = getUser(post.createdBy);
  const replyName = author?.name?.split(' ')?.[0] || 'this item';
  return <div className={`fixit-comment-composer ${dragOver ? 'drag-over' : ''}`} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onPaste={handlePaste}>
      <Avatar user={getFixItDisplayUser(currentUser)} size={26} />
      <div className="fixit-comment-compose-body">
        <textarea value={body} onChange={event => setBody(event.target.value)} rows={2} placeholder={`Reply to ${replyName}...`} className="fixit-comment-textarea" />
        {files.length > 0 && <div className="fixit-comment-files">
            {files.map((file, index) => <button key={`${file.name}-${file.size}-${index}`} type="button" className="fixit-file-chip" onClick={() => setPreviewFile({
          name: file.name,
          type: file.type?.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type,
          file
        })}>
                <Paperclip size={12} />
                <span>{file.name}</span>
                <X size={12} onClick={event => {
            event.stopPropagation();
            setFiles(prev => prev.filter((_, i) => i !== index));
          }} />
              </button>)}
          </div>}
        <input ref={fileInputRef} type="file" multiple hidden accept={FIXIT_COMMON_FILE_ACCEPT} onChange={event => addFiles(event.target.files)} />
        <div className="fixit-comment-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => fileInputRef.current?.click()}>
            <Upload size={12} /> Files
          </button>
          <span>Drop or paste screenshots, PDFs, Office docs, audio, or notes.</span>
          <button type="button" className="btn btn-primary btn-xs" onClick={submit} disabled={posting}>
            {posting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reply
          </button>
        </div>
      </div>
    </div>;
};

const FixItFeedPage = ({
  posts,
  currentUser,
  onCreatePost,
  onCreateComment,
  onDeleteComment,
  onUpdatePost,
  onUploadValidationProof,
  onDeletePost,
  addToast,
  variant = 'page',
  focusPostId = null,
}) => {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [validationPostId, setValidationPostId] = useState(null);
  const [deleteConfirmPost, setDeleteConfirmPost] = useState(null);
  const [view, setView] = useState('active');
  const fileInputRef = useRef(null);
  const moderatorEmails = ['mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'];
  const currentEmail = (currentUser?.email || '').toLowerCase();
  const canModerate = currentUser?.role === 'executive' || moderatorEmails.includes(currentEmail);
  const activePosts = posts.filter(post => post.status !== 'archived');
  const archivedPosts = posts.filter(post => post.status === 'archived');
  const visiblePosts = view === 'archive' ? archivedPosts : activePosts;
  const validationPost = posts.find(post => post.id === validationPostId) || null;
  const activeCount = activePosts.length;
  const isRail = variant === 'rail';
  useEffect(() => {
    const preventBrowserFileOpen = event => {
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
  useEffect(() => {
    if (!focusPostId) return undefined;
    const focusedPost = posts.find(post => post.id === focusPostId);
    if (!focusedPost) return undefined;
    setView(focusedPost.status === 'archived' ? 'archive' : 'active');
    const timer = window.setTimeout(() => {
      document.getElementById(`fixit-post-${focusPostId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [focusPostId, posts]);
  const addFiles = fileList => {
    const incoming = Array.from(fileList || []).filter(file => file?.name);
    if (incoming.length === 0) return;
    setFiles(prev => {
      const seen = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      incoming.forEach(file => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) next.push(file);
      });
      return next;
    });
  };
  const handleDrop = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    addFiles(getDroppedFiles(event.dataTransfer));
  };
  const handleDragOver = event => {
    if (!eventHasDraggedFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };
  const handlePaste = event => {
    const pastedFiles = getClipboardFiles(event.clipboardData);
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    addFiles(pastedFiles);
    addToast?.({
      type: 'success',
      message: pastedFiles.length === 1 ? 'Pasted file added' : `${pastedFiles.length} pasted files added`
    });
  };
  const submit = async () => {
    if (!body.trim() && files.length === 0) {
      addToast?.({
        type: 'error',
        message: 'Add a note, screenshot, or file before posting.'
      });
      return;
    }
    setPosting(true);
    try {
      await onCreatePost({
        body,
        files,
        userId: currentUser.id
      });
      setBody('');
      setFiles([]);
      addToast?.({
        type: 'success',
        message: 'Posted to the Fix-It Feed'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not post to the Fix-It Feed'
      });
    } finally {
      setPosting(false);
    }
  };
  const claim = async post => {
    try {
      await onUpdatePost(post.id, {
        status: 'in_progress',
        claimedBy: currentUser.id
      });
      addToast?.({
        type: 'success',
        message: "Marked as yours. You're on it."
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not claim this fix'
      });
    }
  };
  const markFixed = async post => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'agent_done',
        claimedBy: post.claimedBy || currentUser.id,
        agentTestedBy: currentUser.id,
        agentTestedAt: now
      });
      addToast?.({
        type: 'success',
        message: 'Marked fixed and validation complete'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not mark fixed'
      });
    }
  };
  const uploadValidationProof = async (postId, file, userId) => {
    try {
      await onUploadValidationProof(postId, file, userId);
      setValidationPostId(postId);
      addToast?.({
        type: 'success',
        message: 'Validation proof screenshot saved'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not save validation proof'
      });
      throw error;
    }
  };
  const archivePost = async post => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'archived',
        humanReviewedBy: currentUser.id,
        humanReviewedAt: now,
        archivedBy: currentUser.id,
        archivedAt: now
      });
      setView('archive');
      addToast?.({
        type: 'success',
        message: 'Human reviewed and archived'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not archive this item'
      });
    }
  };
  const reopen = async post => {
    try {
      const now = new Date().toISOString();
      await onUpdatePost(post.id, {
        status: 'open',
        claimedBy: null,
        agentTestedBy: null,
        agentTestedAt: null,
        humanReviewedBy: null,
        humanReviewedAt: null,
        archivedBy: null,
        archivedAt: null,
        reopenedBy: currentUser.id,
        reopenedAt: now,
        reopenCount: (post.reopenCount || 0) + 1,
        reopenedFromStatus: post.status
      });
      setView('active');
      addToast?.({
        type: 'success',
        message: 'Reopened'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not reopen this item'
      });
    }
  };
  const deletePost = async post => {
    try {
      await onDeletePost(post);
      setDeleteConfirmPost(null);
      addToast?.({
        type: 'success',
        message: 'Fix-It Feed item deleted'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not delete this item'
      });
    }
  };
  const deleteComment = async comment => {
    try {
      await onDeleteComment(comment);
      addToast?.({
        type: 'success',
        message: 'Comment deleted'
      });
    } catch (error) {
      addToast?.({
        type: 'error',
        message: error.message || 'Could not delete this comment'
      });
    }
  };
  const attachmentIcon = file => {
    if (file.type === 'image' || (file.mimeType || '').startsWith('image/')) return Image;
    if (file.type === 'pdf' || file.type === 'text' || file.type === 'markdown') return FileText;
    return File;
  };
  return <div className={`fixit-page ${isRail ? 'fixit-page-rail' : ''}`}>
      {!isRail && <div className="fixit-header">
        <div>
          <div className="flex items-center gap-8">
            <Wrench size={20} color="var(--brand)" />
            <h1 className="fixit-title">Fix-It Feed</h1>
          </div>
          <p className="text-sm text-muted" style={{
          marginTop: 4
        }}>
            Chronological beta feedback wall. No DMs, no guessing, no algorithm.
          </p>
        </div>
        <div className="fixit-counter">
          <span className="text-2xl font-bold">{activeCount}</span>
          <span className="text-xs text-muted">active</span>
        </div>
      </div>}

      {!isRail && <FeatureHelp id="fix-it-feed" title="How to use the Fix-It Feed" items={["Post screenshots, photos, PDFs, or notes when something needs fixed or clarified.", "Items stay in strict newest-first order so testers can see what is already flagged.", "Agent marks items fixed and validated; click the validation pill to review screenshot proof."]} />}

      <div className="fixit-tabs" role="tablist" aria-label="Fix-It Feed views">
        <button type="button" className={`fixit-tab ${view === 'active' ? 'active' : ''}`} onClick={() => setView('active')} role="tab" aria-selected={view === 'active'}>
          Active <span>{activePosts.length}</span>
        </button>
        <button type="button" className={`fixit-tab ${view === 'archive' ? 'active' : ''}`} onClick={() => setView('archive')} role="tab" aria-selected={view === 'archive'}>
          Archive <span>{archivedPosts.length}</span>
        </button>
      </div>

      {view === 'active' && <div className={`card fixit-composer ${dragOver ? 'drag-over' : ''}`} onDragEnter={handleDragOver} onDragOver={handleDragOver} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onPaste={handlePaste}>
        <div className="fixit-composer-top">
          <Avatar user={getFixItDisplayUser(currentUser)} size={34} />
          <textarea value={body} onChange={event => setBody(event.target.value)} placeholder="Flag something to fix, clarify, or improve..." rows={3} className="fixit-textarea" />
        </div>
        {files.length > 0 && <div className="fixit-selected-files">
            {files.map((file, index) => <button key={`${file.name}-${file.size}-${index}`} type="button" className="fixit-file-chip" onClick={() => setPreviewFile({
          name: file.name,
          type: file.type?.startsWith('image/') ? 'image' : 'file',
          mimeType: file.type,
          file
        })}>
                <Paperclip size={12} />
                <span>{file.name}</span>
                <X size={12} onClick={event => {
            event.stopPropagation();
            setFiles(prev => prev.filter((_, i) => i !== index));
          }} />
              </button>)}
          </div>}
        <input ref={fileInputRef} type="file" multiple hidden accept={FIXIT_COMMON_FILE_ACCEPT} onChange={event => addFiles(event.target.files)} />
        <div className="fixit-composer-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Add files
          </button>
          <div className="fixit-drop-hint">Drop or paste screenshots, photos, PDFs, or notes anywhere on this box.</div>
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={posting}>
            {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post
          </button>
        </div>
      </div>}

      <div className="fixit-feed-list">
        {visiblePosts.length === 0 ? <EmptyState icon={Wrench} text={view === 'archive' ? 'No human-reviewed Fix-It items are archived yet.' : 'Nothing active has been flagged yet.'} /> : visiblePosts.map(post => {
        const author = getUser(post.createdBy);
        const claimedUser = post.claimedBy ? getUser(post.claimedBy) : null;
        const agentTestedUser = post.agentTestedBy ? getUser(post.agentTestedBy) : claimedUser;
        const humanReviewedUser = post.humanReviewedBy ? getUser(post.humanReviewedBy) : null;
        const reopenedUser = post.reopenedBy ? getUser(post.reopenedBy) : null;
        const status = FIX_IT_STATUS[post.status] || FIX_IT_STATUS.open;
        const canClose = canModerate || post.claimedBy === currentUser.id || post.createdBy === currentUser.id;
        const canDelete = canModerate || post.createdBy === currentUser.id;
        const claimedName = getFixItActorName(claimedUser, currentUser);
        const fixedName = getFixItActorName(claimedUser, currentUser);
        const testedName = getFixItActorName(agentTestedUser, currentUser, {
          allowYou: false
        });
        const reviewedName = getFixItActorName(humanReviewedUser, currentUser);
        const reopenedName = getFixItActorName(reopenedUser, currentUser);
        const reopenedFromLabel = post.reopenedFromStatus === 'archived' ? 'archive' : post.reopenedFromStatus === 'agent_done' ? 'validation' : post.reopenedFromStatus === 'fixed' ? 'fixed' : 'prior status';
        return <article id={`fixit-post-${post.id}`} data-fixit-post-id={post.id} key={post.id} className={`card fixit-post fixit-post-${post.status} ${post.reopenedAt ? 'fixit-post-reopened' : ''} ${focusPostId === post.id ? 'fixit-post-focused' : ''}`}>
              <div className="fixit-post-head">
                <div className="flex items-center gap-10">
                  <Avatar user={author} size={32} />
                  <div>
                    <div className="text-sm font-bold">{author.name}</div>
                    <div className="text-xs text-muted">{timeAgo(post.createdAt)}</div>
                  </div>
                </div>
                <div className="fixit-status-badges">
                  {post.comments?.length > 0 && <Badge color="var(--accent-7)">{post.comments.length} repl{post.comments.length === 1 ? 'y' : 'ies'}</Badge>}
                  {post.reopenedAt && <Badge color="#ff7f02">Reopened</Badge>}
                  <Badge color={status.color}>{status.label}</Badge>
                </div>
              </div>
              {post.reopenedAt && <div className="fixit-reopened-banner">
                  <RefreshCw size={13} />
                  <span>
                    Reopened from {reopenedFromLabel}{post.reopenCount > 1 ? ` (${post.reopenCount}x)` : ''}
                    {reopenedUser ? ` by ${reopenedName}` : ''} {timeAgo(post.reopenedAt)}.
                  </span>
                </div>}
              {post.body && <p className="fixit-post-body">{post.body}</p>}
              {post.attachments?.length > 0 && <div className="fixit-attachments">
                  {post.attachments.map(file => {
              const Icon = attachmentIcon(file);
              return <button key={file.id} type="button" className="fixit-attachment" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.name}`}>
                        <Icon size={16} color="var(--brand)" />
                        <span>{file.name}</span>
                        <small>{file.size}</small>
                      </button>;
            })}
                </div>}
              <div className="fixit-post-actions">
                {post.status === 'fixed' || post.status === 'agent_done' ? <button type="button" className={`fixit-claimed fixit-fixed-by fixit-validation-pill ${post.validationProof ? 'has-proof' : 'missing-proof'}`} onClick={() => setValidationPostId(post.id)} title="Open validation proof">
                    <CheckCircle2 size={13} />
                    {agentTestedUser && <Avatar user={getFixItDisplayUser(agentTestedUser)} size={20} />}
                    <span>{claimedUser ? `Fixed by ${fixedName}; validation complete` : `${testedName} validation complete`}</span>
                  </button> : post.status === 'archived' ? <div className="fixit-claimed fixit-archived">
                    <CheckCircle2 size={13} />
                    {humanReviewedUser && <Avatar user={humanReviewedUser} size={20} />}
                    <span>{humanReviewedUser ? `Human reviewed by ${reviewedName}` : 'Human reviewed'}</span>
                  </div> : claimedUser ? <div className="fixit-claimed">
                    <Avatar user={getFixItDisplayUser(claimedUser)} size={20} />
                    <span>{claimedName === 'you' ? "You're on it" : `${claimedName} is on it`}</span>
                  </div> : <button type="button" className="btn btn-secondary btn-xs" onClick={() => claim(post)}>
                    <UserPlus size={12} /> I'm on it
                  </button>}
                {['open', 'in_progress'].includes(post.status) && canClose && <button type="button" className="btn btn-xs btn-primary" onClick={() => markFixed(post)}>
                    <Check size={12} /> Mark fixed
                  </button>}
                {['fixed', 'agent_done'].includes(post.status) && canModerate && <button type="button" className="fixit-archive-btn" onClick={() => archivePost(post)}>
                    archive
                  </button>}
                {post.status !== 'open' && canClose && <button type="button" className="btn btn-xs btn-secondary" onClick={() => reopen(post)}>
                    Reopen
                  </button>}
                {canDelete && <button type="button" className="icon-btn fixit-delete-trigger" onClick={() => setDeleteConfirmPost(post)} title="Delete item">
                    <Trash2 size={14} />
                  </button>}
              </div>
              {post.comments?.length > 0 && <div className="fixit-comments">
                  <div className="fixit-comments-label">
                    <MessageSquare size={13} />
                    <span>Task comments</span>
                  </div>
                  {post.comments.map(comment => {
              const commenter = getUser(comment.createdBy);
              const isAgentComment = isFixItAgentUser(commenter);
              const displayCommenter = getFixItDisplayUser(commenter);
              const canDeleteComment = onDeleteComment && (canModerate || comment.createdBy === currentUser.id);
              const trueAuthorLabel = commenter?.name && commenter.name !== 'Unknown' ? `Agent reply via ${commenter.name}` : 'Agent reply';
              return <div key={comment.id} className={`fixit-comment ${isAgentComment ? 'fixit-comment-agent' : ''}`}>
                        <Avatar user={displayCommenter} size={26} />
                        <div className="fixit-comment-bubble">
                          <div className="fixit-comment-meta">
                            <strong>{isAgentComment ? 'Agent' : commenter.name}</strong>
                            {isAgentComment && <span className="fixit-agent-comment-badge" title={trueAuthorLabel}>Agent reply</span>}
                            <span>{timeAgo(comment.createdAt)}</span>
                            {canDeleteComment && <button type="button" className="fixit-comment-delete" onClick={() => deleteComment(comment)} title="Delete comment" aria-label="Delete comment">
                                <Trash2 size={12} />
                              </button>}
                          </div>
                          {comment.body && <p>{comment.body}</p>}
                          {comment.attachments?.length > 0 && <div className="fixit-attachments fixit-comment-attachments">
                              {comment.attachments.map(file => {
                      const Icon = attachmentIcon(file);
                      return <button key={file.id} type="button" className="fixit-attachment" onClick={() => setPreviewFile(file)} aria-label={`Preview ${file.name}`}>
                                    <Icon size={15} color="var(--brand)" />
                                    <span>{file.name}</span>
                                    <small>{file.size}</small>
                                  </button>;
                    })}
                            </div>}
                        </div>
                      </div>;
            })}
                </div>}
              {view === 'active' && onCreateComment && <FixItCommentComposer post={post} currentUser={currentUser} onCreateComment={onCreateComment} setPreviewFile={setPreviewFile} addToast={addToast} />}
            </article>;
      })}
      </div>
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <ValidationProofModal post={validationPost} currentUser={currentUser} canModerate={canModerate} onClose={() => setValidationPostId(null)} onUploadProof={uploadValidationProof} />
      {deleteConfirmPost && <div className="modal-overlay" onClick={event => {
      if (event.target === event.currentTarget) setDeleteConfirmPost(null);
    }}>
          <div className="modal-content fixit-delete-modal">
            <div className="card-header">
              <Trash2 size={16} color="var(--error)" />
              <span className="text-md font-bold">Delete Fix-It item</span>
            </div>
            <div style={{
          padding: 16
        }}>
              <p className="text-sm text-secondary" style={{
            lineHeight: 1.5,
            marginBottom: 14
          }}>
                Delete this Fix-It Feed item and all attached files? This cannot be undone.
              </p>
              <div className="flex justify-end gap-8">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDeleteConfirmPost(null)}>Cancel</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => deletePost(deleteConfirmPost)}>
                  <Trash2 size={13} /> Delete item
                </button>
              </div>
            </div>
          </div>
        </div>}
    </div>;
};

export default FixItFeedPage;
