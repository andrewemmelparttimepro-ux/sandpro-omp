export const normalizeMentionValue = (value = "") => (
  String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
);

export const ALL_COMPANY_MENTION_ID = "__all_company__";
export const ALL_COMPANY_MENTION = {
  id: ALL_COMPANY_MENTION_ID,
  name: "AllCompany",
  title: "Notify everyone in the organization",
  email: "",
  isAllCompany: true,
};

const allCompanyTokens = new Set(["allcompany", "all company", "company"]);

const mentionAliases = (user = {}) => {
  const name = user.name || "";
  const emailLocal = (user.email || "").split("@")[0] || "";
  const [firstName] = name.split(/\s+/);
  return {
    name: normalizeMentionValue(name),
    firstName: normalizeMentionValue(firstName),
    emailLocal: normalizeMentionValue(emailLocal),
  };
};

const mentionTokens = (text = "") => (
  [...String(text).matchAll(/@([^\n\r@.,;:!?()[\]{}<>]+)/g)]
    .map(match => normalizeMentionValue(match[1]))
    .filter(Boolean)
);

const mentionMatchRank = (user = {}, normalizedQuery = "") => {
  if (!normalizedQuery) return 0;
  const aliases = mentionAliases(user);
  const nameWords = aliases.name.split(/\s+/).filter(Boolean);
  const title = normalizeMentionValue(user.title || "");
  const titleWords = title.split(/\s+/).filter(Boolean);

  if (aliases.name === normalizedQuery || aliases.emailLocal === normalizedQuery) return 0;
  if (
    aliases.name.startsWith(normalizedQuery)
    || aliases.firstName.startsWith(normalizedQuery)
    || (aliases.firstName && normalizedQuery.startsWith(aliases.firstName))
  ) return 1;
  if (
    aliases.emailLocal.startsWith(normalizedQuery)
    || (aliases.emailLocal && normalizedQuery.startsWith(aliases.emailLocal))
  ) return 2;
  if (nameWords.some(word => word.startsWith(normalizedQuery))) return 3;
  if (aliases.name.includes(normalizedQuery)) return 4;
  if (aliases.emailLocal.includes(normalizedQuery)) return 5;
  if (titleWords.some(word => word.startsWith(normalizedQuery))) return 6;
  if (title.includes(normalizedQuery)) return 7;
  return Number.POSITIVE_INFINITY;
};

const tokenMatchesAlias = (token, alias) => alias && (token === alias || token.startsWith(`${alias} `));

const tokenMatchesAllCompany = (token) => (
  [...allCompanyTokens].some(alias => token === alias || token.startsWith(`${alias} `))
);

export const getActiveMention = (value = "", cursor = value.length) => {
  const beforeCursor = value.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) return null;
  if (atIndex > 0 && /\S/.test(beforeCursor[atIndex - 1])) return null;

  const token = beforeCursor.slice(atIndex + 1);
  if (token.length > 50 || /[\n\r.,;:!?()[\]{}<>]/.test(token)) return null;
  if (/\s$/.test(token)) return null;
  if (token.trim().split(/\s+/).filter(Boolean).length > 2) return null;

  return { start: atIndex, end: cursor, query: token.trim() };
};

export const findMentionCandidates = (users = [], query = "", currentUserId = null, memberUserIds = []) => {
  const normalizedQuery = normalizeMentionValue(query);
  const memberSet = new Set(memberUserIds);
  const showAllCompany = !normalizedQuery
    || normalizeMentionValue("AllCompany").includes(normalizedQuery)
    || normalizeMentionValue("All Company").includes(normalizedQuery)
    || normalizedQuery.includes("company");

  const people = users
    .filter(user => user?.id && user.id !== currentUserId)
    .map(user => ({ user, matchRank: mentionMatchRank(user, normalizedQuery) }))
    .filter(candidate => Number.isFinite(candidate.matchRank))
    .sort((a, b) => {
      const aMember = memberSet.has(a.user.id) ? 0 : 1;
      const bMember = memberSet.has(b.user.id) ? 0 : 1;
      if (aMember !== bMember) return aMember - bMember;
      if (a.matchRank !== b.matchRank) return a.matchRank - b.matchRank;
      return (a.user.name || "").localeCompare(b.user.name || "");
    })
    .map(candidate => candidate.user)
    .slice(0, showAllCompany ? 5 : 6);

  return [
    ...(showAllCompany ? [ALL_COMPANY_MENTION] : []),
    ...people,
  ].slice(0, 6);
};

export const insertMentionText = (value = "", activeMention, user) => {
  if (!activeMention || !user?.name) return value;
  const suffix = value.slice(activeMention.end);
  return `${value.slice(0, activeMention.start)}@${user.name}${suffix.startsWith(" ") ? "" : " "}${suffix}`;
};

export const getMentionedUsers = (text = "", selectedMentionIds = [], users = [], currentUserId = null) => {
  const selected = new Set(selectedMentionIds);
  const tokens = mentionTokens(text);
  const allCompanyMentioned = selected.has(ALL_COMPANY_MENTION_ID) || tokens.some(tokenMatchesAllCompany);
  const firstNameCounts = users.reduce((counts, user) => {
    const firstName = mentionAliases(user).firstName;
    if (firstName) counts.set(firstName, (counts.get(firstName) || 0) + 1);
    return counts;
  }, new Map());
  const mentioned = new Map();

  for (const user of users) {
    if (!user?.id || user.id === currentUserId) continue;
    if (allCompanyMentioned) {
      mentioned.set(user.id, user);
      continue;
    }
    const aliases = mentionAliases(user);
    const selectedByPicker = selected.has(user.id);
    const typedByHand = tokens.some(token => (
      tokenMatchesAlias(token, aliases.name)
      || tokenMatchesAlias(token, aliases.emailLocal)
      || (firstNameCounts.get(aliases.firstName) === 1 && tokenMatchesAlias(token, aliases.firstName))
    ));
    if (selectedByPicker || typedByHand) mentioned.set(user.id, user);
  }

  return [...mentioned.values()];
};
