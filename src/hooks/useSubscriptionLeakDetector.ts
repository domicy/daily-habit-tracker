import {useEffect, useRef} from 'react';

/**
 * Development-mode hook that tracks component mount state and logs a warning
 * if a WatermelonDB (or any) subscription fires after unmount.
 *
 * Usage:
 *   const isMounted = useSubscriptionLeakDetector('DashboardScreen');
 *   // In your subscription callback:
 *   if (!isMounted()) {
 *     // Already logged by the hook — just bail out
 *     return;
 *   }
 *
 * In production builds this is a no-op that always returns true.
 */
export function useSubscriptionLeakDetector(
  componentName: string,
): () => boolean {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (!__DEV__) {
    // In production, always return true — zero overhead
    return () => true;
  }

  return () => {
    if (!mountedRef.current) {
      console.warn(
        `[SubscriptionLeakDetector] A subscription fired after ` +
          `"${componentName}" unmounted. This is a potential memory leak. ` +
          `Ensure all WatermelonDB subscriptions are unsubscribed in the ` +
          `cleanup function of useEffect.`,
      );
      return false;
    }
    return true;
  };
}
