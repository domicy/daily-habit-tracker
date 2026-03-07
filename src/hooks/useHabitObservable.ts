import {useState, useEffect, useRef} from 'react';
import type {Observable} from 'rxjs';

/**
 * Wraps a WatermelonDB observable with automatic subscription cleanup on unmount.
 * In development mode, logs a warning if the observable fires after the component
 * has unmounted — this helps catch memory leaks during development.
 *
 * @param observable$ - An RxJS observable (e.g. from WatermelonDB .observe())
 * @param initialValue - The initial value before the first emission
 * @returns The latest emitted value
 */
export function useHabitObservable<T>(
  observable$: Observable<T> | null | undefined,
  initialValue: T,
): T {
  const [value, setValue] = useState<T>(initialValue);
  const mountedRef = useRef(true);
  const componentNameRef = useRef<string>('');

  // Capture the component name for dev-mode warnings (via stack trace)
  useEffect(() => {
    if (__DEV__) {
      try {
        throw new Error('useHabitObservable caller');
      } catch (e: unknown) {
        const stack = (e as Error).stack ?? '';
        const callerLine = stack.split('\n')[2] ?? '';
        componentNameRef.current = callerLine.trim();
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!observable$) {
      return;
    }

    const subscription = observable$.subscribe({
      next: (nextValue: T) => {
        if (mountedRef.current) {
          setValue(nextValue);
        } else if (__DEV__) {
          console.warn(
            '[useHabitObservable] Subscription fired after unmount. ' +
              'This indicates a potential memory leak. ' +
              `Source: ${componentNameRef.current}`,
          );
        }
      },
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [observable$]);

  return value;
}
