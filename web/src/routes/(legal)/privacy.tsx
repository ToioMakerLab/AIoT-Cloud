import { createFileRoute } from '@tanstack/react-router';
import Privacy from '@/features/legal/privacy';

export const Route = createFileRoute('/(legal)/privacy')({
  component: Privacy,
});
