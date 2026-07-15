-- Give Tim platform-admin deletion rights without changing his manager role.
DROP POLICY IF EXISTS "Authenticated users can delete OKR projects" ON public.okr_projects;
CREATE POLICY "Authenticated users can delete OKR projects"
  ON public.okr_projects FOR DELETE TO authenticated USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Owners and creators can delete objectives" ON public.objectives;
DROP POLICY IF EXISTS "Objective creators and admins can delete objectives" ON public.objectives;
CREATE POLICY "Objective creators and admins can delete objectives"
  ON public.objectives FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'executive' OR lower(email) IN ('jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro'))
    )
  );

NOTIFY pgrst, 'reload schema';
