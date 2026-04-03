// ============================================================================
// SEED DATA — Real SandPro employees, objectives, notifications
// ============================================================================

const now = new Date();
const daysAgo = (d) => { const dt = new Date(now); dt.setDate(dt.getDate() - d); return dt.toISOString(); };
const daysFromNow = (d) => { const dt = new Date(now); dt.setDate(dt.getDate() + d); return dt.toISOString(); };

export const USERS = [
  { id: "u1", name: "Jake Feil", initials: "JF", role: "executive", title: "CEO", department: "Leadership", email: "jfeil@sandpro.com", reportsTo: null, color: "#F97316", password: "demo2026" },
  { id: "u2", name: "Joshua Blackaby", initials: "JB", role: "executive", title: "Vice President", department: "Leadership", email: "jblackaby@sandpro.com", reportsTo: "u1", color: "#3B82F6", password: "demo2026" },
  { id: "u3", name: "Malcolm Blackaby", initials: "MB", role: "manager", title: "Operations Manager", department: "Operations", email: "mblackaby@sandpro.com", reportsTo: "u1", color: "#8B5CF6", password: "demo2026" },
  { id: "u4", name: "Drew Anderson", initials: "DA", role: "manager", title: "Dir. Automated Solutions", department: "Automation", email: "danderson@sandpro.com", reportsTo: "u2", color: "#10B981", password: "demo2026" },
  { id: "u5", name: "Kelby Kraft", initials: "KK", role: "manager", title: "Account Manager", department: "Sales", email: "kkraft@sandpro.com", reportsTo: "u1", color: "#EC4899", password: "demo2026" },
  { id: "u6", name: "Heather Allard-Kotaska", initials: "HA", role: "manager", title: "HR Manager", department: "HR", email: "hallard-kotaska@sandpro.com", reportsTo: "u1", color: "#F59E0B", password: "demo2026" },
  { id: "u7", name: "Isaac Badillo", initials: "IB", role: "contributor", title: "Field Service Manager", department: "Field Operations", email: "ibadillo@sandpro.com", reportsTo: "u3", color: "#06B6D4" },
  { id: "u8", name: "Zedek Harris", initials: "ZH", role: "contributor", title: "Field Service Manager", department: "Field Operations", email: "zharris@sandpro.com", reportsTo: "u3", color: "#84CC16" },
  { id: "u9", name: "Tim Dibben", initials: "TD", role: "contributor", title: "Quality Control Manager", department: "Quality", email: "tdibben@sandpro.com", reportsTo: "u3", color: "#F43F5E" },
  { id: "u10", name: "Jaelen Maslowski", initials: "JM", role: "contributor", title: "Shop Manager", department: "Shop", email: "jmaslowski@sandpro.com", reportsTo: "u3", color: "#A855F7" },
  { id: "u11", name: "Gershom Dingal", initials: "GD", role: "contributor", title: "Ops Coordinator & Dispatch", department: "Operations", email: "gdingal@sandpro.com", reportsTo: "u3", color: "#14B8A6" },
  { id: "u12", name: "Kayla Sebastian", initials: "KS", role: "contributor", title: "Office Manager", department: "Admin", email: "ksebastian@sandpro.com", reportsTo: "u1", color: "#E879F9" },
  { id: "u13", name: "Casey Loving", initials: "CL", role: "contributor", title: "Safety Coordinator", department: "Safety", email: "cloving@sandpro.com", reportsTo: "u2", color: "#FB923C" },
  { id: "u14", name: "John Latz", initials: "JL", role: "contributor", title: "I&E Technician", department: "Automation", email: "jlatz@sandpro.com", reportsTo: "u4", color: "#38BDF8" },
  { id: "u15", name: "Bryan Carpenter", initials: "BC", role: "contributor", title: "Automations BD Manager", department: "Sales", email: "bcarpenter@sandpro.com", reportsTo: "u4", color: "#A3E635" },
  { id: "u16", name: "Adam Allan", initials: "AA", role: "contributor", title: "Inventory Manager", department: "Operations", email: "aallan@sandpro.com", reportsTo: "u3", color: "#FBBF24" },
  { id: "u17", name: "Josh Pfeifer", initials: "JP", role: "contributor", title: "Account Manager", department: "Sales", email: "jpfeifer@sandpro.com", reportsTo: "u5", color: "#34D399" },
  { id: "u18", name: "John Sommerfeld", initials: "JS", role: "contributor", title: "Business Development", department: "Sales", email: "jsommerfeld@sandpro.com", reportsTo: "u1", color: "#C084FC" },
  { id: "u19", name: "Larry Debold", initials: "LD", role: "contributor", title: "Inside Sales", department: "Sales", email: "ldebold@sandpro.com", reportsTo: "u5", color: "#FB7185" },
  { id: "u20", name: "Serena Laumb", initials: "SL", role: "contributor", title: "Accounts Receivable", department: "Admin", email: "slaumb@sandpro.com", reportsTo: "u12", color: "#2DD4BF" },
  { id: "u21", name: "Dustin Saunders", initials: "DS", role: "contributor", title: "Dispatch", department: "Operations", email: "dsaunders@sandpro.com", reportsTo: "u11", color: "#818CF8" },
  { id: "u22", name: "Mercileidy Jimenez", initials: "MJ", role: "contributor", title: "Executive Assistant", department: "Admin", email: "mjimenez@sandpro.com", reportsTo: "u1", color: "#F472B6" },
  { id: "u23", name: "Jake Harbaugh", initials: "JH", role: "contributor", title: "Inside Sales", department: "Sales", email: "jharbaugh@sandpro.com", reportsTo: "u5", color: "#4ADE80" },
];

export const DEPARTMENTS = ["Leadership", "Operations", "Automation", "Sales", "HR", "Field Operations", "Quality", "Shop", "Admin", "Safety"];

export const INITIAL_OBJECTIVES = [
  { id: "obj1", title: "Achieve Q2 2026 Revenue Target of $4.2M", description: "Hit consolidated revenue target across all three verticals: sand management, wellhead, and automation.", ownerId: "u1", createdBy: "u1", delegatedBy: null, parentId: null, status: "on_track", priority: "critical", progress: 45, dueDate: daysFromNow(89), startDate: daysAgo(30), department: "Leadership", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Review April pipeline with Kelby and Bryan", type: "measured", baselineMetric: 0, targetMetric: 4200000, currentMetric: 1890000, metricUnit: "$",
    subtasks: [
      { id: "st1", title: "Close Continental automation deal", progress: 70, status: "on_track", ownerId: "u4" },
      { id: "st2", title: "Finalize Hess Q2 sand management contract", progress: 50, status: "on_track", ownerId: "u5" },
    ],
    messages: [
      { id: "m1", userId: "u1", text: "Pipeline looking strong headed into April. Need Drew to close Continental and Kelby to lock Hess.", ts: daysAgo(5), attachments: [] },
      { id: "m2", userId: "u5", text: "Hess meeting went well. They're reviewing the proposal this week. Should have an answer by Friday.", ts: daysAgo(3), attachments: [] },
      { id: "m3", userId: "u4", text: "Continental wants to see mSafe v2.1 field data before signing. I've got Isaac pulling the reports from Tioga.", ts: daysAgo(2), attachments: [] },
      { id: "m4", userId: "u1", text: "Good. Let's get those reports polished and over to them by Wednesday. This is the deal of the quarter.", ts: daysAgo(1), attachments: [] },
    ],
    updates: [
      { ts: daysAgo(30), status: "not_started", progress: 0, note: "Q2 begins" },
      { ts: daysAgo(20), status: "on_track", progress: 20, note: "First sand management invoices shipped" },
      { ts: daysAgo(7), status: "on_track", progress: 45, note: "Pipeline at $3.8M potential, need to convert" },
    ],
    files: [{ name: "Q2_Pipeline_Summary.pdf", type: "pdf", size: "2.4 MB", ts: daysAgo(5) }]
  },
  { id: "obj2", title: "Expand mSeries Product Line to 3 New Operators", description: "Deploy mSeries automation products to three new E&P operators beyond existing customer base.", ownerId: "u1", createdBy: "u1", delegatedBy: null, parentId: null, status: "on_track", priority: "high", progress: 33, dueDate: daysFromNow(75), startDate: daysAgo(15), department: "Leadership", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Bryan to present at Williston Basin conference", type: "simple",
    subtasks: [
      { id: "st3", title: "Demo mSand to Whiting Petroleum", progress: 80, status: "on_track", ownerId: "u15" },
      { id: "st4", title: "Proposal for Marathon Oil mSafe deployment", progress: 20, status: "not_started", ownerId: "u15" },
      { id: "st5", title: "Pilot mAutoGrease+ with Oasis", progress: 0, status: "not_started", ownerId: "u4" },
    ],
    messages: [
      { id: "m5", userId: "u15", text: "Whiting demo went great. Their production manager wants to trial on 3 wells. Sending pricing this week.", ts: daysAgo(4), attachments: [] },
      { id: "m6", userId: "u4", text: "Oasis contact went cold after the price sheet. Need to rework the ROI pitch — they're focused on payback period.", ts: daysAgo(2), attachments: [] },
    ],
    updates: [{ ts: daysAgo(15), status: "not_started", progress: 0, note: "Expansion initiative launched" }, { ts: daysAgo(4), status: "on_track", progress: 33, note: "Whiting demo successful" }],
    files: []
  },
  { id: "obj3", title: "Achieve Zero Lost-Time Incidents in Q2", description: "Maintain perfect safety record through proactive training, inspections, and near-miss reporting.", ownerId: "u2", createdBy: "u1", delegatedBy: "u1", parentId: null, status: "on_track", priority: "critical", progress: 100, dueDate: daysFromNow(89), startDate: daysAgo(30), department: "Safety", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Casey to complete April inspection cycle", type: "simple",
    subtasks: [],
    messages: [
      { id: "m7", userId: "u2", text: "30 days in, zero incidents. The new pre-job briefing format is working. Crews are catching hazards before they become problems.", ts: daysAgo(3), attachments: [] },
      { id: "m8", userId: "u13", text: "Completed all April safety stand-downs for North crews. South crews scheduled for next week.", ts: daysAgo(1), attachments: [] },
    ],
    updates: [{ ts: daysAgo(30), status: "on_track", progress: 100, note: "Ongoing — zero incidents Q2 to date" }],
    files: [{ name: "April_Safety_Standown_Report.pdf", type: "pdf", size: "1.1 MB", ts: daysAgo(1) }]
  },
  { id: "obj4", title: "Reduce Equipment Downtime by 20%", description: "Implement predictive maintenance schedules and improve parts inventory to minimize unplanned downtime.", ownerId: "u3", createdBy: "u1", delegatedBy: "u1", parentId: "obj1", status: "on_track", priority: "high", progress: 60, dueDate: daysFromNow(60), startDate: daysAgo(45), department: "Operations", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Adam to audit current parts inventory levels", type: "measured", baselineMetric: 100, targetMetric: 80, currentMetric: 85, metricUnit: "hrs/month",
    subtasks: [
      { id: "st6", title: "Implement PM schedule for all rental fleet", progress: 75, status: "on_track", ownerId: "u10" },
      { id: "st7", title: "Stock critical spare parts at Berthold shop", progress: 40, status: "at_risk", ownerId: "u16" },
    ],
    messages: [
      { id: "m9", userId: "u3", text: "PM schedules are in place for 75% of the fleet. Jaelen's team is knocking it out. Parts inventory is the bottleneck.", ts: daysAgo(6), attachments: [] },
      { id: "m10", userId: "u16", text: "Waiting on back-ordered hydraulic fittings from supplier. ETA 2 weeks. I've sourced alternates from Bismarck but they're 15% more.", ts: daysAgo(4), attachments: [] },
      { id: "m11", userId: "u3", text: "Go with the Bismarck alternates. Downtime costs us more than 15% on fittings. Get them ordered today.", ts: daysAgo(4), attachments: [] },
    ],
    updates: [{ ts: daysAgo(45), status: "not_started", progress: 0, note: "Initiative started" }, { ts: daysAgo(20), status: "on_track", progress: 35, note: "PM scheduling underway" }, { ts: daysAgo(6), status: "on_track", progress: 60, note: "75% fleet on PM schedule" }],
    files: [{ name: "Fleet_PM_Schedule.xlsx", type: "spreadsheet", size: "340 KB", ts: daysAgo(6) }]
  },
  { id: "obj5", title: "Complete API Q2 Audit Documentation", description: "Prepare and submit all required API Spec Q2 documentation for the Q2 quality audit cycle.", ownerId: "u9", createdBy: "u3", delegatedBy: "u3", parentId: null, status: "at_risk", priority: "high", progress: 25, dueDate: daysFromNow(12), startDate: daysAgo(40), department: "Quality", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Tim to compile welding procedure qualifications by Friday", type: "simple",
    subtasks: [
      { id: "st8", title: "Update WPS/PQR documentation", progress: 50, status: "on_track", ownerId: "u9" },
      { id: "st9", title: "Complete non-conformance reports", progress: 10, status: "at_risk", ownerId: "u9" },
      { id: "st10", title: "Finalize calibration records", progress: 0, status: "not_started", ownerId: "u10" },
    ],
    messages: [
      { id: "m12", userId: "u9", text: "Running behind on NCR documentation. The Minot job from March generated 4 NCRs that still need formal writeup.", ts: daysAgo(8), attachments: [] },
      { id: "m13", userId: "u3", text: "Tim, this audit is in 12 days. What do you need from me to get this done?", ts: daysAgo(7), attachments: [] },
      { id: "m14", userId: "u9", text: "If I can get one person for 3 days to handle the calibration records, I can focus on the NCRs and WPS updates.", ts: daysAgo(7), attachments: [] },
    ],
    updates: [{ ts: daysAgo(40), status: "not_started", progress: 0, note: "Audit prep initiated" }, { ts: daysAgo(15), status: "on_track", progress: 20, note: "WPS updates started" }, { ts: daysAgo(8), status: "at_risk", progress: 25, note: "NCR backlog identified, timeline tight" }],
    files: [{ name: "Q2_Audit_Checklist.pdf", type: "pdf", size: "890 KB", ts: daysAgo(15) }, { name: "NCR_Backlog_List.xlsx", type: "spreadsheet", size: "120 KB", ts: daysAgo(8) }]
  },
  { id: "obj6", title: "Deploy mSafe v2.1 to Continental Wells", description: "Install and commission mSafe v2.1 pressure monitoring systems across Continental's Bakken well sites.", ownerId: "u4", createdBy: "u4", delegatedBy: null, parentId: "obj2", status: "on_track", priority: "high", progress: 80, dueDate: daysFromNow(20), startDate: daysAgo(60), department: "Automation", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "John Latz to complete final commissioning at Tioga pad", type: "simple",
    subtasks: [
      { id: "st11", title: "Install hardware at 8 well sites", progress: 100, status: "completed", ownerId: "u14" },
      { id: "st12", title: "Commission and test SCADA integration", progress: 60, status: "on_track", ownerId: "u14" },
    ],
    messages: [
      { id: "m15", userId: "u14", text: "All 8 units installed. SCADA integration complete on 5 of 8. Remaining 3 are at the Tioga pad — Continental's IT is dragging on firewall rules.", ts: daysAgo(3), attachments: [] },
      { id: "m16", userId: "u4", text: "I'll call their IT manager tomorrow. We can't let firewall rules hold up a $200K deal.", ts: daysAgo(2), attachments: [{ name: "mSafe_v2.1_Commissioning_Log.pdf", type: "pdf" }] },
    ],
    updates: [{ ts: daysAgo(60), status: "not_started", progress: 0, note: "Project kicked off" }, { ts: daysAgo(30), status: "on_track", progress: 50, note: "4 of 8 installed" }, { ts: daysAgo(3), status: "on_track", progress: 80, note: "All installed, 5/8 commissioned" }],
    files: [{ name: "mSafe_v2.1_Install_Photos.zip", type: "archive", size: "45 MB", ts: daysAgo(10) }]
  },
  { id: "obj7", title: "Complete SmartWing Integration Testing", description: "Full integration test of SmartWing automated valve control system with Continental's SCADA infrastructure.", ownerId: "u4", createdBy: "u4", delegatedBy: null, parentId: "obj2", status: "blocked", priority: "high", progress: 50, dueDate: daysFromNow(30), startDate: daysAgo(45), department: "Automation", acknowledged: true, blockerFlag: true, blockerReason: "Waiting on Continental to provide API access to their SCADA system", nextAction: "Follow up with Continental IT director", type: "simple",
    subtasks: [
      { id: "st13", title: "Bench test SmartWing controllers", progress: 100, status: "completed", ownerId: "u14" },
      { id: "st14", title: "Field integration with SCADA", progress: 0, status: "blocked", ownerId: "u14" },
    ],
    messages: [
      { id: "m17", userId: "u14", text: "All 5 controllers passed bench testing. We're dead in the water on field integration until Continental gives us SCADA API access.", ts: daysAgo(10), attachments: [] },
      { id: "m18", userId: "u4", text: "I've escalated to their VP of Operations. He said he'd push IT but no timeline.", ts: daysAgo(7), attachments: [] },
      { id: "m19", userId: "u1", text: "Drew, I'll call their CEO directly. We can't have two projects stalled on the same IT bottleneck.", ts: daysAgo(5), attachments: [] },
    ],
    updates: [{ ts: daysAgo(45), status: "not_started", progress: 0, note: "Testing initiated" }, { ts: daysAgo(20), status: "on_track", progress: 50, note: "Bench testing complete" }, { ts: daysAgo(10), status: "blocked", progress: 50, note: "Blocked on Continental SCADA API access" }],
    files: [{ name: "SmartWing_Bench_Test_Results.pdf", type: "pdf", size: "3.2 MB", ts: daysAgo(10) }]
  },
  { id: "obj8", title: "Complete Immigration Documentation for 4 International Hires", description: "Process H-2B visa extensions and I-9 compliance documentation for four international field technicians.", ownerId: "u6", createdBy: "u6", delegatedBy: null, parentId: null, status: "at_risk", priority: "critical", progress: 75, dueDate: daysFromNow(5), startDate: daysAgo(60), department: "HR", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Submit final two I-129 petitions to USCIS", type: "simple",
    subtasks: [
      { id: "st15", title: "File H-2B extensions for Rodriguez & Garcia", progress: 100, status: "completed", ownerId: "u6" },
      { id: "st16", title: "File H-2B extensions for Nguyen & Petrov", progress: 50, status: "at_risk", ownerId: "u6" },
    ],
    messages: [
      { id: "m20", userId: "u6", text: "Rodriguez and Garcia extensions approved. Nguyen and Petrov petitions need employer attestation forms signed by Jake. Due this week.", ts: daysAgo(3), attachments: [] },
      { id: "m21", userId: "u1", text: "I'll sign them tomorrow morning. Have Mercileidy put them on my desk.", ts: daysAgo(2), attachments: [] },
      { id: "m22", userId: "u22", text: "Forms are on your desk, Jake. Flagged with orange tabs where your signature is needed.", ts: daysAgo(1), attachments: [] },
    ],
    updates: [{ ts: daysAgo(60), status: "not_started", progress: 0, note: "Immigration process initiated" }, { ts: daysAgo(3), status: "at_risk", progress: 75, note: "Two extensions approved, two pending — deadline tight" }],
    files: [{ name: "H2B_Extension_Tracker.xlsx", type: "spreadsheet", size: "85 KB", ts: daysAgo(3) }]
  },
  { id: "obj9", title: "Roll Out Updated Safety Training Curriculum", description: "Deploy new safety training modules covering H2S, confined space, and fall protection for all field personnel.", ownerId: "u6", createdBy: "u2", delegatedBy: "u2", parentId: "obj3", status: "on_track", priority: "medium", progress: 40, dueDate: daysFromNow(45), startDate: daysAgo(20), department: "HR", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Schedule May training sessions with field crews", type: "simple",
    subtasks: [],
    messages: [
      { id: "m23", userId: "u6", text: "New H2S and confined space modules are ready. Fall protection module needs Casey to review the field scenarios.", ts: daysAgo(5), attachments: [] },
      { id: "m24", userId: "u13", text: "I'll have the fall protection review done by Monday. The new harness requirements from OSHA need to be incorporated.", ts: daysAgo(4), attachments: [] },
    ],
    updates: [{ ts: daysAgo(20), status: "not_started", progress: 0, note: "Curriculum development started" }, { ts: daysAgo(5), status: "on_track", progress: 40, note: "2 of 3 modules complete" }],
    files: [{ name: "H2S_Training_Module_v3.pdf", type: "pdf", size: "4.5 MB", ts: daysAgo(5) }]
  },
  { id: "obj10", title: "Onboard 3 New Field Technicians", description: "Recruit, hire, and complete onboarding for three new field technicians to support Bakken expansion.", ownerId: "u5", createdBy: "u1", delegatedBy: "u1", parentId: "obj2", status: "on_track", priority: "medium", progress: 33, dueDate: daysFromNow(40), startDate: daysAgo(25), department: "Sales", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Kelby to screen remaining 8 applicants", type: "simple",
    subtasks: [
      { id: "st17", title: "Hire Field Tech — Position 1", progress: 100, status: "completed", ownerId: "u5" },
      { id: "st18", title: "Hire Field Tech — Position 2", progress: 30, status: "on_track", ownerId: "u5" },
      { id: "st19", title: "Hire Field Tech — Position 3", progress: 0, status: "not_started", ownerId: "u5" },
    ],
    messages: [
      { id: "m25", userId: "u5", text: "First hire starts Monday — Marcus Reeves, came from Halliburton. Strong mechanical background.", ts: daysAgo(4), attachments: [] },
    ],
    updates: [{ ts: daysAgo(25), status: "not_started", progress: 0, note: "Hiring initiative launched" }, { ts: daysAgo(4), status: "on_track", progress: 33, note: "First hire completed" }],
    files: []
  },
  { id: "obj11", title: "Implement Digital Pre-Job Safety Checklists", description: "Replace paper pre-job safety checklists with digital forms accessible on mobile devices for all field crews.", ownerId: "u13", createdBy: "u2", delegatedBy: "u2", parentId: "obj3", status: "not_started", priority: "medium", progress: 0, dueDate: daysFromNow(55), startDate: null, department: "Safety", acknowledged: false, blockerFlag: false, blockerReason: "", nextAction: "Casey to evaluate digital form platforms", type: "simple",
    subtasks: [],
    messages: [
      { id: "m26", userId: "u2", text: "Casey, I want to get the pre-job checklists digital before summer. The paper forms are getting lost in the field.", ts: daysAgo(2), attachments: [] },
    ],
    updates: [],
    files: []
  },
  { id: "obj12", title: "Service All mSand Units at Hess Tioga Pad", description: "Complete scheduled maintenance on all deployed mSand blow-down systems at the Hess Tioga pad site.", ownerId: "u7", createdBy: "u3", delegatedBy: "u3", parentId: "obj4", status: "on_track", priority: "medium", progress: 60, dueDate: daysFromNow(10), startDate: daysAgo(14), department: "Field Operations", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Complete remaining 2 units this week", type: "simple",
    subtasks: [],
    messages: [
      { id: "m27", userId: "u7", text: "3 of 5 units serviced. Replaced seals on Unit 3 — they were shot. Remaining 2 scheduled for Thursday.", ts: daysAgo(2), attachments: [{ name: "Unit3_Seal_Replacement.jpg", type: "image" }] },
    ],
    updates: [{ ts: daysAgo(14), status: "not_started", progress: 0, note: "Service cycle initiated" }, { ts: daysAgo(2), status: "on_track", progress: 60, note: "3 of 5 units complete" }],
    files: [{ name: "Unit3_Seal_Replacement.jpg", type: "image", size: "3.8 MB", ts: daysAgo(2) }]
  },
  { id: "obj13", title: "Process March Payroll Adjustments", description: "Complete all payroll corrections for March including overtime reconciliation and per diem adjustments.", ownerId: "u20", createdBy: "u12", delegatedBy: "u12", parentId: null, status: "completed", priority: "medium", progress: 100, dueDate: daysAgo(2), startDate: daysAgo(15), department: "Admin", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "", type: "simple",
    subtasks: [],
    messages: [
      { id: "m28", userId: "u20", text: "All March adjustments processed. 7 overtime corrections, 3 per diem adjustments. QuickBooks updated.", ts: daysAgo(2), attachments: [] },
      { id: "m29", userId: "u12", text: "Thanks Serena. Clean work as always.", ts: daysAgo(2), attachments: [] },
    ],
    updates: [{ ts: daysAgo(15), status: "not_started", progress: 0, note: "Started" }, { ts: daysAgo(2), status: "completed", progress: 100, note: "All adjustments processed and reconciled" }],
    files: [{ name: "March_Payroll_Adjustments.xlsx", type: "spreadsheet", size: "210 KB", ts: daysAgo(2) }]
  },
  { id: "obj14", title: "Complete H2S Alive Recertification", description: "Complete mandatory H2S Alive safety certification renewal before field deployment eligibility expires.", ownerId: "u8", createdBy: "u3", delegatedBy: "u3", parentId: "obj3", status: "not_started", priority: "high", progress: 0, dueDate: daysFromNow(8), startDate: null, department: "Field Operations", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Zedek to register for next available class", type: "simple",
    subtasks: [],
    messages: [
      { id: "m30", userId: "u3", text: "Zedek, your H2S cert expires in 8 days. You can't be on-site without it. Get registered for the class in Williston this week.", ts: daysAgo(1), attachments: [] },
      { id: "m31", userId: "u8", text: "I know, Malcolm. Already called — the Thursday class is full. Trying to get into the Saturday session.", ts: daysAgo(0), attachments: [] },
    ],
    updates: [],
    files: []
  },
  { id: "obj15", title: "Bench Test 5 SmartWing Controllers", description: "Complete full bench testing and quality validation of 5 SmartWing automated valve controllers before field deployment.", ownerId: "u14", createdBy: "u4", delegatedBy: "u4", parentId: "obj7", status: "completed", priority: "high", progress: 100, dueDate: daysAgo(5), startDate: daysAgo(20), department: "Automation", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "", type: "simple",
    subtasks: [],
    messages: [
      { id: "m32", userId: "u14", text: "All 5 controllers passed. Pressure response within spec, failsafe triggers clean, Modbus comms solid.", ts: daysAgo(5), attachments: [] },
      { id: "m33", userId: "u4", text: "Nice work, John. Documenting the test results for Continental's engineering team.", ts: daysAgo(5), attachments: [] },
    ],
    updates: [{ ts: daysAgo(20), status: "not_started", progress: 0, note: "Testing started" }, { ts: daysAgo(5), status: "completed", progress: 100, note: "All 5 controllers passed bench test" }],
    files: [{ name: "SmartWing_Bench_Results_All5.pdf", type: "pdf", size: "5.1 MB", ts: daysAgo(5) }]
  },
  { id: "obj16", title: "Update CP Warehouse RFID Gateway Firmware", description: "Deploy firmware update v3.2 to all CP Warehouse RFID gateways to fix the false-read issue on gate 4.", ownerId: "u16", createdBy: "u3", delegatedBy: "u3", parentId: null, status: "at_risk", priority: "medium", progress: 20, dueDate: daysAgo(3), startDate: daysAgo(20), department: "Operations", acknowledged: true, blockerFlag: false, blockerReason: "", nextAction: "Adam to schedule downtime window with dispatch", type: "simple",
    subtasks: [],
    messages: [
      { id: "m34", userId: "u16", text: "Firmware is staged but I need a 2-hour downtime window. Dispatch keeps pushing back.", ts: daysAgo(5), attachments: [] },
      { id: "m35", userId: "u11", text: "Saturday morning works. We have minimal gate traffic before 8am.", ts: daysAgo(4), attachments: [] },
      { id: "m36", userId: "u16", text: "Saturday it is. I'll be there at 6am.", ts: daysAgo(3), attachments: [] },
    ],
    updates: [{ ts: daysAgo(20), status: "not_started", progress: 0, note: "Firmware update planned" }, { ts: daysAgo(5), status: "at_risk", progress: 20, note: "Firmware staged, waiting for downtime window" }],
    files: [{ name: "RFID_Gateway_FW_v3.2_Release_Notes.pdf", type: "pdf", size: "450 KB", ts: daysAgo(10) }]
  },
];

export const INITIAL_NOTIFICATIONS = [
  { id: "n1", userId: "u1", type: "delegation", objectiveId: "obj11", message: "Joshua Blackaby delegated 'Implement Digital Pre-Job Safety Checklists' to Casey Loving", isRead: false, ts: daysAgo(2) },
  { id: "n2", userId: "u1", type: "blocker", objectiveId: "obj7", message: "Drew Anderson flagged 'SmartWing Integration Testing' as BLOCKED", isRead: false, ts: daysAgo(10) },
  { id: "n3", userId: "u1", type: "status_change", objectiveId: "obj5", message: "API Q2 Audit Documentation changed to AT RISK", isRead: false, ts: daysAgo(8) },
  { id: "n4", userId: "u1", type: "overdue", objectiveId: "obj16", message: "CP Warehouse RFID Gateway Firmware update is 3 days overdue", isRead: true, ts: daysAgo(3) },
  { id: "n5", userId: "u1", type: "comment", objectiveId: "obj1", message: "Drew Anderson commented on 'Achieve Q2 Revenue Target'", isRead: true, ts: daysAgo(2) },
  { id: "n6", userId: "u1", type: "due_soon", objectiveId: "obj8", message: "Immigration Documentation due in 5 days — currently at risk", isRead: false, ts: daysAgo(1) },
  { id: "n7", userId: "u4", type: "delegation", objectiveId: "obj6", message: "You own 'Deploy mSafe v2.1 to Continental Wells'", isRead: true, ts: daysAgo(60) },
  { id: "n8", userId: "u13", type: "assignment", objectiveId: "obj11", message: "Joshua Blackaby assigned you 'Implement Digital Pre-Job Safety Checklists'", isRead: false, ts: daysAgo(2) },
  { id: "n9", userId: "u9", type: "due_soon", objectiveId: "obj5", message: "API Q2 Audit Documentation due in 12 days", isRead: false, ts: daysAgo(1) },
  { id: "n10", userId: "u3", type: "status_change", objectiveId: "obj5", message: "Tim Dibben's audit documentation changed to AT RISK", isRead: false, ts: daysAgo(8) },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
export const getUser = (id) => USERS.find(u => u.id === id) || { id: "unknown", name: "Unknown", initials: "??", color: "#666", role: "contributor", department: "—", title: "—" };

export const STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  on_track: { label: "On Track", color: "#10B981", bg: "rgba(16,185,129,0.1)" },
  at_risk: { label: "At Risk", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  blocked: { label: "Blocked", color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
  completed: { label: "Completed", color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
  cancelled: { label: "Cancelled", color: "#9CA3AF", bg: "rgba(156,163,175,0.1)" },
};

export const PRIORITY_CONFIG = {
  critical: { label: "Critical", color: "#EF4444" },
  high: { label: "High", color: "#F97316" },
  medium: { label: "Medium", color: "#F59E0B" },
  low: { label: "Low", color: "#6B7280" },
};

export const getStatusColor = (s) => STATUS_CONFIG[s]?.color || "#6B7280";
export const getStatusLabel = (s) => STATUS_CONFIG[s]?.label || s;
export const getStatusBg = (s) => STATUS_CONFIG[s]?.bg || "rgba(107,114,128,0.1)";
export const getPriorityColor = (p) => PRIORITY_CONFIG[p]?.color || "#6B7280";

export const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  const n = new Date();
  const diff = Math.floor((dt - n) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0 && diff <= 7) return `In ${diff} days`;
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const timeAgo = (ts) => {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const isOverdue = (obj) => obj.dueDate && new Date(obj.dueDate) < new Date() && obj.status !== "completed" && obj.status !== "cancelled";

export const getDirectReports = (userId) => USERS.filter(u => u.reportsTo === userId);

export const canDelegate = (user, targetUser) => {
  if (user.role === "executive") return true;
  if (user.role === "manager") {
    const reports = getDirectReports(user.id);
    return reports.some(r => r.id === targetUser.id);
  }
  return false;
};

export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
