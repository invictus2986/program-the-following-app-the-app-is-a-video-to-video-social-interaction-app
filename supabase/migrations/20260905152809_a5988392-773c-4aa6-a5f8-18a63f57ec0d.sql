-- Grant SELECT on new conversation-deletion metadata columns to public API roles
GRANT SELECT (promoted_from_deleted_parent, promoted_at) ON public.videos TO anon, authenticated;
GRANT SELECT (parent_deleted) ON public.replies TO anon, authenticated;
