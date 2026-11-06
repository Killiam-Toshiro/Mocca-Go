export interface TimingView {
  delivered: number;
  onTimeRate: number | null;
  totalMinutes: {
    average: number | null;
    median: number | null;
    p90: number | null;
  };
  stageMinutes: {
    kitchen: number | null;
    waiting: number | null;
    delivery: number | null;
  };
}

export interface MarginFigures {
  revenue: number;
  variableCost: number;
  margin: number;
  variableCostRate: number | null;
}

export interface MetricsView {
  period: { from: string; to: string; days: number; zoneId: string | null };
  sales: {
    orders: number;
    revenue: number;
    averageTicket: number;
    daily: { date: string; orders: number; revenue: number }[];
  };
  margin: MarginFigures & {
    byCategory: (MarginFigures & { category: string })[];
  };
  delivery: TimingView & {
    onTimeThresholdMinutes: number;
    byZone: (TimingView & { zoneName: string })[];
  };
  satisfaction: {
    responses: number;
    average: number | null;
    responseRate: number | null;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
  retention: {
    customers: number;
    repeatCustomers: number;
    repeatRate: number | null;
  };
  outcomes: {
    entregado: number;
    no_entregado: number;
    cancelado: number;
    enCurso: number;
  };
}
