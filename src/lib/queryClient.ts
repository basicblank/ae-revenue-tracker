import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const SALES_DEPENDENT_KEYS = new Set(['sales', 'kpis', 'revenue']);

export function invalidateSalesData(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) => SALES_DEPENDENT_KEYS.has(q.queryKey[0] as string),
  });
}
