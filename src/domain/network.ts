export type NetworkAvailability = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

/**
 * NetInfo reachability probes can be blocked even while the API is reachable.
 * Only a confirmed disconnected transport should suppress an actual sync attempt.
 */
export function shouldAttemptSync(network: NetworkAvailability): boolean {
  return network.isConnected !== false;
}
