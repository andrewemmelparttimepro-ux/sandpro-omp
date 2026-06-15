import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import {
  Archive,
  Bold,
  CheckSquare,
  ChevronLeft,
  FileText,
  Folder,
  FolderPlus,
  Heading1,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MoreHorizontal,
  Paperclip,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Share,
  Sidebar,
  Table2,
  Target,
  Trash2,
  Underline as UnderlineIcon,
  X,
} from 'lucide-react';
import { formatDate } from './data';
import {
  ALT_NOTES_EDITOR_EMPTY_DOC,
  ALT_NOTES_SYSTEM_FOLDERS,
  buildAltNoteFolderCounts,
  extractAltNotePlainText,
  filterAltNotes,
  groupAltNotesByDate,
  normalizeAltNotesState,
  previewAltNoteText,
} from './altNotes';

const NOTE_GUIDE_VERSION = 'sandpro-alt-notes-guide-2026-06-14';
const EMPTY_ALT_NOTES_ITEMS = [];

const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
    },
  }),
  Placeholder.configure({
    placeholder: 'Start writing...',
  }),
  TaskList,
  TaskItem.configure({
    nested: true,
  }),
  CharacterCount.configure({
    limit: 20000,
  }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
];

const isRealFolderId = (id, folders) => folders.some(folder => folder.id === id);

const statusText = {
  idle: 'Ready',
  dirty: 'Unsaved',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Error',
};

const getGuideKey = (userId) => `${NOTE_GUIDE_VERSION}:${userId || 'anon'}`;

const fileSizeLabel = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getTransferFiles = (transfer) => {
  const direct = Array.from(transfer?.files || []).filter(Boolean);
  if (direct.length) return direct;
  return Array.from(transfer?.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter(Boolean);
};

const groupFolderRows = (folders, counts) => folders
  .slice()
  .sort((left, right) => (left.sortOrder - right.sortOrder) || left.name.localeCompare(right.name))
  .map(folder => ({ ...folder, count: counts.folders.get(folder.id) || 0 }));

const objectiveLabel = (objective) => objective?.title || 'Linked objective';

const noteContentSignature = (title, bodyJson) => JSON.stringify({
  title: String(title || '').trim(),
  bodyJson: bodyJson || ALT_NOTES_EDITOR_EMPTY_DOC,
});

const NoteToolbarButton = ({ active = false, disabled = false, title, onClick, children }) => (
  <button
    type="button"
    className={active ? 'active' : ''}
    disabled={disabled}
    title={title}
    aria-label={title}
    onClick={onClick}
  >
    {children}
  </button>
);

const AltNotesGuide = ({ onDismiss }) => (
  <div className="alt-notes-guide" role="note">
    <div>
      <strong>Notes are private to you.</strong>
      <p>Use formatting, checklists, attachments, and objective links. Everything autosaves as you work.</p>
    </div>
    <button type="button" onClick={onDismiss} aria-label="Dismiss Notes guide">
      <X size={15} />
    </button>
  </div>
);

const AltNotesSidebar = ({
  folders,
  counts,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  showGuide,
  onDismissGuide,
}) => {
  const customFolders = groupFolderRows(folders, counts);
  const systemCount = (id) => counts[id] || 0;
  return (
    <aside className="alt-notes-sidebar">
      <div className="alt-notes-window-dots" aria-hidden="true">
        <span className="red" />
        <span className="yellow" />
        <span className="green" />
      </div>
      {showGuide ? <AltNotesGuide onDismiss={onDismissGuide} /> : null}
      <nav className="alt-notes-folder-nav" aria-label="Notes folders">
        <button
          type="button"
          className={selectedFolderId === 'quick' ? 'active soft' : ''}
          onClick={() => onSelectFolder('all')}
        >
          <FileText size={17} />
          <span>Quick Notes</span>
          <b>{systemCount('all')}</b>
        </button>
        <button
          type="button"
          className={selectedFolderId === 'objective' ? 'active soft' : ''}
          onClick={() => onSelectFolder('objective')}
        >
          <Target size={17} />
          <span>Objective Links</span>
          <b>{systemCount('objective')}</b>
        </button>
        <button
          type="button"
          className={selectedFolderId === 'pinned' ? 'active soft' : ''}
          onClick={() => onSelectFolder('pinned')}
        >
          <Pin size={17} />
          <span>Pinned</span>
          <b>{systemCount('pinned')}</b>
        </button>
      </nav>
      <div className="alt-notes-sidebar-section">
        <span>iCloud</span>
        <button
          type="button"
          className={selectedFolderId === 'all' ? 'active' : ''}
          onClick={() => onSelectFolder('all')}
        >
          <Folder size={17} />
          <span>All Notes</span>
          <b>{systemCount('all')}</b>
        </button>
        {customFolders.map(folder => (
          <button
            key={folder.id}
            type="button"
            className={selectedFolderId === folder.id ? 'active' : ''}
            onClick={() => onSelectFolder(folder.id)}
          >
            <Folder size={17} />
            <span>{folder.name}</span>
            <b>{folder.count}</b>
          </button>
        ))}
      </div>
      <div className="alt-notes-sidebar-actions">
        <button type="button" onClick={onCreateFolder}>
          <FolderPlus size={17} />
          <span>New Folder</span>
        </button>
        <button
          type="button"
          className={selectedFolderId === 'trash' ? 'active' : ''}
          onClick={() => onSelectFolder('trash')}
        >
          <Trash2 size={17} />
          <span>Recently Deleted</span>
          <b>{systemCount('trash')}</b>
        </button>
      </div>
    </aside>
  );
};

const AltNotesList = ({
  groups,
  selectedNoteId,
  selectedFolderLabel,
  totalCount,
  search,
  onSearch,
  onSelect,
  onNewNote,
  onBack,
}) => (
  <section className="alt-notes-list-pane">
    <header className="alt-notes-list-header">
      <button type="button" className="alt-notes-mobile-back" onClick={onBack} aria-label="Back to folders">
        <ChevronLeft size={18} />
      </button>
      <div>
        <strong>{selectedFolderLabel}</strong>
        <span>{totalCount} note{totalCount === 1 ? '' : 's'}</span>
      </div>
      <button type="button" onClick={onNewNote} aria-label="New note">
        <Plus size={18} />
      </button>
    </header>
    <label className="alt-notes-search">
      <Search size={17} />
      <input
        type="search"
        value={search}
        placeholder="Search"
        onChange={(event) => onSearch(event.target.value)}
      />
    </label>
    <div className="alt-notes-list">
      {groups.length === 0 ? (
        <div className="alt-notes-empty-list">
          <FileText size={24} />
          <strong>No matching notes</strong>
          <span>Create a note or clear the search.</span>
        </div>
      ) : groups.map(group => (
        <div key={group.id} className="alt-notes-date-group">
          <h3>{group.label}</h3>
          {group.notes.map(note => (
            <button
              key={note.id}
              type="button"
              className={selectedNoteId === note.id ? 'active' : ''}
              onClick={() => onSelect(note.id)}
            >
              <strong>{note.title}</strong>
              <span>
                {new Date(note.lastEditedAt || note.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' '}
                {previewAltNoteText(note.plainText || note.preview, 58)}
              </span>
              <small>
                <Folder size={13} />
                Notes
                {note.objectiveId ? ' · Objective' : ''}
              </small>
            </button>
          ))}
        </div>
      ))}
    </div>
  </section>
);

const AltNotesEditorToolbar = ({ editor, onAttach, onLinkObjective, onArchive, onDelete, onRestore, noteDeleted }) => (
  <div className="alt-notes-editor-toolbar" aria-label="Note editor toolbar">
    <div className="alt-notes-toolbar-group">
      <NoteToolbarButton title="Heading" active={editor?.isActive('heading', { level: 1 })} disabled={!editor} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Bold" active={editor?.isActive('bold')} disabled={!editor} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Italic" active={editor?.isActive('italic')} disabled={!editor} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Underline" active={editor?.isActive('underline')} disabled={!editor} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon size={18} />
      </NoteToolbarButton>
    </div>
    <div className="alt-notes-toolbar-group">
      <NoteToolbarButton title="Checklist" active={editor?.isActive('taskList')} disabled={!editor} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <CheckSquare size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Bulleted list" active={editor?.isActive('bulletList')} disabled={!editor} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Numbered list" active={editor?.isActive('orderedList')} disabled={!editor} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Table" disabled={!editor} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 size={18} />
      </NoteToolbarButton>
    </div>
    <div className="alt-notes-toolbar-group">
      <NoteToolbarButton title="Link" active={editor?.isActive('link')} disabled={!editor} onClick={() => {
        const currentUrl = editor.getAttributes('link').href || '';
        if (currentUrl) {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        const { from, to } = editor.state.selection;
        const selectedText = editor.state.doc.textBetween(from, to, ' ').trim();
        if (/^(https?:\/\/|mailto:)/i.test(selectedText)) {
          editor.chain().focus().extendMarkRange('link').setLink({ href: selectedText }).run();
          return;
        }
        editor.chain().focus().insertContent('https://').run();
      }}>
        <LinkIcon size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Attach file" onClick={onAttach}>
        <Paperclip size={18} />
      </NoteToolbarButton>
      <NoteToolbarButton title="Link objective" onClick={onLinkObjective}>
        <Target size={18} />
      </NoteToolbarButton>
    </div>
    <div className="alt-notes-toolbar-group alt-notes-toolbar-danger">
      {noteDeleted ? (
        <NoteToolbarButton title="Restore note" onClick={onRestore}>
          <RotateCcw size={18} />
        </NoteToolbarButton>
      ) : (
        <NoteToolbarButton title="Archive note" onClick={onArchive}>
          <Archive size={18} />
        </NoteToolbarButton>
      )}
      <NoteToolbarButton title={noteDeleted ? 'Delete forever' : 'Delete note'} onClick={onDelete}>
        <Trash2 size={18} />
      </NoteToolbarButton>
    </div>
  </div>
);

export const AltNotesPopup = ({
  open,
  currentUser,
  objectives = [],
  notesStore,
  notesState,
  onNotesStateChange,
  onClose,
}) => {
  const userId = currentUser?.id;
  const state = useMemo(() => normalizeAltNotesState(notesState), [notesState]);
  const [selectedFolderId, setSelectedFolderId] = useState(state.selectedFolderId);
  const [search, setSearch] = useState(state.search);
  const [selectedNoteId, setSelectedNoteId] = useState(state.selectedNoteId);
  const [mobilePane, setMobilePane] = useState('folders');
  const [saveState, setSaveState] = useState('idle');
  const [title, setTitle] = useState('');
  const [bodyJson, setBodyJson] = useState(ALT_NOTES_EDITOR_EMPTY_DOC);
  const [dirty, setDirty] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef(null);
  const hydratingRef = useRef(false);
  const hydratedNoteIdRef = useRef(null);
  const notesStoreRef = useRef(notesStore);
  const saveTimerRef = useRef(null);
  const activeNoteIdRef = useRef(null);
  const titleRef = useRef('');
  const bodyJsonRef = useRef(ALT_NOTES_EDITOR_EMPTY_DOC);
  const latestLocalSignatureRef = useRef('');
  const lastSavedSignatureRef = useRef('');
  const lastReportedNotesStateRef = useRef('');

  const notes = notesStore?.notes || EMPTY_ALT_NOTES_ITEMS;
  const folders = notesStore?.folders || EMPTY_ALT_NOTES_ITEMS;
  const attachments = notesStore?.attachments || EMPTY_ALT_NOTES_ITEMS;
  const folderCounts = useMemo(() => buildAltNoteFolderCounts({ notes, folders }), [notes, folders]);
  const filteredNotes = useMemo(() => filterAltNotes({ notes, selectedFolderId, search }), [notes, search, selectedFolderId]);
  const groups = useMemo(() => groupAltNotesByDate(filteredNotes), [filteredNotes]);
  const selectedNote = notes.find(note => note.id === selectedNoteId) || filteredNotes[0] || notes.find(note => !note.deletedAt && !note.archivedAt) || null;
  const activeNoteId = selectedNote?.id || null;
  const selectedNoteTitle = selectedNote?.title || 'Untitled Note';
  const selectedNoteBodyJson = selectedNote?.bodyJson || ALT_NOTES_EDITOR_EMPTY_DOC;
  const selectedNoteSignature = useMemo(
    () => (activeNoteId ? noteContentSignature(selectedNoteTitle, selectedNoteBodyJson) : ''),
    [activeNoteId, selectedNoteBodyJson, selectedNoteTitle],
  );
  const selectedAttachments = attachments.filter(item => item.noteId === selectedNote?.id);
  const selectedObjective = objectives.find(objective => objective.id === selectedNote?.objectiveId) || null;
  const selectedFolderLabel = ALT_NOTES_SYSTEM_FOLDERS.find(folder => folder.id === selectedFolderId)?.label
    || folders.find(folder => folder.id === selectedFolderId)?.name
    || 'All Notes';
  const localContentSignature = useMemo(() => noteContentSignature(title, bodyJson), [bodyJson, title]);

  useEffect(() => {
    notesStoreRef.current = notesStore;
  }, [notesStore]);

  useEffect(() => {
    latestLocalSignatureRef.current = localContentSignature;
  }, [localContentSignature]);

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId;
  }, [activeNoteId]);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    bodyJsonRef.current = bodyJson;
  }, [bodyJson]);

  const queueSave = useCallback((noteId, nextTitle, nextBodyJson) => {
    if (!open || !noteId) return;
    const signatureAtStart = noteContentSignature(nextTitle, nextBodyJson);
    latestLocalSignatureRef.current = signatureAtStart;
    setDirty(true);
    setSaveState('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    const backupKey = `sandpro-alt-note-draft:${userId}:${noteId}`;
    window.localStorage.setItem(backupKey, JSON.stringify({
      title: nextTitle,
      bodyJson: nextBodyJson,
      updatedAt: new Date().toISOString(),
    }));
    saveTimerRef.current = window.setTimeout(async () => {
      const plainText = extractAltNotePlainText(nextBodyJson);
      const result = await notesStoreRef.current?.saveNote(noteId, {
        title: nextTitle,
        bodyJson: nextBodyJson,
        plainText,
        preview: previewAltNoteText(plainText),
      });
      if (result?.error) {
        setSaveState('error');
        return;
      }
      if (String(noteId).startsWith('draft-') && result.note?.id) {
        activeNoteIdRef.current = result.note.id;
        hydratedNoteIdRef.current = result.note.id;
        setSelectedNoteId(result.note.id);
      }
      lastSavedSignatureRef.current = signatureAtStart;
      window.localStorage.removeItem(backupKey);
      if (latestLocalSignatureRef.current === signatureAtStart) {
        setDirty(false);
        setSaveState('saved');
      } else {
        setSaveState('saving');
      }
    }, 650);
  }, [open, userId]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  const editor = useEditor({
    extensions: editorExtensions,
    content: bodyJson,
    editorProps: {
      attributes: {
        class: 'alt-notes-editor-prose',
        'aria-label': 'Note body',
      },
    },
    onUpdate: ({ editor: activeEditor }) => {
      if (hydratingRef.current) return;
      const nextBodyJson = activeEditor.getJSON();
      bodyJsonRef.current = nextBodyJson;
      setBodyJson(nextBodyJson);
      queueSave(activeNoteIdRef.current, titleRef.current, nextBodyJson);
    },
  });

  useEffect(() => {
    if (!open || !userId) return;
    const key = getGuideKey(userId);
    setShowGuide(window.localStorage.getItem(key) !== '1');
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    setSelectedFolderId(state.selectedFolderId);
    setSearch(state.search);
    setSelectedNoteId(state.selectedNoteId);
  }, [open, state.search, state.selectedFolderId, state.selectedNoteId]);

  useEffect(() => {
    if (!open) return;
    const nextState = {
      selectedNoteId,
      selectedFolderId,
      search,
      sidebarCollapsed: false,
    };
    const signature = JSON.stringify(nextState);
    if (lastReportedNotesStateRef.current === signature) return;
    lastReportedNotesStateRef.current = signature;
    onNotesStateChange?.(nextState);
  }, [onNotesStateChange, open, search, selectedFolderId, selectedNoteId]);

  useEffect(() => {
    if (!open) return;
    if (selectedNote && selectedNote.id !== selectedNoteId) setSelectedNoteId(selectedNote.id);
  }, [open, selectedNote, selectedNoteId]);

  useEffect(() => {
    if (!activeNoteId) {
      hydratedNoteIdRef.current = null;
      lastSavedSignatureRef.current = '';
      setTitle('');
      setBodyJson(ALT_NOTES_EDITOR_EMPTY_DOC);
      setDirty(false);
      setSaveState('idle');
      return;
    }
    if (dirty && hydratedNoteIdRef.current === activeNoteId) return;
    if (lastSavedSignatureRef.current === selectedNoteSignature && hydratedNoteIdRef.current === activeNoteId) return;
    hydratingRef.current = true;
    hydratedNoteIdRef.current = activeNoteId;
    lastSavedSignatureRef.current = selectedNoteSignature;
    latestLocalSignatureRef.current = selectedNoteSignature;
    titleRef.current = selectedNoteTitle;
    bodyJsonRef.current = selectedNoteBodyJson;
    setTitle(selectedNoteTitle);
    setBodyJson(selectedNoteBodyJson);
    setDirty(false);
    setSaveState('saved');
    if (editor) {
      try {
        editor.commands.setContent(selectedNoteBodyJson, false);
      } catch {
        editor.commands.setContent(selectedNoteBodyJson);
      }
    }
    window.setTimeout(() => {
      hydratingRef.current = false;
    }, 0);
  }, [activeNoteId, dirty, editor, selectedNoteBodyJson, selectedNoteSignature, selectedNoteTitle]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleCreateNote();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!open) return null;

  const handleCreateNote = async (objectiveId = null) => {
    const note = await notesStore.createNote({
      folderId: isRealFolderId(selectedFolderId, folders) ? selectedFolderId : null,
      objectiveId,
      title: 'Untitled Note',
      persist: false,
    });
    if (note?.id) {
      setSelectedNoteId(note.id);
      setMobilePane('editor');
    }
  };

  const handleCreateFolder = async () => {
    const name = `New Folder ${folders.length + 1}`;
    const folder = await notesStore.createFolder(name);
    if (folder?.id) setSelectedFolderId(folder.id);
  };

  const handleDismissGuide = () => {
    if (userId) window.localStorage.setItem(getGuideKey(userId), '1');
    setShowGuide(false);
  };

  const handleSelectNote = (noteId) => {
    setSelectedNoteId(noteId);
    setMobilePane('editor');
  };

  const handleSelectFolder = (folderId) => {
    setSelectedFolderId(folderId);
    setMobilePane('list');
  };

  const handleFileUpload = async (files) => {
    if (!selectedNote?.id || !files?.length) return;
    setSaveState('saving');
    const results = await Promise.all(Array.from(files).map(file => notesStore.uploadAttachment(selectedNote.id, file)));
    setSaveState(results.some(result => result?.error) ? 'error' : 'saved');
  };

  const handleAttachmentInput = (event) => {
    handleFileUpload(event.target.files);
    event.target.value = '';
  };

  const handlePaste = (event) => {
    const files = getTransferFiles(event.clipboardData);
    if (files.length) handleFileUpload(files);
  };

  const handleDrop = (event) => {
    const files = getTransferFiles(event.dataTransfer);
    if (!files.length) return;
    event.preventDefault();
    handleFileUpload(files);
  };

  const handleObjectiveLink = async (objectiveId) => {
    if (!selectedNote) return;
    await notesStore.saveNote(selectedNote.id, { objectiveId: objectiveId || null });
    setLinkPickerOpen(false);
  };

  const handleTogglePin = async () => {
    if (selectedNote) await notesStore.saveNote(selectedNote.id, { pinned: !selectedNote.pinned });
  };

  const handleArchive = async () => {
    if (selectedNote) await notesStore.archiveNote(selectedNote.id);
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    if (selectedNote.deletedAt) await notesStore.purgeNote(selectedNote.id);
    else await notesStore.deleteNote(selectedNote.id);
  };

  const handleRestore = async () => {
    if (selectedNote) await notesStore.restoreNote(selectedNote.id);
  };

  return (
    <div className="alt-notes-overlay" role="presentation">
      <div className="alt-notes-backdrop" onClick={onClose} />
      <section
        className="alt-notes-window"
        data-mobile-pane={mobilePane}
        role="dialog"
        aria-modal="true"
        aria-label="PS.2 Notes"
      >
        <AltNotesSidebar
          folders={folders}
          counts={folderCounts}
          selectedFolderId={selectedFolderId}
          onSelectFolder={handleSelectFolder}
          onCreateFolder={handleCreateFolder}
          showGuide={showGuide}
          onDismissGuide={handleDismissGuide}
        />
        <AltNotesList
          groups={groups}
          selectedNoteId={selectedNote?.id}
          selectedFolderLabel={selectedFolderLabel}
          totalCount={filteredNotes.length}
          search={search}
          onSearch={setSearch}
          onSelect={handleSelectNote}
          onNewNote={() => handleCreateNote()}
          onBack={() => setMobilePane('folders')}
        />
        <section className="alt-notes-editor-pane" onPaste={handlePaste} onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
          <header className="alt-notes-window-toolbar">
            <button type="button" className="alt-notes-mobile-back" onClick={() => setMobilePane('list')} aria-label="Back to notes list">
              <ChevronLeft size={18} />
            </button>
            <button type="button" title="Toggle sidebar" aria-label="Toggle sidebar">
              <Sidebar size={19} />
            </button>
            <button type="button" title="More" aria-label="More">
              <MoreHorizontal size={19} />
            </button>
            <button type="button" title="New note" aria-label="New note" onClick={() => handleCreateNote()}>
              <FileText size={19} />
              <Plus size={13} />
            </button>
            <div className="alt-notes-window-toolbar-spacer" />
            <button type="button" title={selectedNote?.pinned ? 'Unpin note' : 'Pin note'} aria-label={selectedNote?.pinned ? 'Unpin note' : 'Pin note'} className={selectedNote?.pinned ? 'active' : ''} onClick={handleTogglePin} disabled={!selectedNote}>
              <Pin size={18} />
            </button>
            <button type="button" title="Share" aria-label="Share">
              <Share size={18} />
            </button>
            <button type="button" title="Search" aria-label="Search" onClick={() => setMobilePane('list')}>
              <Search size={20} />
            </button>
            <button type="button" title="Close Notes" aria-label="Close Notes" onClick={onClose}>
              <X size={20} />
            </button>
          </header>

          {selectedNote ? (
            <>
              <AltNotesEditorToolbar
                editor={editor}
                onAttach={() => fileInputRef.current?.click()}
                onLinkObjective={() => setLinkPickerOpen(value => !value)}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onRestore={handleRestore}
                noteDeleted={Boolean(selectedNote.deletedAt)}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="alt-notes-file-input"
                tabIndex={-1}
                aria-hidden="true"
                onChange={handleAttachmentInput}
              />
              {linkPickerOpen ? (
                <div className="alt-notes-objective-linker">
                  <label>
                    <Target size={15} />
                    <select value={selectedNote.objectiveId || ''} onChange={(event) => handleObjectiveLink(event.target.value)}>
                      <option value="">No objective link</option>
                      {objectives.map(objective => (
                        <option key={objective.id} value={objective.id}>{objectiveLabel(objective)}</option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
              <div className="alt-notes-editor-scroll">
                <div className="alt-notes-note-meta">
                  <span>{formatDate(selectedNote.lastEditedAt || selectedNote.updatedAt)}</span>
                  <span>{new Date(selectedNote.lastEditedAt || selectedNote.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  <b className={`alt-notes-save-state ${saveState}`}>{statusText[saveState]}</b>
                </div>
                <input
                  className="alt-notes-title-input"
                  value={title}
                  aria-label="Note title"
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    titleRef.current = nextTitle;
                    setTitle(nextTitle);
                    queueSave(activeNoteId, nextTitle, bodyJsonRef.current);
                  }}
                />
                {selectedObjective ? (
                  <div className="alt-notes-linked-objective">
                    <Target size={15} />
                    <span>{selectedObjective.title}</span>
                  </div>
                ) : null}
                <EditorContent editor={editor} />
                {selectedAttachments.length ? (
                  <div className="alt-notes-attachments">
                    {selectedAttachments.map(attachment => (
                      <a
                        key={attachment.id}
                        href={attachment.signedUrl || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="alt-notes-attachment-chip"
                      >
                        <Paperclip size={14} />
                        <span>{attachment.name}</span>
                        <small>{fileSizeLabel(attachment.size)}</small>
                      </a>
                    ))}
                  </div>
                ) : null}
                <div className="alt-notes-editor-foot">
                  <span>{editor?.storage.characterCount.words() || 0} words</span>
                  <span>{selectedNote.objectiveId ? 'Objective linked' : 'Private note'}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="alt-notes-editor-empty">
              <Highlighter size={30} />
              <strong>No note selected</strong>
              <p>Create a note to start writing in PS.2.</p>
              <button type="button" onClick={() => handleCreateNote()}>New Note</button>
            </div>
          )}
        </section>
      </section>
    </div>
  );
};

export default AltNotesPopup;
