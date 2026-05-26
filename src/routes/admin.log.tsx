import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollText, Trash2, Megaphone, Archive, UserX, Video } from "lucide-react";

export const Route = createFileRoute("/admin/log")({
  component: AdminLog;
});