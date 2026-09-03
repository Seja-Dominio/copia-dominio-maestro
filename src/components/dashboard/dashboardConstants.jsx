import { Image, Film, Play, Briefcase, BarChart3, FileText } from "lucide-react";

export const STATUS_CONFIG = {
  pending_briefing: { label: "Pend. Briefing", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  pending_capture: { label: "Pend. Captação", color: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  pending_design: { label: "Pend. Designer", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  pending_edit: { label: "Pend. Edição", color: "bg-purple-100 text-purple-700", dot: "bg-purple-500" },
  internal_approval: { label: "Aprov. Interna", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  client_approval: { label: "Aprov. Cliente", color: "bg-pink-100 text-pink-700", dot: "bg-pink-500" },
  scheduled: { label: "Agendado", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-700", dot: "bg-green-600" },
};

export const CONTENT_ICONS = {
  feed_card: Image,
  card: Image,
  reels: Film,
  story: Play,
  video: Film,
  card_trafego: Image,
  video_trafego: Film,
  trafego_pago: BarChart3,
  email: FileText,
  blog: FileText,
  outros: Briefcase,
};