// ============================================================================
// 2026 CONSOLIDATED OKRs — the 17 group OKRs + the company top-line.
// ----------------------------------------------------------------------------
// Source: "2026 All Group OKRs_ Consolidated_4.8.26.xlsx" ("MAIN OKR SHEET"),
// delivered by Mercileidy Jimenez after the Tim/Jake meeting. Machine-generated
// from the spreadsheet on 2026-06-23 into ./okr2026Consolidated.json (do not
// hand-edit the JSON; re-run the generator in the handoff if the sheet changes).
//
// Structure for the LINKING SYSTEM:
//   COMPANY top-line OKRs  (parent)
//     └─ 17 group OKRs      (each group = a team scorecard with its own OKRs)
//
// Each OKR row: { title, auditForm, baseline, target, owner, manualStatus,
//                 reportingCadence, ytdAvg, actuals:{jan..dec} }
// Values are preserved verbatim from the sheet (numbers, %, "Needs Improvement",
// "n/a", free text) — normalization is a downstream decision, see the handoff.
// ============================================================================

import consolidated from "./okr2026Consolidated.json";

export const OKR_2026 = consolidated;
export const OKR_2026_GROUPS = consolidated.groups;

export const COMPANY_OKRS = consolidated.groups.find(g => g.isCompany) || null;
export const GROUP_OKRS = consolidated.groups.filter(g => !g.isCompany); // the 17 groups

export const OKR_GROUP_NAMES = GROUP_OKRS.map(g => g.group);

export const totalOkrCount = consolidated.groups.reduce((n, g) => n + g.okrs.length, 0);

// ---------------------------------------------------------------------------
// Owner initials/names (as written in the sheet) → SandPro profile email.
// RESOLVED from the seeded roster (supabase/seed-users.mjs). Combined owners
// (e.g. "JB / JS") and people not in the current roster are left for the
// dedicated agent to confirm/seed — see UNRESOLVED_OWNERS and the handoff.
// ---------------------------------------------------------------------------
export const OKR_OWNER_MAP = {
  "JF": "jfeil@sandpro.com",
  "JB": "jblackaby@sandpro.com",
  "MB": "mblackaby@sandpro.com",
  "DA": "danderson@sandpro.com",
  "KK": "kkraft@sandpro.com",
  "HA": "hallard-kotaska@sandpro.com",
  "Heather": "hallard-kotaska@sandpro.com",
  "CL": "cloving@sandpro.com",
  "Casey": "cloving@sandpro.com",
  "TD": "tdibben@sandpro.com",
  "Tim": "tdibben@sandpro.com",
  "AA": "aallan@sandpro.com",
  "JM": "jmaslowski@sandpro.com",
  "Jaelen": "jmaslowski@sandpro.com",
  "KS": "ksebastian@sandpro.com",
  "Malcolm": "mblackaby@sandpro.com",
};

// Owners that appear in the sheet but are NOT in the current seeded roster, or
// are compound owners that need a primary assignee chosen. The dedicated agent
// must seed/confirm these before the OKRs can be fully linked to real users.
export const UNRESOLVED_OWNERS = [
  "JB / JS", "JB/ JS",          // John Sommerfeld? — JS not in current roster
  "LD",                          // Larry Debold (inside sales) — not in roster
  "Brad/ Bryce",                 // Field Trainers — neither in roster
  "Gershom/Dustin",              // Gershom Dingal / Dustin Saunders — not in roster
  "HUNTER/DREW",                 // Hunter (?) + Drew Anderson
  "JPL",                         // R&D/Engineering owner — unknown
  "Matt",                        // Flowback Repair — not in roster
  "Jaelen/Thomas", "Aiden",      // Facility/Yard — Thomas/Aiden not in roster
  "Malcolm/Field Service Managers", // needs a named primary owner
];

export const resolveOkrOwner = (owner) => {
  if (!owner) return null;
  const key = String(owner).trim();
  return OKR_OWNER_MAP[key] || null; // null => unresolved, surface for manual mapping
};

// Convenience: flatten to rows tagged with their group, for table/seed loaders.
export const flattenOkrs = () =>
  consolidated.groups.flatMap(g =>
    g.okrs.map(okr => ({
      group: g.group,
      isCompany: g.isCompany,
      ownerEmail: resolveOkrOwner(okr.owner),
      ...okr,
    }))
  );
