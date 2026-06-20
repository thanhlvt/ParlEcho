import * as Sentry from '@sentry/react-native';

export function initSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enabled: !__DEV__,
  });
}

export function logError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
  Sentry.captureException(err, { tags: { context } });
}
