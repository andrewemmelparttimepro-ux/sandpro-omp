export const ALT_NOTES_BUCKET = 'alt-note-files';

export const ALT_NOTES_EDITOR_EMPTY_DOC = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
    },
  ],
};

export const DEFAULT_ALT_NOTES_STATE = {
  selectedNoteId: null,
  selectedFolderId: 'all',
  search: '',
  sidebarCollapsed: false,
};

export const ALT_NOTES_SYSTEM_FOLDERS = [
  { id: 'quick', label: 'Quick Notes', icon: 'note' },
  { id: 'all', label: 'All Notes', icon: 'folder' },
  { id: 'pinned', label: 'Pinned', icon: 'pin' },
  { id: 'objective', label: 'Objective Notes', icon: 'target' },
  { id: 'trash', label: 'Recently Deleted', icon: 'trash' },
];

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const normalizeAltNotesState = (value = {}) => {
  const source = isObject(value) ? value : {};
  return {
    selectedNoteId: typeof source.selectedNoteId === 'string' ? source.selectedNoteId : null,
    selectedFolderId: typeof source.selectedFolderId === 'string' ? source.selectedFolderId : 'all',
    search: typeof source.search === 'string' ? source.search : '',
    sidebarCollapsed: Boolean(source.sidebarCollapsed),
  };
};

const textFromNode = (node) => {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (!isObject(node)) return '';
  const ownText = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? node.content.map(textFromNode).join(' ') : '';
  return `${ownText} ${childText}`.trim();
};

export const extractAltNotePlainText = (doc = ALT_NOTES_EDITOR_EMPTY_DOC) => (
  textFromNode(doc).replace(/\s+/g, ' ').trim()
);

export const previewAltNoteText = (value = '', maxLength = 110) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'No additional text';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
};

const asIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeAltNoteRow = (row = {}) => ({
  id: row.id,
  userId: row.user_id || row.userId,
  folderId: row.folder_id || row.folderId || null,
  objectiveId: row.objective_id || row.objectiveId || null,
  title: String(row.title || 'Untitled Note').trim() || 'Untitled Note',
  bodyJson: isObject(row.body_json || row.bodyJson) ? (row.body_json || row.bodyJson) : ALT_NOTES_EDITOR_EMPTY_DOC,
  plainText: String(row.plain_text || row.plainText || ''),
  preview: previewAltNoteText(row.preview || row.plain_text || row.plainText || ''),
  pinned: Boolean(row.pinned),
  archivedAt: asIso(row.archived_at || row.archivedAt),
  deletedAt: asIso(row.deleted_at || row.deletedAt),
  createdAt: asIso(row.created_at || row.createdAt) || new Date().toISOString(),
  updatedAt: asIso(row.updated_at || row.updatedAt) || new Date().toISOString(),
  lastEditedAt: asIso(row.last_edited_at || row.lastEditedAt || row.updated_at || row.updatedAt) || new Date().toISOString(),
});

export const normalizeAltNoteFolderRow = (row = {}) => ({
  id: row.id,
  userId: row.user_id || row.userId,
  name: String(row.name || 'Notes').trim() || 'Notes',
  icon: row.icon || 'folder',
  sortOrder: Number(row.sort_order || row.sortOrder || 0),
  createdAt: asIso(row.created_at || row.createdAt) || new Date().toISOString(),
  updatedAt: asIso(row.updated_at || row.updatedAt) || new Date().toISOString(),
});

export const normalizeAltNoteAttachmentRow = (row = {}) => ({
  id: row.id,
  userId: row.user_id || row.userId,
  noteId: row.note_id || row.noteId,
  storagePath: row.storage_path || row.storagePath,
  name: row.name || 'Attachment',
  mimeType: row.mime_type || row.mimeType || 'application/octet-stream',
  size: Number(row.size || 0),
  signedUrl: row.signedUrl || row.signed_url || '',
  createdAt: asIso(row.created_at || row.createdAt) || new Date().toISOString(),
});

export const buildAltNoteRow = (userId, note = {}) => {
  const bodyJson = isObject(note.bodyJson || note.body_json) ? (note.bodyJson || note.body_json) : ALT_NOTES_EDITOR_EMPTY_DOC;
  const plainText = String(note.plainText ?? extractAltNotePlainText(bodyJson));
  return {
    user_id: userId,
    folder_id: note.folderId || null,
    objective_id: note.objectiveId || null,
    title: String(note.title || 'Untitled Note').trim() || 'Untitled Note',
    body_json: bodyJson,
    plain_text: plainText,
    preview: previewAltNoteText(note.preview || plainText),
    pinned: Boolean(note.pinned),
    archived_at: note.archivedAt || null,
    deleted_at: note.deletedAt || null,
    updated_at: new Date().toISOString(),
    last_edited_at: new Date().toISOString(),
  };
};

export const createAltNoteDraft = ({
  userId,
  folderId = null,
  objectiveId = null,
  title = 'Untitled Note',
  bodyJson = ALT_NOTES_EDITOR_EMPTY_DOC,
} = {}) => normalizeAltNoteRow({
  id: `draft-${Date.now()}`,
  user_id: userId,
  folder_id: folderId,
  objective_id: objectiveId,
  title,
  body_json: bodyJson,
  plain_text: extractAltNotePlainText(bodyJson),
  pinned: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_edited_at: new Date().toISOString(),
});

export const getAltNoteTimestamp = (note = {}) => (
  new Date(note.lastEditedAt || note.updatedAt || note.createdAt || 0).getTime() || 0
);

export const sortAltNotes = (notes = []) => [...notes].sort((left, right) => {
  if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
  return getAltNoteTimestamp(right) - getAltNoteTimestamp(left);
});

const startOfDay = (date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

export const groupAltNotesByDate = (notes = [], now = new Date()) => {
  const todayStart = startOfDay(now).getTime();
  const previousSevenStart = todayStart - 7 * 86400000;
  const groups = [
    { id: 'today', label: 'Today', notes: [] },
    { id: 'previous7', label: 'Previous 7 Days', notes: [] },
    { id: 'older', label: 'Older', notes: [] },
  ];
  sortAltNotes(notes).forEach((note) => {
    const timestamp = getAltNoteTimestamp(note);
    if (timestamp >= todayStart) groups[0].notes.push(note);
    else if (timestamp >= previousSevenStart) groups[1].notes.push(note);
    else groups[2].notes.push(note);
  });
  return groups.filter(group => group.notes.length > 0);
};

export const filterAltNotes = ({
  notes = [],
  selectedFolderId = 'all',
  search = '',
} = {}) => {
  const query = String(search || '').trim().toLowerCase();
  return sortAltNotes(notes).filter((note) => {
    const inTrash = Boolean(note.deletedAt);
    if (selectedFolderId === 'trash') {
      if (!inTrash) return false;
    } else if (inTrash || note.archivedAt) {
      return false;
    }
    if (selectedFolderId === 'pinned' && !note.pinned) return false;
    if (selectedFolderId === 'objective' && !note.objectiveId) return false;
    if (selectedFolderId === 'quick' && note.folderId) return false;
    if (!ALT_NOTES_SYSTEM_FOLDERS.some(folder => folder.id === selectedFolderId) && note.folderId !== selectedFolderId) return false;
    if (!query) return true;
    return [
      note.title,
      note.plainText,
      note.preview,
    ].join(' ').toLowerCase().includes(query);
  });
};

export const buildAltNoteFolderCounts = ({ notes = [], folders = [] } = {}) => {
  const active = notes.filter(note => !note.deletedAt && !note.archivedAt);
  const byFolder = new Map(folders.map(folder => [folder.id, 0]));
  active.forEach((note) => {
    if (note.folderId && byFolder.has(note.folderId)) byFolder.set(note.folderId, byFolder.get(note.folderId) + 1);
  });
  return {
    all: active.length,
    quick: active.filter(note => !note.folderId).length,
    pinned: active.filter(note => note.pinned).length,
    objective: active.filter(note => note.objectiveId).length,
    trash: notes.filter(note => note.deletedAt).length,
    folders: byFolder,
  };
};

export const getAltNotesPreview = (notes = []) => {
  const visible = sortAltNotes(notes.filter(note => !note.deletedAt && !note.archivedAt));
  const note = visible[0] || null;
  if (!note) {
    return {
      title: 'Open Notes',
      preview: 'Create a private note, checklist, or objective-linked thought.',
      meta: 'No notes yet',
      note: null,
    };
  }
  return {
    title: note.title,
    preview: previewAltNoteText(note.plainText || note.preview),
    meta: note.pinned ? 'Pinned note' : 'Latest note',
    note,
  };
};
