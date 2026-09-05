ALTER TABLE public.replies DROP CONSTRAINT IF EXISTS replies_parent_reply_id_fkey;
ALTER TABLE public.replies
  ADD CONSTRAINT replies_parent_reply_id_fkey
  FOREIGN KEY (parent_reply_id) REFERENCES public.replies(id)
  ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED;

DROP TRIGGER IF EXISTS trg_reparent_reply_children ON public.replies;
CREATE TRIGGER trg_reparent_reply_children
AFTER DELETE ON public.replies
FOR EACH ROW EXECUTE FUNCTION public.reparent_reply_children();