"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { api, type SessionUser } from "@/lib/api";

type SessionContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  user: null,
  isLoading: true,
  refresh: async () => undefined,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: api.getSession,
    retry: false,
    staleTime: 60_000,
  });
  const user = query.data?.user ?? null;
  return (
    <SessionContext.Provider
      value={{
        user,
        isLoading: query.isLoading,
        refresh: async () => {
          await queryClient.invalidateQueries({ queryKey: ["session"] });
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
