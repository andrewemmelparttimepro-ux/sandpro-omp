-- Attribute every browser-created notification to the signed-in caller. Server
-- jobs use service_role and continue to bypass RLS for system notifications.
drop policy if exists "Notifications insertable" on public.notifications;
drop policy if exists "System can insert notifications" on public.notifications;
create policy "Authenticated users send attributed notifications"
on public.notifications
for insert
to authenticated
with check (sender_id = (select auth.uid()));

-- Remove policies whose row set is already fully covered by another policy.
-- These changes preserve access while avoiding duplicate permissive policy
-- evaluation on the affected hot paths.
drop policy if exists "Users view own alt dashboard preferences" on public.alt_dashboard_preferences;
drop policy if exists "KPI alert events viewable by authenticated" on public.kpi_alert_events;
drop policy if exists "Users view own notification preferences" on public.notification_preferences;
drop policy if exists "Own notifications viewable" on public.notifications;
drop policy if exists "Own notifications updatable" on public.notifications;
drop policy if exists "OKR assessment artifacts viewable by all authenticated" on public.okr_assessment_artifacts;
drop policy if exists "OKR project links viewable by all authenticated" on public.okr_project_kr_links;
