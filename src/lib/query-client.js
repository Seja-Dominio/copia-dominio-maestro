import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			staleTime: 1000 * 60 * 2,      // dados são frescos por 2 minutos
			gcTime: 1000 * 60 * 10,         // mantém em cache por 10 minutos
			refetchOnMount: false,           // não refetch se dados ainda estão frescos
			refetchOnReconnect: false,
		},
	},
});