-- ============================================================================
-- SandPro OMP — Seed Data
-- Run AFTER migration.sql
-- NOTE: Users are created via Supabase Auth signup, which auto-creates profiles
-- via the handle_new_user trigger. This script seeds objectives + related data
-- AFTER users have been created via the seed-users.js script.
-- ============================================================================

-- This script expects profiles to already exist (created via Auth signup).
-- It references them by email to get UUIDs dynamically.

-- Helper: get user ID by email
CREATE OR REPLACE FUNCTION get_uid(user_email TEXT) RETURNS UUID AS $$
  SELECT id FROM public.profiles WHERE email = user_email LIMIT 1;
$$ LANGUAGE sql;

-- ============================================================================
-- OBJECTIVES
-- ============================================================================
INSERT INTO public.objectives (id, title, description, owner_id, created_by, delegated_by, parent_id, status, priority, progress, due_date, start_date, department, acknowledged, blocker_flag, blocker_reason, next_action, type, baseline_metric, target_metric, current_metric, metric_unit) VALUES
-- obj1: Q2 Revenue Target
('00000001-0000-0000-0000-000000000001', 'Achieve Q2 2026 Revenue Target of $4.2M', 'Hit consolidated revenue target across all three verticals: sand management, wellhead, and automation.', get_uid('jfeil@sandpro.com'), get_uid('jfeil@sandpro.com'), NULL, NULL, 'on_track', 'critical', 45, NOW() + INTERVAL '89 days', NOW() - INTERVAL '30 days', 'Leadership', true, false, '', 'Review April pipeline with Kelby and Bryan', 'measured', 0, 4200000, 1890000, '$'),

-- obj2: mSeries Expansion
('00000001-0000-0000-0000-000000000002', 'Expand mSeries Product Line to 3 New Operators', 'Deploy mSeries automation products to three new E&P operators beyond existing customer base.', get_uid('jfeil@sandpro.com'), get_uid('jfeil@sandpro.com'), NULL, NULL, 'on_track', 'high', 33, NOW() + INTERVAL '75 days', NOW() - INTERVAL '15 days', 'Leadership', true, false, '', 'Bryan to present at Williston Basin conference', 'simple', NULL, NULL, NULL, ''),

-- obj3: Zero Lost-Time Incidents
('00000001-0000-0000-0000-000000000003', 'Achieve Zero Lost-Time Incidents in Q2', 'Maintain perfect safety record through proactive training, inspections, and near-miss reporting.', get_uid('jblackaby@sandpro.com'), get_uid('jfeil@sandpro.com'), get_uid('jfeil@sandpro.com'), NULL, 'on_track', 'critical', 100, NOW() + INTERVAL '89 days', NOW() - INTERVAL '30 days', 'Safety', true, false, '', 'Casey to complete April inspection cycle', 'simple', NULL, NULL, NULL, ''),

-- obj4: Reduce Equipment Downtime
('00000001-0000-0000-0000-000000000004', 'Reduce Equipment Downtime by 20%', 'Implement predictive maintenance schedules and improve parts inventory to minimize unplanned downtime.', get_uid('mblackaby@sandpro.com'), get_uid('jfeil@sandpro.com'), get_uid('jfeil@sandpro.com'), '00000001-0000-0000-0000-000000000001', 'on_track', 'high', 60, NOW() + INTERVAL '60 days', NOW() - INTERVAL '45 days', 'Operations', true, false, '', 'Adam to audit current parts inventory levels', 'measured', 100, 80, 85, 'hrs/month'),

-- obj5: API Q2 Audit
('00000001-0000-0000-0000-000000000005', 'Complete API Q2 Audit Documentation', 'Prepare and submit all required API Spec Q2 documentation for the Q2 quality audit cycle.', get_uid('tdibben@sandpro.com'), get_uid('mblackaby@sandpro.com'), get_uid('mblackaby@sandpro.com'), NULL, 'at_risk', 'high', 25, NOW() + INTERVAL '12 days', NOW() - INTERVAL '40 days', 'Quality', true, false, '', 'Tim to compile welding procedure qualifications by Friday', 'simple', NULL, NULL, NULL, ''),

-- obj6: mSafe v2.1 Deploy
('00000001-0000-0000-0000-000000000006', 'Deploy mSafe v2.1 to Continental Wells', 'Install and commission mSafe v2.1 pressure monitoring systems across Continental''s Bakken well sites.', get_uid('danderson@sandpro.com'), get_uid('danderson@sandpro.com'), NULL, '00000001-0000-0000-0000-000000000002', 'on_track', 'high', 80, NOW() + INTERVAL '20 days', NOW() - INTERVAL '60 days', 'Automation', true, false, '', 'John Latz to complete final commissioning at Tioga pad', 'simple', NULL, NULL, NULL, ''),

-- obj7: SmartWing Integration
('00000001-0000-0000-0000-000000000007', 'Complete SmartWing Integration Testing', 'Full integration test of SmartWing automated valve control system with Continental''s SCADA infrastructure.', get_uid('danderson@sandpro.com'), get_uid('danderson@sandpro.com'), NULL, '00000001-0000-0000-0000-000000000002', 'blocked', 'high', 50, NOW() + INTERVAL '30 days', NOW() - INTERVAL '45 days', 'Automation', true, true, 'Waiting on Continental to provide API access to their SCADA system', 'Follow up with Continental IT director', 'simple', NULL, NULL, NULL, ''),

-- obj8: Immigration Documentation
('00000001-0000-0000-0000-000000000008', 'Complete Immigration Documentation for 4 International Hires', 'Process H-2B visa extensions and I-9 compliance documentation for four international field technicians.', get_uid('hallard-kotaska@sandpro.com'), get_uid('hallard-kotaska@sandpro.com'), NULL, NULL, 'at_risk', 'critical', 75, NOW() + INTERVAL '5 days', NOW() - INTERVAL '60 days', 'HR', true, false, '', 'Submit final two I-129 petitions to USCIS', 'simple', NULL, NULL, NULL, ''),

-- obj9: Safety Training
('00000001-0000-0000-0000-000000000009', 'Roll Out Updated Safety Training Curriculum', 'Deploy new safety training modules covering H2S, confined space, and fall protection for all field personnel.', get_uid('hallard-kotaska@sandpro.com'), get_uid('jblackaby@sandpro.com'), get_uid('jblackaby@sandpro.com'), '00000001-0000-0000-0000-000000000003', 'on_track', 'medium', 40, NOW() + INTERVAL '45 days', NOW() - INTERVAL '20 days', 'HR', true, false, '', 'Schedule May training sessions with field crews', 'simple', NULL, NULL, NULL, ''),

-- obj10: Onboard 3 New Field Techs
('00000001-0000-0000-0000-000000000010', 'Onboard 3 New Field Technicians', 'Recruit, hire, and complete onboarding for three new field technicians to support Bakken expansion.', get_uid('kkraft@sandpro.com'), get_uid('jfeil@sandpro.com'), get_uid('jfeil@sandpro.com'), '00000001-0000-0000-0000-000000000002', 'on_track', 'medium', 33, NOW() + INTERVAL '40 days', NOW() - INTERVAL '25 days', 'Sales', true, false, '', 'Kelby to screen remaining 8 applicants', 'simple', NULL, NULL, NULL, ''),

-- obj11: Digital Pre-Job Checklists
('00000001-0000-0000-0000-000000000011', 'Implement Digital Pre-Job Safety Checklists', 'Replace paper pre-job safety checklists with digital forms accessible on mobile devices for all field crews.', get_uid('cloving@sandpro.com'), get_uid('jblackaby@sandpro.com'), get_uid('jblackaby@sandpro.com'), '00000001-0000-0000-0000-000000000003', 'not_started', 'medium', 0, NOW() + INTERVAL '55 days', NULL, 'Safety', false, false, '', 'Casey to evaluate digital form platforms', 'simple', NULL, NULL, NULL, ''),

-- obj12: Service mSand Units
('00000001-0000-0000-0000-000000000012', 'Service All mSand Units at Hess Tioga Pad', 'Complete scheduled maintenance on all deployed mSand blow-down systems at the Hess Tioga pad site.', get_uid('ibadillo@sandpro.com'), get_uid('mblackaby@sandpro.com'), get_uid('mblackaby@sandpro.com'), '00000001-0000-0000-0000-000000000004', 'on_track', 'medium', 60, NOW() + INTERVAL '10 days', NOW() - INTERVAL '14 days', 'Field Operations', true, false, '', 'Complete remaining 2 units this week', 'simple', NULL, NULL, NULL, ''),

-- obj13: March Payroll
('00000001-0000-0000-0000-000000000013', 'Process March Payroll Adjustments', 'Complete all payroll corrections for March including overtime reconciliation and per diem adjustments.', get_uid('slaumb@sandpro.com'), get_uid('ksebastian@sandpro.com'), get_uid('ksebastian@sandpro.com'), NULL, 'completed', 'medium', 100, NOW() - INTERVAL '2 days', NOW() - INTERVAL '15 days', 'Admin', true, false, '', '', 'simple', NULL, NULL, NULL, ''),

-- obj14: H2S Recertification
('00000001-0000-0000-0000-000000000014', 'Complete H2S Alive Recertification', 'Complete mandatory H2S Alive safety certification renewal before field deployment eligibility expires.', get_uid('zharris@sandpro.com'), get_uid('mblackaby@sandpro.com'), get_uid('mblackaby@sandpro.com'), '00000001-0000-0000-0000-000000000003', 'not_started', 'high', 0, NOW() + INTERVAL '8 days', NULL, 'Field Operations', true, false, '', 'Zedek to register for next available class', 'simple', NULL, NULL, NULL, ''),

-- obj15: Bench Test SmartWing
('00000001-0000-0000-0000-000000000015', 'Bench Test 5 SmartWing Controllers', 'Complete full bench testing and quality validation of 5 SmartWing automated valve controllers before field deployment.', get_uid('jlatz@sandpro.com'), get_uid('danderson@sandpro.com'), get_uid('danderson@sandpro.com'), '00000001-0000-0000-0000-000000000007', 'completed', 'high', 100, NOW() - INTERVAL '5 days', NOW() - INTERVAL '20 days', 'Automation', true, false, '', '', 'simple', NULL, NULL, NULL, ''),

-- obj16: RFID Firmware
('00000001-0000-0000-0000-000000000016', 'Update CP Warehouse RFID Gateway Firmware', 'Deploy firmware update v3.2 to all CP Warehouse RFID gateways to fix the false-read issue on gate 4.', get_uid('aallan@sandpro.com'), get_uid('mblackaby@sandpro.com'), get_uid('mblackaby@sandpro.com'), NULL, 'at_risk', 'medium', 20, NOW() - INTERVAL '3 days', NOW() - INTERVAL '20 days', 'Operations', true, false, '', 'Adam to schedule downtime window with dispatch', 'simple', NULL, NULL, NULL, '');

-- ============================================================================
-- MESSAGES (sample conversations)
-- ============================================================================
INSERT INTO public.messages (objective_id, user_id, text, created_at) VALUES
-- obj1 messages
('00000001-0000-0000-0000-000000000001', get_uid('jfeil@sandpro.com'), 'Pipeline looking strong headed into April. Need Drew to close Continental and Kelby to lock Hess.', NOW() - INTERVAL '5 days'),
('00000001-0000-0000-0000-000000000001', get_uid('kkraft@sandpro.com'), 'Hess meeting went well. They''re reviewing the proposal this week. Should have an answer by Friday.', NOW() - INTERVAL '3 days'),
('00000001-0000-0000-0000-000000000001', get_uid('danderson@sandpro.com'), 'Continental wants to see mSafe v2.1 field data before signing. I''ve got Isaac pulling the reports from Tioga.', NOW() - INTERVAL '2 days'),
('00000001-0000-0000-0000-000000000001', get_uid('jfeil@sandpro.com'), 'Good. Let''s get those reports polished and over to them by Wednesday. This is the deal of the quarter.', NOW() - INTERVAL '1 day'),
-- obj3 messages
('00000001-0000-0000-0000-000000000003', get_uid('jblackaby@sandpro.com'), '30 days in, zero incidents. The new pre-job briefing format is working. Crews are catching hazards before they become problems.', NOW() - INTERVAL '3 days'),
('00000001-0000-0000-0000-000000000003', get_uid('cloving@sandpro.com'), 'Completed all April safety stand-downs for North crews. South crews scheduled for next week.', NOW() - INTERVAL '1 day'),
-- obj4 messages
('00000001-0000-0000-0000-000000000004', get_uid('mblackaby@sandpro.com'), 'PM schedules are in place for 75% of the fleet. Jaelen''s team is knocking it out. Parts inventory is the bottleneck.', NOW() - INTERVAL '6 days'),
('00000001-0000-0000-0000-000000000004', get_uid('aallan@sandpro.com'), 'Waiting on back-ordered hydraulic fittings from supplier. ETA 2 weeks. I''ve sourced alternates from Bismarck but they''re 15% more.', NOW() - INTERVAL '4 days'),
('00000001-0000-0000-0000-000000000004', get_uid('mblackaby@sandpro.com'), 'Go with the Bismarck alternates. Downtime costs us more than 15% on fittings. Get them ordered today.', NOW() - INTERVAL '4 days'),
-- obj5 messages
('00000001-0000-0000-0000-000000000005', get_uid('tdibben@sandpro.com'), 'Running behind on NCR documentation. The Minot job from March generated 4 NCRs that still need formal writeup.', NOW() - INTERVAL '8 days'),
('00000001-0000-0000-0000-000000000005', get_uid('mblackaby@sandpro.com'), 'Tim, this audit is in 12 days. What do you need from me to get this done?', NOW() - INTERVAL '7 days'),
('00000001-0000-0000-0000-000000000005', get_uid('tdibben@sandpro.com'), 'If I can get one person for 3 days to handle the calibration records, I can focus on the NCRs and WPS updates.', NOW() - INTERVAL '7 days'),
-- obj6 messages
('00000001-0000-0000-0000-000000000006', get_uid('jlatz@sandpro.com'), 'All 8 units installed. SCADA integration complete on 5 of 8. Remaining 3 are at the Tioga pad — Continental''s IT is dragging on firewall rules.', NOW() - INTERVAL '3 days'),
('00000001-0000-0000-0000-000000000006', get_uid('danderson@sandpro.com'), 'I''ll call their IT manager tomorrow. We can''t let firewall rules hold up a $200K deal.', NOW() - INTERVAL '2 days'),
-- obj7 messages
('00000001-0000-0000-0000-000000000007', get_uid('jlatz@sandpro.com'), 'All 5 controllers passed bench testing. We''re dead in the water on field integration until Continental gives us SCADA API access.', NOW() - INTERVAL '10 days'),
('00000001-0000-0000-0000-000000000007', get_uid('danderson@sandpro.com'), 'I''ve escalated to their VP of Operations. He said he''d push IT but no timeline.', NOW() - INTERVAL '7 days'),
('00000001-0000-0000-0000-000000000007', get_uid('jfeil@sandpro.com'), 'Drew, I''ll call their CEO directly. We can''t have two projects stalled on the same IT bottleneck.', NOW() - INTERVAL '5 days'),
-- obj8 messages
('00000001-0000-0000-0000-000000000008', get_uid('hallard-kotaska@sandpro.com'), 'Rodriguez and Garcia extensions approved. Nguyen and Petrov petitions need employer attestation forms signed by Jake. Due this week.', NOW() - INTERVAL '3 days'),
('00000001-0000-0000-0000-000000000008', get_uid('jfeil@sandpro.com'), 'I''ll sign them tomorrow morning. Have Mercileidy put them on my desk.', NOW() - INTERVAL '2 days'),
('00000001-0000-0000-0000-000000000008', get_uid('mjimenez@sandpro.com'), 'Forms are on your desk, Jake. Flagged with orange tabs where your signature is needed.', NOW() - INTERVAL '1 day'),
-- obj14 messages
('00000001-0000-0000-0000-000000000014', get_uid('mblackaby@sandpro.com'), 'Zedek, your H2S cert expires in 8 days. You can''t be on-site without it. Get registered for the class in Williston this week.', NOW() - INTERVAL '1 day'),
('00000001-0000-0000-0000-000000000014', get_uid('zharris@sandpro.com'), 'I know, Malcolm. Already called — the Thursday class is full. Trying to get into the Saturday session.', NOW());

-- ============================================================================
-- SUBTASKS
-- ============================================================================
INSERT INTO public.subtasks (objective_id, title, progress, status, owner_id) VALUES
('00000001-0000-0000-0000-000000000001', 'Close Continental automation deal', 70, 'on_track', get_uid('danderson@sandpro.com')),
('00000001-0000-0000-0000-000000000001', 'Finalize Hess Q2 sand management contract', 50, 'on_track', get_uid('kkraft@sandpro.com')),
('00000001-0000-0000-0000-000000000002', 'Demo mSand to Whiting Petroleum', 80, 'on_track', get_uid('bcarpenter@sandpro.com')),
('00000001-0000-0000-0000-000000000002', 'Proposal for Marathon Oil mSafe deployment', 20, 'not_started', get_uid('bcarpenter@sandpro.com')),
('00000001-0000-0000-0000-000000000002', 'Pilot mAutoGrease+ with Oasis', 0, 'not_started', get_uid('danderson@sandpro.com')),
('00000001-0000-0000-0000-000000000004', 'Implement PM schedule for all rental fleet', 75, 'on_track', get_uid('jmaslowski@sandpro.com')),
('00000001-0000-0000-0000-000000000004', 'Stock critical spare parts at Berthold shop', 40, 'at_risk', get_uid('aallan@sandpro.com')),
('00000001-0000-0000-0000-000000000005', 'Update WPS/PQR documentation', 50, 'on_track', get_uid('tdibben@sandpro.com')),
('00000001-0000-0000-0000-000000000005', 'Complete non-conformance reports', 10, 'at_risk', get_uid('tdibben@sandpro.com')),
('00000001-0000-0000-0000-000000000005', 'Finalize calibration records', 0, 'not_started', get_uid('jmaslowski@sandpro.com')),
('00000001-0000-0000-0000-000000000006', 'Install hardware at 8 well sites', 100, 'completed', get_uid('jlatz@sandpro.com')),
('00000001-0000-0000-0000-000000000006', 'Commission and test SCADA integration', 60, 'on_track', get_uid('jlatz@sandpro.com')),
('00000001-0000-0000-0000-000000000007', 'Bench test SmartWing controllers', 100, 'completed', get_uid('jlatz@sandpro.com')),
('00000001-0000-0000-0000-000000000007', 'Field integration with SCADA', 0, 'blocked', get_uid('jlatz@sandpro.com')),
('00000001-0000-0000-0000-000000000008', 'File H-2B extensions for Rodriguez & Garcia', 100, 'completed', get_uid('hallard-kotaska@sandpro.com')),
('00000001-0000-0000-0000-000000000008', 'File H-2B extensions for Nguyen & Petrov', 50, 'at_risk', get_uid('hallard-kotaska@sandpro.com')),
('00000001-0000-0000-0000-000000000010', 'Hire Field Tech — Position 1', 100, 'completed', get_uid('kkraft@sandpro.com')),
('00000001-0000-0000-0000-000000000010', 'Hire Field Tech — Position 2', 30, 'on_track', get_uid('kkraft@sandpro.com')),
('00000001-0000-0000-0000-000000000010', 'Hire Field Tech — Position 3', 0, 'not_started', get_uid('kkraft@sandpro.com'));

-- ============================================================================
-- OBJECTIVE UPDATES (activity log)
-- ============================================================================
INSERT INTO public.objective_updates (objective_id, status, progress, note, created_at) VALUES
('00000001-0000-0000-0000-000000000001', 'not_started', 0, 'Q2 begins', NOW() - INTERVAL '30 days'),
('00000001-0000-0000-0000-000000000001', 'on_track', 20, 'First sand management invoices shipped', NOW() - INTERVAL '20 days'),
('00000001-0000-0000-0000-000000000001', 'on_track', 45, 'Pipeline at $3.8M potential, need to convert', NOW() - INTERVAL '7 days'),
('00000001-0000-0000-0000-000000000004', 'not_started', 0, 'Initiative started', NOW() - INTERVAL '45 days'),
('00000001-0000-0000-0000-000000000004', 'on_track', 35, 'PM scheduling underway', NOW() - INTERVAL '20 days'),
('00000001-0000-0000-0000-000000000004', 'on_track', 60, '75% fleet on PM schedule', NOW() - INTERVAL '6 days'),
('00000001-0000-0000-0000-000000000005', 'not_started', 0, 'Audit prep initiated', NOW() - INTERVAL '40 days'),
('00000001-0000-0000-0000-000000000005', 'on_track', 20, 'WPS updates started', NOW() - INTERVAL '15 days'),
('00000001-0000-0000-0000-000000000005', 'at_risk', 25, 'NCR backlog identified, timeline tight', NOW() - INTERVAL '8 days'),
('00000001-0000-0000-0000-000000000007', 'not_started', 0, 'Testing initiated', NOW() - INTERVAL '45 days'),
('00000001-0000-0000-0000-000000000007', 'on_track', 50, 'Bench testing complete', NOW() - INTERVAL '20 days'),
('00000001-0000-0000-0000-000000000007', 'blocked', 50, 'Blocked on Continental SCADA API access', NOW() - INTERVAL '10 days'),
('00000001-0000-0000-0000-000000000013', 'not_started', 0, 'Started', NOW() - INTERVAL '15 days'),
('00000001-0000-0000-0000-000000000013', 'completed', 100, 'All adjustments processed and reconciled', NOW() - INTERVAL '2 days'),
('00000001-0000-0000-0000-000000000015', 'not_started', 0, 'Testing started', NOW() - INTERVAL '20 days'),
('00000001-0000-0000-0000-000000000015', 'completed', 100, 'All 5 controllers passed bench test', NOW() - INTERVAL '5 days');

-- ============================================================================
-- FILES
-- ============================================================================
INSERT INTO public.files (objective_id, name, type, size, created_at) VALUES
('00000001-0000-0000-0000-000000000001', 'Q2_Pipeline_Summary.pdf', 'pdf', '2.4 MB', NOW() - INTERVAL '5 days'),
('00000001-0000-0000-0000-000000000003', 'April_Safety_Standown_Report.pdf', 'pdf', '1.1 MB', NOW() - INTERVAL '1 day'),
('00000001-0000-0000-0000-000000000004', 'Fleet_PM_Schedule.xlsx', 'spreadsheet', '340 KB', NOW() - INTERVAL '6 days'),
('00000001-0000-0000-0000-000000000005', 'Q2_Audit_Checklist.pdf', 'pdf', '890 KB', NOW() - INTERVAL '15 days'),
('00000001-0000-0000-0000-000000000005', 'NCR_Backlog_List.xlsx', 'spreadsheet', '120 KB', NOW() - INTERVAL '8 days'),
('00000001-0000-0000-0000-000000000006', 'mSafe_v2.1_Install_Photos.zip', 'archive', '45 MB', NOW() - INTERVAL '10 days'),
('00000001-0000-0000-0000-000000000007', 'SmartWing_Bench_Test_Results.pdf', 'pdf', '3.2 MB', NOW() - INTERVAL '10 days'),
('00000001-0000-0000-0000-000000000008', 'H2B_Extension_Tracker.xlsx', 'spreadsheet', '85 KB', NOW() - INTERVAL '3 days'),
('00000001-0000-0000-0000-000000000009', 'H2S_Training_Module_v3.pdf', 'pdf', '4.5 MB', NOW() - INTERVAL '5 days'),
('00000001-0000-0000-0000-000000000012', 'Unit3_Seal_Replacement.jpg', 'image', '3.8 MB', NOW() - INTERVAL '2 days'),
('00000001-0000-0000-0000-000000000013', 'March_Payroll_Adjustments.xlsx', 'spreadsheet', '210 KB', NOW() - INTERVAL '2 days'),
('00000001-0000-0000-0000-000000000015', 'SmartWing_Bench_Results_All5.pdf', 'pdf', '5.1 MB', NOW() - INTERVAL '5 days'),
('00000001-0000-0000-0000-000000000016', 'RFID_Gateway_FW_v3.2_Release_Notes.pdf', 'pdf', '450 KB', NOW() - INTERVAL '10 days');

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================
INSERT INTO public.notifications (user_id, type, objective_id, message, is_read, created_at) VALUES
(get_uid('jfeil@sandpro.com'), 'delegation', '00000001-0000-0000-0000-000000000011', 'Joshua Blackaby delegated ''Implement Digital Pre-Job Safety Checklists'' to Casey Loving', false, NOW() - INTERVAL '2 days'),
(get_uid('jfeil@sandpro.com'), 'blocker', '00000001-0000-0000-0000-000000000007', 'Drew Anderson flagged ''SmartWing Integration Testing'' as BLOCKED', false, NOW() - INTERVAL '10 days'),
(get_uid('jfeil@sandpro.com'), 'status_change', '00000001-0000-0000-0000-000000000005', 'API Q2 Audit Documentation changed to AT RISK', false, NOW() - INTERVAL '8 days'),
(get_uid('jfeil@sandpro.com'), 'overdue', '00000001-0000-0000-0000-000000000016', 'CP Warehouse RFID Gateway Firmware update is 3 days overdue', true, NOW() - INTERVAL '3 days'),
(get_uid('jfeil@sandpro.com'), 'due_soon', '00000001-0000-0000-0000-000000000008', 'Immigration Documentation due in 5 days — currently at risk', false, NOW() - INTERVAL '1 day'),
(get_uid('danderson@sandpro.com'), 'delegation', '00000001-0000-0000-0000-000000000006', 'You own ''Deploy mSafe v2.1 to Continental Wells''', true, NOW() - INTERVAL '60 days'),
(get_uid('cloving@sandpro.com'), 'assignment', '00000001-0000-0000-0000-000000000011', 'Joshua Blackaby assigned you ''Implement Digital Pre-Job Safety Checklists''', false, NOW() - INTERVAL '2 days'),
(get_uid('tdibben@sandpro.com'), 'due_soon', '00000001-0000-0000-0000-000000000005', 'API Q2 Audit Documentation due in 12 days', false, NOW() - INTERVAL '1 day'),
(get_uid('mblackaby@sandpro.com'), 'status_change', '00000001-0000-0000-0000-000000000005', 'Tim Dibben''s audit documentation changed to AT RISK', false, NOW() - INTERVAL '8 days');

-- Cleanup helper
DROP FUNCTION IF EXISTS get_uid(TEXT);
