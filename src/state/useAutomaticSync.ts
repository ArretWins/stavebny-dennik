import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { shouldAttemptSync } from "@/domain/network";

type AutomaticSyncOptions = {
  enabled: boolean;
  loading: boolean;
  userId?: string;
  hasPendingWork: () => boolean;
  syncNow: () => Promise<void>;
};

/** Starts one retry after startup and whenever a network transport returns. */
export function useAutomaticSync({
  enabled,
  loading,
  userId,
  hasPendingWork,
  syncNow,
}: AutomaticSyncOptions): void {
  const startupSyncUserRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !userId) return;
    return NetInfo.addEventListener((network) => {
      if (shouldAttemptSync(network) && hasPendingWork()) {
        void syncNow().catch(() => undefined);
      }
    });
  }, [enabled, hasPendingWork, syncNow, userId]);

  useEffect(() => {
    if (!userId) {
      startupSyncUserRef.current = undefined;
      return;
    }
    if (
      !enabled ||
      loading ||
      startupSyncUserRef.current === userId ||
      !hasPendingWork()
    ) {
      return;
    }
    startupSyncUserRef.current = userId;
    void NetInfo.fetch()
      .then((network) => {
        if (shouldAttemptSync(network)) return syncNow();
      })
      .catch(() => undefined);
  }, [enabled, hasPendingWork, loading, syncNow, userId]);
}
