import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  CalendarHeart,
  Filter,
  CalendarClock,
  DollarSign,
  Users,
  TrendingUp,
  AlertTriangle,
  Settings,
  ScrollText,
  Building2,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  ready: boolean;
}

export const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Geral",
    items: [
      { href: "/", label: "Visão Geral", icon: LayoutDashboard, ready: true },
      { href: "/agenda", label: "Agenda", icon: CalendarHeart, ready: true },
      { href: "/diario", label: "Acompanhamento Diário", icon: CalendarDays, ready: false },
      { href: "/mensal", label: "Resumo Mensal", icon: CalendarRange, ready: false },
    ],
  },
  {
    title: "Unidades",
    items: [
      { href: "/unidade/almeria", label: "Almeria", icon: Building2, ready: true },
      { href: "/unidade/izzi", label: "Izzi Wine Garden", icon: Building2, ready: true },
    ],
  },
  {
    title: "Análise",
    items: [
      { href: "/pipeline", label: "Pipeline Comercial", icon: Filter, ready: true },
      { href: "/eventos-futuros", label: "Eventos Futuros", icon: CalendarClock, ready: true },
      { href: "/financeiro", label: "Financeiro", icon: DollarSign, ready: true },
      { href: "/leads", label: "Leads", icon: Users, ready: true },
      { href: "/performance", label: "Performance", icon: TrendingUp, ready: true },
      { href: "/alertas", label: "Alertas", icon: AlertTriangle, ready: true },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/configuracoes", label: "Configurações", icon: Settings, ready: true },
      { href: "/logs", label: "Logs e Auditoria", icon: ScrollText, ready: true },
    ],
  },
];
